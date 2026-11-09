import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { databasePath, db, sqlite } from '@/db';
import {
    benefitRules,
    brands,
    cardBenefitRevisions,
    cardBenefitSourceConfigs,
    cards,
    categories,
} from '@/db/schema';
import {
    backupLiveDatabase,
    CATALOG_ID_PATTERN,
    contentHash,
    readMigrationTag,
    stableStringify,
    syncDataDirectory,
    type MigrationTag,
} from '@/lib/catalog-sync-common';
import { HttpError } from '@/lib/http-error';
import type { CardBenefitRevisionSnapshot } from '@/types';

/*
 * Card catalog release: the reviewed card catalog on the Mac goes to production as one JSON
 * bundle. Only the public part moves (categories, system brands, system cards with their rules,
 * source settings and active revision). Accounts, workspaces, original documents, candidates
 * and promotions never travel in it.
 */

export const CATALOG_RELEASE_SCHEMA_VERSION = 1;
const SHRINK_GUARD_RATIO = 0.8;
const SHRINK_GUARD_MIN_CARDS = 10;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const id = z.string().regex(CATALOG_ID_PATTERN);
const json = z.unknown();
const jsonObject = z.record(z.string(), z.unknown());

const categorySchema = z.strictObject({
    id,
    name: z.string().min(1).max(100),
    sortOrder: z.number().int(),
});

const brandSchema = z.strictObject({
    id,
    name: z.string().min(1).max(200),
    categoryId: id,
    iconName: z.string().max(100).nullable(),
    sortOrder: z.number().int(),
    discoveryVisibility: z.enum(['BROWSE', 'SEARCH_ONLY', 'AUTO']),
});

const cardSchema = z.strictObject({
    id,
    name: z.string().min(1).max(200),
    company: z.string().min(1).max(100),
    color: z.string().max(100),
    limitTable: z.array(json),
    network: z.string().max(50).nullable(),
    performancePolicy: jsonObject.nullable(),
    searchAliases: z.array(z.string().max(200)).nullable(),
    catalogStatus: z.enum(['DRAFT', 'PUBLISHED']),
    issueStatus: z.enum(['ACTIVE', 'DISCONTINUED']),
    issuerProductCode: z.string().max(200).nullable(),
    catalogCaveat: z.string().max(2_000).nullable(),
});

const ruleSchema = z.strictObject({
    id,
    category: id.nullable(),
    includedBrands: z.array(id),
    excludedBrands: z.array(id),
    platformType: z.enum(['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE']),
    sharedGroupId: z.string().max(200).nullable(),
    usesCardLimit: z.boolean(),
    description: z.string().max(2_000),
    detail: z.string().max(20_000),
    condition: jsonObject,
    action: jsonObject,
    limitConfig: jsonObject,
    programVersion: z.number().int().nullable(),
    program: jsonObject.nullable(),
});

const sourceConfigSchema = z.strictObject({
    id,
    label: z.string().max(500),
    sourceUrl: z.url({ protocol: /^https$/ }).max(2_000),
    sourceKind: z.enum(['PRODUCT_PAGE', 'PRODUCT_GUIDE_PDF', 'NOTICE']),
    format: z.enum(['html', 'pdf']),
    allowedHosts: z.array(z.string().max(200)),
    required: z.boolean(),
    candidateRole: z.enum(['PRIMARY', 'SUPPORTING']),
    discoverLinkedPdfs: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int(),
});

const revisionSchema = z.strictObject({
    sourceRevision: z.number().int().positive(),
    publishedAt: z.iso.datetime(),
    reviewed: z.boolean(),
    snapshot: z.looseObject({
        card: jsonObject,
        rules: z.array(json),
    }),
});

const cardEntrySchema = z.strictObject({
    card: cardSchema,
    rules: z.array(ruleSchema),
    sourceConfigs: z.array(sourceConfigSchema),
    activeRevision: revisionSchema.nullable(),
});

const contentSchema = z.strictObject({
    categories: z.array(categorySchema),
    brands: z.array(brandSchema),
    cards: z.array(cardEntrySchema),
});

const bundleSchema = z.strictObject({
    schemaVersion: z.literal(CATALOG_RELEASE_SCHEMA_VERSION),
    releaseId: z.uuid(),
    createdAt: z.iso.datetime(),
    sourceCommit: z.string().regex(/^[0-9a-f]{7,40}$/).nullable(),
    migration: z.strictObject({
        count: z.number().int().nonnegative(),
        lastHash: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    }),
    allowShrink: z.boolean(),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/),
    content: contentSchema,
});

export type CatalogReleaseContent = z.infer<typeof contentSchema>;
export type CatalogReleaseCardEntry = z.infer<typeof cardEntrySchema>;
export type CatalogReleaseBundle = z.infer<typeof bundleSchema>;
type ReleaseRevision = NonNullable<CatalogReleaseCardEntry['activeRevision']>;

type ReleasedSnapshot = CardBenefitRevisionSnapshot;

const byId = <T extends { id: string }>(items: T[]) =>
    [...items].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

/** Sorted by id everywhere, so the hash does not depend on query order. */
export function normalizeReleaseContent(content: CatalogReleaseContent): CatalogReleaseContent {
    return {
        categories: byId(content.categories),
        brands: byId(content.brands),
        cards: [...content.cards]
            .map(entry => ({
                ...entry,
                rules: byId(entry.rules),
                sourceConfigs: byId(entry.sourceConfigs),
            }))
            .sort((left, right) => (
                left.card.id < right.card.id ? -1 : left.card.id > right.card.id ? 1 : 0
            )),
    };
}

export const releaseContentHash = (content: CatalogReleaseContent) =>
    contentHash(normalizeReleaseContent(content));

const withoutRelease = (snapshot: ReleasedSnapshot) => {
    const { release, ...rest } = snapshot;
    void release;
    return rest;
};

/** The catalog as a release sees it: what the bundle carries, read back the same way on both ends. */
function readReleaseContent(tx: Transaction): CatalogReleaseContent {
    const categoryRows = tx.select().from(categories).where(isNull(categories.userId)).all();
    const brandRows = tx.select().from(brands).where(isNull(brands.userId)).all();
    const cardRows = tx.select().from(cards).where(isNull(cards.userId)).all();
    const systemCardIds = new Set(cardRows.map(row => row.id));
    const ruleRows = tx.select().from(benefitRules).where(isNull(benefitRules.userId)).all();
    const sourceRows = tx.select().from(cardBenefitSourceConfigs).all()
        .filter(row => systemCardIds.has(row.cardId));
    const revisionRows = tx.select().from(cardBenefitRevisions)
        .where(eq(cardBenefitRevisions.isActive, true))
        .orderBy(desc(cardBenefitRevisions.revision))
        .all();

    const content: CatalogReleaseContent = {
        categories: categoryRows.map(row => ({ id: row.id, name: row.name, sortOrder: row.sortOrder })),
        brands: brandRows.map(row => ({
            id: row.id,
            name: row.name,
            categoryId: row.categoryId,
            iconName: row.iconName,
            sortOrder: row.sortOrder,
            discoveryVisibility: row.discoveryVisibility,
        })),
        cards: cardRows.map(row => {
            const revision = revisionRows.find(item => item.cardId === row.id);
            const snapshot = revision?.snapshot as ReleasedSnapshot | undefined;
            return {
                card: {
                    id: row.id,
                    name: row.name,
                    company: row.company,
                    color: row.color,
                    limitTable: row.limitTable,
                    network: row.network ?? null,
                    performancePolicy: (row.performancePolicy ?? null) as Record<string, unknown> | null,
                    searchAliases: row.searchAliases ?? null,
                    catalogStatus: row.catalogStatus,
                    issueStatus: row.issueStatus,
                    issuerProductCode: row.issuerProductCode,
                    catalogCaveat: row.catalogCaveat,
                },
                rules: ruleRows
                    .filter(rule => rule.cardId === row.id)
                    .map(rule => ({
                        id: rule.id,
                        category: rule.category,
                        includedBrands: rule.includedBrands,
                        excludedBrands: rule.excludedBrands,
                        platformType: rule.platformType,
                        sharedGroupId: rule.sharedGroupId,
                        usesCardLimit: rule.usesCardLimit,
                        description: rule.description,
                        detail: rule.detail,
                        condition: rule.condition as unknown as Record<string, unknown>,
                        action: rule.action as unknown as Record<string, unknown>,
                        limitConfig: rule.limitConfig as unknown as Record<string, unknown>,
                        programVersion: rule.programVersion,
                        program: (rule.program ?? null) as Record<string, unknown> | null,
                    })),
                sourceConfigs: sourceRows
                    .filter(source => source.cardId === row.id)
                    .map(source => ({
                        id: source.id,
                        label: source.label,
                        sourceUrl: source.sourceUrl,
                        sourceKind: source.sourceKind,
                        format: source.format,
                        allowedHosts: source.allowedHosts,
                        required: source.required,
                        candidateRole: source.candidateRole,
                        discoverLinkedPdfs: source.discoverLinkedPdfs,
                        isActive: source.isActive,
                        sortOrder: source.sortOrder,
                    })),
                activeRevision: revision && snapshot
                    ? {
                        sourceRevision: snapshot.release?.sourceRevision ?? revision.revision,
                        publishedAt: revision.publishedAt.toISOString(),
                        reviewed: Boolean(revision.candidateId) || snapshot.release?.reviewed === true,
                        snapshot: withoutRelease(snapshot) as unknown as ReleaseRevision['snapshot'],
                    }
                    : null,
            };
        }),
    };
    // Through JSON once so dates, undefined and key order match what travels over HTTP.
    return normalizeReleaseContent(JSON.parse(stableStringify(content)) as CatalogReleaseContent);
}

export function readCatalogReleaseContent(): CatalogReleaseContent {
    return db.transaction(tx => readReleaseContent(tx));
}

export function buildCatalogReleaseBundle(options: {
    releaseId?: string;
    createdAt?: Date;
    sourceCommit?: string | null;
    allowShrink?: boolean;
} = {}): CatalogReleaseBundle {
    const content = readCatalogReleaseContent();
    return {
        schemaVersion: CATALOG_RELEASE_SCHEMA_VERSION,
        releaseId: options.releaseId ?? randomUUID(),
        createdAt: (options.createdAt ?? new Date()).toISOString(),
        sourceCommit: options.sourceCommit ?? null,
        migration: readMigrationTag(sqlite),
        allowShrink: options.allowShrink ?? false,
        contentHash: releaseContentHash(content),
        content,
    };
}

export function parseCatalogReleaseBundle(value: unknown): CatalogReleaseBundle {
    const parsed = bundleSchema.safeParse(value);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, `릴리스 형식 오류: ${issue?.path.join('.') || '본문'} ${issue?.message ?? ''}`.trim());
    }
    const bundle = parsed.data;
    const duplicates = (ids: string[]) => ids.length !== new Set(ids).size;
    if (
        duplicates(bundle.content.categories.map(item => item.id)) ||
        duplicates(bundle.content.brands.map(item => item.id)) ||
        duplicates(bundle.content.cards.map(item => item.card.id)) ||
        duplicates(bundle.content.cards.flatMap(item => item.rules.map(rule => rule.id))) ||
        duplicates(bundle.content.cards.flatMap(item => item.sourceConfigs.map(source => source.id)))
    ) {
        throw new HttpError(400, '릴리스에 중복된 ID가 있습니다.');
    }
    if (releaseContentHash(bundle.content) !== bundle.contentHash) {
        throw new HttpError(400, '릴리스 내용 hash가 맞지 않습니다.');
    }
    return { ...bundle, content: normalizeReleaseContent(bundle.content) };
}

export interface CatalogReleaseResult {
    status: 'applied' | 'unchanged' | 'dry-run';
    releaseId: string;
    contentHash: string;
    backup?: string;
    categories: { added: number; updated: number };
    brands: { added: number; updated: number };
    cards: { added: number; updated: number; unchanged: number; hidden: number };
    revisions: number;
    publishedCards: number;
    warnings: string[];
}

const sameJson = (left: unknown, right: unknown) => stableStringify(left) === stableStringify(right);

function assertNoUserOwnedIds(bundle: CatalogReleaseBundle) {
    const cardIds = bundle.content.cards.map(entry => entry.card.id);
    const ruleIds = bundle.content.cards.flatMap(entry => entry.rules.map(rule => rule.id));
    const checks: Array<[string, number]> = [
        ['카테고리', bundle.content.categories.length && db.select({ id: categories.id }).from(categories)
            .where(and(inArray(categories.id, bundle.content.categories.map(item => item.id)), isNotNull(categories.userId)))
            .all().length],
        ['브랜드', bundle.content.brands.length && db.select({ id: brands.id }).from(brands)
            .where(and(inArray(brands.id, bundle.content.brands.map(item => item.id)), isNotNull(brands.userId)))
            .all().length],
        ['카드', cardIds.length && db.select({ id: cards.id }).from(cards)
            .where(and(inArray(cards.id, cardIds), isNotNull(cards.userId)))
            .all().length],
        ['규칙', ruleIds.length && db.select({ id: benefitRules.id }).from(benefitRules)
            .where(and(inArray(benefitRules.id, ruleIds), isNotNull(benefitRules.userId)))
            .all().length],
    ];
    const clash = checks.find(([, count]) => count > 0);
    if (clash) throw new HttpError(409, `${clash[0]} ID가 사용자 데이터와 겹쳐 반영할 수 없습니다.`);
}

function referenceWarnings(content: CatalogReleaseContent, knownBrandIds: Set<string>) {
    const missing = new Set<string>();
    content.cards.forEach(entry => entry.rules.forEach(rule => {
        [...rule.includedBrands, ...rule.excludedBrands].forEach(brandId => {
            if (!knownBrandIds.has(brandId)) missing.add(brandId);
        });
    }));
    return missing.size > 0
        ? [`규칙이 가리키는 브랜드 ${missing.size}개가 카탈로그에 없습니다: ${[...missing].slice(0, 10).join(', ')}`]
        : [];
}

function applyCardEntry(
    tx: Transaction,
    entry: CatalogReleaseCardEntry,
    current: CatalogReleaseCardEntry | undefined,
    context: { releaseId: string; reviewerId: string | null; now: Date },
) {
    const cardId = entry.card.id;
    const { id: ignoredCardId, ...cardFields } = entry.card;
    void ignoredCardId;
    const cardValues = cardFields as unknown as Omit<typeof cards.$inferInsert, 'id'>;
    tx.insert(cards)
        .values({ id: cardId, ...cardValues, userId: null })
        .onConflictDoUpdate({ target: cards.id, set: { ...cardValues, userId: null } })
        .run();

    const ruleIds = entry.rules.map(rule => rule.id);
    tx.delete(benefitRules)
        .where(and(
            eq(benefitRules.cardId, cardId),
            isNull(benefitRules.userId),
            ...(ruleIds.length > 0 ? [notInArray(benefitRules.id, ruleIds)] : []),
        ))
        .run();
    entry.rules.forEach(rule => {
        const { id: ruleId, ...ruleFields } = rule;
        const values = {
            ...ruleFields,
            cardId,
            userId: null,
        } as unknown as Omit<typeof benefitRules.$inferInsert, 'id'>;
        tx.insert(benefitRules)
            .values({ id: ruleId, ...values })
            .onConflictDoUpdate({ target: benefitRules.id, set: values })
            .run();
    });

    const sourceIds = entry.sourceConfigs.map(source => source.id);
    tx.delete(cardBenefitSourceConfigs)
        .where(and(
            eq(cardBenefitSourceConfigs.cardId, cardId),
            ...(sourceIds.length > 0 ? [notInArray(cardBenefitSourceConfigs.id, sourceIds)] : []),
        ))
        .run();
    entry.sourceConfigs.forEach(source => {
        const { id: sourceId, ...sourceFields } = source;
        tx.insert(cardBenefitSourceConfigs)
            .values({ id: sourceId, ...sourceFields, cardId, createdAt: context.now, updatedAt: context.now })
            .onConflictDoUpdate({
                target: cardBenefitSourceConfigs.id,
                set: { ...sourceFields, cardId, updatedAt: context.now },
            })
            .run();
    });

    if (sameJson(entry.activeRevision, current?.activeRevision ?? null)) return false;
    tx.update(cardBenefitRevisions)
        .set({ isActive: false })
        .where(eq(cardBenefitRevisions.cardId, cardId))
        .run();
    if (!entry.activeRevision) return false;
    const latest = tx.select({ revision: cardBenefitRevisions.revision })
        .from(cardBenefitRevisions)
        .where(eq(cardBenefitRevisions.cardId, cardId))
        .orderBy(desc(cardBenefitRevisions.revision))
        .get();
    const snapshot: ReleasedSnapshot = {
        ...(entry.activeRevision.snapshot as unknown as CardBenefitRevisionSnapshot),
        release: {
            releaseId: context.releaseId,
            sourceRevision: entry.activeRevision.sourceRevision,
            reviewed: entry.activeRevision.reviewed,
        },
    };
    tx.insert(cardBenefitRevisions).values({
        id: randomUUID(),
        cardId,
        revision: (latest?.revision ?? 0) + 1,
        candidateId: null,
        documentId: null,
        snapshot,
        isActive: true,
        reviewerId: context.reviewerId,
        publishedAt: new Date(entry.activeRevision.publishedAt),
    }).run();
    return true;
}

const filterToRelease = (
    content: CatalogReleaseContent,
    release: CatalogReleaseContent,
): CatalogReleaseContent => {
    const categoryIds = new Set(release.categories.map(item => item.id));
    const brandIds = new Set(release.brands.map(item => item.id));
    const cardIds = new Set(release.cards.map(item => item.card.id));
    return normalizeReleaseContent({
        categories: content.categories.filter(item => categoryIds.has(item.id)),
        brands: content.brands.filter(item => brandIds.has(item.id)),
        cards: content.cards.filter(item => cardIds.has(item.card.id)),
    });
};

function recordRelease(result: CatalogReleaseResult, appliedAt: Date) {
    if (databasePath === ':memory:') return;
    const directory = path.join(syncDataDirectory(databasePath), 'catalog-sync');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    appendFileSync(
        path.join(directory, 'card-releases.jsonl'),
        `${JSON.stringify({ appliedAt: appliedAt.toISOString(), ...result })}\n`,
        { mode: 0o600 },
    );
}

export async function applyCatalogRelease(
    bundle: CatalogReleaseBundle,
    options: {
        now?: Date;
        reviewerId?: string | null;
        backup?: (label: 'pre-catalog-release') => Promise<string | undefined>;
        localMigration?: MigrationTag;
        dryRun?: boolean;
    } = {},
): Promise<CatalogReleaseResult> {
    const now = options.now ?? new Date();
    const localMigration = options.localMigration ?? readMigrationTag(sqlite);
    if (!sameJson(localMigration, bundle.migration)) {
        throw new HttpError(409, '운영과 릴리스의 DB migration이 다릅니다. 같은 버전을 먼저 배포하세요.');
    }
    assertNoUserOwnedIds(bundle);

    const release = bundle.content;
    const before = readCatalogReleaseContent();
    const beforeCards = new Map(before.cards.map(entry => [entry.card.id, entry]));
    const beforeBrands = new Map(before.brands.map(item => [item.id, item]));
    const beforeCategories = new Map(before.categories.map(item => [item.id, item]));
    const releaseCardIds = new Set(release.cards.map(entry => entry.card.id));

    const changedCategories = release.categories.filter(item => !sameJson(item, beforeCategories.get(item.id)));
    const changedBrands = release.brands.filter(item => !sameJson(item, beforeBrands.get(item.id)));
    const changedCards = release.cards.filter(entry => !sameJson(entry, beforeCards.get(entry.card.id)));
    const hiddenCards = before.cards.filter(entry =>
        !releaseCardIds.has(entry.card.id) && entry.card.catalogStatus === 'PUBLISHED');

    const publishedBefore = before.cards.filter(entry => entry.card.catalogStatus === 'PUBLISHED').length;
    const publishedAfter = release.cards.filter(entry => entry.card.catalogStatus === 'PUBLISHED').length;
    const knownBrandIds = new Set([...before.brands, ...release.brands].map(item => item.id));
    const result: CatalogReleaseResult = {
        status: 'unchanged',
        releaseId: bundle.releaseId,
        contentHash: bundle.contentHash,
        categories: {
            added: changedCategories.filter(item => !beforeCategories.has(item.id)).length,
            updated: changedCategories.filter(item => beforeCategories.has(item.id)).length,
        },
        brands: {
            added: changedBrands.filter(item => !beforeBrands.has(item.id)).length,
            updated: changedBrands.filter(item => beforeBrands.has(item.id)).length,
        },
        cards: {
            added: changedCards.filter(entry => !beforeCards.has(entry.card.id)).length,
            updated: changedCards.filter(entry => beforeCards.has(entry.card.id)).length,
            unchanged: release.cards.length - changedCards.length,
            hidden: hiddenCards.length,
        },
        revisions: 0,
        publishedCards: publishedAfter,
        warnings: referenceWarnings(release, knownBrandIds),
    };

    if (changedCategories.length + changedBrands.length + changedCards.length + hiddenCards.length === 0) {
        return result;
    }
    if (
        !bundle.allowShrink &&
        publishedBefore >= SHRINK_GUARD_MIN_CARDS &&
        publishedAfter < publishedBefore * SHRINK_GUARD_RATIO
    ) {
        throw new HttpError(
            409,
            `게시 카드가 ${publishedBefore}장에서 ${publishedAfter}장으로 크게 줄어 반영하지 않았습니다.`,
        );
    }
    if (options.dryRun) return { ...result, status: 'dry-run' };

    const backup = options.backup
        ? await options.backup('pre-catalog-release')
        : await backupLiveDatabase(sqlite, databasePath, 'pre-catalog-release', now);
    const reviewerId = options.reviewerId ?? null;
    let revisions = 0;

    db.transaction(tx => {
        changedCategories.forEach(item => {
            tx.insert(categories)
                .values({ ...item, userId: null })
                .onConflictDoUpdate({
                    target: categories.id,
                    set: { name: item.name, sortOrder: item.sortOrder, userId: null },
                })
                .run();
        });
        changedBrands.forEach(item => {
            const { id: brandId, ...fields } = item;
            tx.insert(brands)
                .values({ id: brandId, ...fields, userId: null })
                .onConflictDoUpdate({ target: brands.id, set: { ...fields, userId: null } })
                .run();
        });
        changedCards.forEach(entry => {
            if (applyCardEntry(tx, entry, beforeCards.get(entry.card.id), {
                releaseId: bundle.releaseId,
                reviewerId,
                now,
            })) revisions += 1;
        });
        hiddenCards.forEach(entry => {
            tx.update(cards)
                .set({ catalogStatus: 'DRAFT' })
                .where(and(eq(cards.id, entry.card.id), isNull(cards.userId)))
                .run();
        });

        const foreignKeyProblems = sqlite.pragma('foreign_key_check') as unknown[];
        if (foreignKeyProblems.length > 0) {
            throw new HttpError(409, `반영 후 연결 오류 ${foreignKeyProblems.length}건이 있어 되돌렸습니다.`);
        }
        const readBack = filterToRelease(readReleaseContent(tx), release);
        if (releaseContentHash(readBack) !== bundle.contentHash) {
            throw new HttpError(500, '반영 결과가 릴리스와 달라 되돌렸습니다.');
        }
        const stillPublished = tx.select({ id: cards.id }).from(cards)
            .where(and(isNull(cards.userId), eq(cards.catalogStatus, 'PUBLISHED')))
            .all()
            .filter(row => !releaseCardIds.has(row.id));
        if (stillPublished.length > 0) {
            throw new HttpError(500, '릴리스에 없는 카드가 게시된 채 남아 되돌렸습니다.');
        }
    });

    const applied: CatalogReleaseResult = { ...result, status: 'applied', backup, revisions };
    recordRelease(applied, now);
    return applied;
}

/** Hash of what this server holds for the cards a release names, for a dry run or status check. */
export function currentReleaseScopeHash(release: CatalogReleaseContent) {
    return releaseContentHash(filterToRelease(readCatalogReleaseContent(), release));
}

export const catalogReleasePublishedCardCount = () => db.select({ id: cards.id }).from(cards)
    .where(and(isNull(cards.userId), eq(cards.catalogStatus, 'PUBLISHED')))
    .orderBy(asc(cards.id))
    .all()
    .length;
