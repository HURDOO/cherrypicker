import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { databasePath, db, sqlite } from '@/db';
import { brands, promotionCandidates, promotionOffers } from '@/db/schema';
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
import { reviewPromotionCandidate } from '@/lib/promotion-candidate-review-server';
import { productionPromotionState } from '@/lib/promotion-handover';

/*
 * Manual promotion release: benefits a session read by hand on the Mac (KT partner pages,
 * `manual: true` candidates) go to production after the one-time handover. Production approves
 * them with the same code as the admin review screen, under the production admin and the local
 * offer id, then reads each offer back and rolls everything back if it differs from the Mac.
 */

export const MANUAL_PROMOTION_RELEASE_SCHEMA_VERSION = 1;
export const MANUAL_PROMOTION_PROVIDERS = ['kt'] as const;
export type ManualPromotionProviderId = typeof MANUAL_PROMOTION_PROVIDERS[number];

type OfferRow = typeof promotionOffers.$inferSelect;
type CandidateRow = typeof promotionCandidates.$inferSelect;

// Set by the approval itself, or local-only, so they never travel.
const LOCAL_ONLY_DIFF_KEYS = ['auditOverride', 'sessionApproval', 'manualRelease'];

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const itemSchema = z.strictObject({
    offerId: z.string().regex(CATALOG_ID_PATTERN),
    sourceKey: z.string().min(1).max(500),
    sourceUrl: z.url().max(2_000),
    sourceHash: hex64,
    sourceTitle: z.string().max(500),
    rawContent: z.string().max(120_000),
    parsedOffer: z.record(z.string(), z.unknown()),
    diff: z.record(z.string(), z.unknown()),
    discoveredAt: z.iso.datetime(),
    approvalNote: z.string().max(500).nullable(),
    offer: z.record(z.string(), z.unknown()),
});
const bundleSchema = z.strictObject({
    schemaVersion: z.literal(MANUAL_PROMOTION_RELEASE_SCHEMA_VERSION),
    kind: z.literal('manual-promotion-release'),
    releaseId: z.uuid(),
    createdAt: z.iso.datetime(),
    sourceCommit: z.string().max(80).nullable(),
    providerId: z.enum(MANUAL_PROMOTION_PROVIDERS),
    migration: z.strictObject({
        count: z.number().int().nonnegative(),
        lastHash: z.string().max(200).nullable(),
    }),
    contentHash: hex64,
    items: z.array(itemSchema).max(2_000),
});

export type ManualPromotionReleaseItem = z.infer<typeof itemSchema>;
export type ManualPromotionReleaseBundle = z.infer<typeof bundleSchema>;

export interface ManualPromotionReleaseResult {
    status: 'applied' | 'unchanged' | 'dry-run';
    releaseId: string;
    providerId: string;
    contentHash: string;
    backup?: string;
    items: number;
    added: number;
    updated: number;
    unchanged: number;
    brandsAdded: number;
    warnings: string[];
}

/** An offer row without its timestamps, as both sides compare it. */
export function comparableOffer(row: OfferRow): Record<string, unknown> {
    const { createdAt, updatedAt, reviewedAt, publishedAt, collectedAt, ...rest } = row;
    void createdAt; void updatedAt; void reviewedAt; void publishedAt; void collectedAt;
    return JSON.parse(JSON.stringify(rest)) as Record<string, unknown>;
}

const sameJson = (left: unknown, right: unknown) => stableStringify(left) === stableStringify(right);

const travellingDiff = (diff: Record<string, unknown>) => Object.fromEntries(
    Object.entries(diff).filter(([key]) => !LOCAL_ONLY_DIFF_KEYS.includes(key)),
);

const sessionNote = (diff: Record<string, unknown>) => {
    const approval = diff.sessionApproval;
    return approval && typeof approval === 'object' && !Array.isArray(approval) &&
        typeof (approval as { note?: unknown }).note === 'string'
        ? (approval as { note: string }).note
        : null;
};

const isManual = (candidate: CandidateRow) =>
    candidate.diff.manual === true && typeof candidate.diff.sourceKey === 'string';

export const manualReleaseContentHash = (items: ManualPromotionReleaseItem[]) => contentHash(items);

/** Reads the Mac's approved manual benefits of one provider into a release bundle. */
export function buildManualPromotionRelease(providerId: ManualPromotionProviderId, options: {
    releaseId?: string;
    createdAt?: Date;
    sourceCommit?: string | null;
} = {}): ManualPromotionReleaseBundle {
    const latestBySourceKey = new Map<string, CandidateRow>();
    db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, providerId),
            eq(promotionCandidates.status, 'APPROVED'),
        ))
        .all()
        .filter(candidate => isManual(candidate) && candidate.linkedPromotionId)
        .forEach(candidate => {
            const key = candidate.diff.sourceKey as string;
            const current = latestBySourceKey.get(key);
            const time = (row: CandidateRow) => (row.reviewedAt ?? row.discoveredAt).getTime();
            if (!current || time(candidate) > time(current)) latestBySourceKey.set(key, candidate);
        });

    const items = [...latestBySourceKey.values()].flatMap(candidate => {
        const offer = db.select().from(promotionOffers)
            .where(eq(promotionOffers.id, candidate.linkedPromotionId!))
            .get();
        if (!offer || offer.status !== 'PUBLISHED') return [];
        return [{
            offerId: offer.id,
            sourceKey: candidate.diff.sourceKey as string,
            sourceUrl: candidate.sourceUrl,
            sourceHash: candidate.sourceHash,
            sourceTitle: candidate.sourceTitle,
            rawContent: candidate.rawContent,
            parsedOffer: candidate.parsedOffer,
            diff: travellingDiff(candidate.diff),
            discoveredAt: candidate.discoveredAt.toISOString(),
            approvalNote: sessionNote(candidate.diff),
            offer: comparableOffer(offer),
        } satisfies ManualPromotionReleaseItem];
    }).sort((left, right) => left.offerId.localeCompare(right.offerId));

    return {
        schemaVersion: MANUAL_PROMOTION_RELEASE_SCHEMA_VERSION,
        kind: 'manual-promotion-release',
        releaseId: options.releaseId ?? randomUUID(),
        createdAt: (options.createdAt ?? new Date()).toISOString(),
        sourceCommit: options.sourceCommit ?? null,
        providerId,
        migration: readMigrationTag(sqlite),
        contentHash: manualReleaseContentHash(items),
        items,
    };
}

export function parseManualPromotionRelease(value: unknown): ManualPromotionReleaseBundle {
    const parsed = bundleSchema.safeParse(value);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new HttpError(400, `릴리스 형식 오류: ${issue?.path.join('.') || '본문'} ${issue?.message ?? ''}`.trim());
    }
    const bundle = parsed.data;
    const duplicates = (values: string[]) => values.length !== new Set(values).size;
    if (
        duplicates(bundle.items.map(item => item.offerId)) ||
        duplicates(bundle.items.map(item => item.sourceKey))
    ) {
        throw new HttpError(400, '릴리스에 중복된 혜택이 있습니다.');
    }
    bundle.items.forEach(item => {
        if (
            item.diff.manual !== true ||
            item.diff.sourceKey !== item.sourceKey ||
            item.parsedOffer.providerId !== bundle.providerId ||
            item.offer.providerId !== bundle.providerId ||
            item.offer.id !== item.offerId ||
            LOCAL_ONLY_DIFF_KEYS.some(key => key in item.diff)
        ) {
            throw new HttpError(400, `수동 등록 혜택이 아니거나 제공자가 다릅니다: ${item.sourceTitle}`);
        }
    });
    if (manualReleaseContentHash(bundle.items) !== bundle.contentHash) {
        throw new HttpError(400, '릴리스 내용 hash가 맞지 않습니다.');
    }
    return bundle;
}

function recordRelease(result: ManualPromotionReleaseResult, appliedAt: Date) {
    if (databasePath === ':memory:') return;
    const directory = path.join(syncDataDirectory(databasePath), 'catalog-sync');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    appendFileSync(
        path.join(directory, 'manual-promotion-releases.jsonl'),
        `${JSON.stringify({ appliedAt: appliedAt.toISOString(), ...result })}\n`,
        { mode: 0o600 },
    );
}

class DryRunRollback extends Error {}

export async function applyManualPromotionRelease(
    bundle: ManualPromotionReleaseBundle,
    options: {
        now?: Date;
        reviewerId?: string | null;
        backup?: (label: 'pre-manual-promotion-release') => Promise<string | undefined>;
        localMigration?: MigrationTag;
        handoverCompleted?: boolean;
        dryRun?: boolean;
    } = {},
): Promise<ManualPromotionReleaseResult> {
    const now = options.now ?? new Date();
    const localMigration = options.localMigration ?? readMigrationTag(sqlite);
    if (!sameJson(localMigration, bundle.migration)) {
        throw new HttpError(409, '운영과 릴리스의 DB migration이 다릅니다. 같은 버전을 먼저 배포하세요.');
    }
    const handoverCompleted = options.handoverCompleted ??
        Boolean(productionPromotionState(sqlite, databasePath).completed);
    if (!handoverCompleted) {
        throw new HttpError(409, '프로모션 이관 전입니다. 이관을 먼저 마쳐야 수동 혜택을 반영할 수 있습니다.');
    }
    const reviewerId = options.reviewerId ?? null;
    if (!reviewerId) {
        throw new HttpError(409, '운영 관리자 계정이 없어 혜택을 승인할 수 없습니다.');
    }

    const warnings: string[] = [];
    const pending: ManualPromotionReleaseItem[] = [];
    let unchanged = 0;
    bundle.items.forEach(item => {
        const sameSource = db.select().from(promotionCandidates)
            .where(and(
                eq(promotionCandidates.providerId, bundle.providerId),
                eq(promotionCandidates.sourceUrl, item.sourceUrl),
                eq(promotionCandidates.sourceHash, item.sourceHash),
            ))
            .get();
        if (sameSource) {
            const offer = sameSource.linkedPromotionId
                ? db.select().from(promotionOffers).where(eq(promotionOffers.id, sameSource.linkedPromotionId)).get()
                : undefined;
            if (
                sameSource.status === 'APPROVED' &&
                sameSource.linkedPromotionId === item.offerId &&
                offer && sameJson(comparableOffer(offer), item.offer)
            ) {
                unchanged += 1;
            } else {
                warnings.push(`운영에서 바뀐 혜택이라 건너뜀: ${item.sourceTitle}`);
            }
            return;
        }
        const existing = db.select().from(promotionOffers).where(eq(promotionOffers.id, item.offerId)).get();
        if (existing) {
            const manuallyRegistered = db.select().from(promotionCandidates)
                .where(eq(promotionCandidates.linkedPromotionId, item.offerId))
                .all()
                .some(candidate => candidate.providerId === bundle.providerId && isManual(candidate));
            if (existing.providerId !== bundle.providerId || !manuallyRegistered) {
                throw new HttpError(409, `운영의 다른 혜택과 ID가 겹칩니다: ${item.sourceTitle}`);
            }
        }
        pending.push(item);
    });

    const productionBrandIds = new Set(db.select({ id: brands.id }).from(brands).all().map(row => row.id));
    const discoveredBrandIds = new Set(pending.flatMap(item => {
        const brand = item.diff.discoveredBrand;
        return brand && typeof brand === 'object' && !Array.isArray(brand) &&
            typeof (brand as { id?: unknown }).id === 'string'
            ? [(brand as { id: string }).id]
            : [];
    }));
    const missingBrands = [...new Set(pending.flatMap(item =>
        Array.isArray(item.offer.brandIds) ? item.offer.brandIds as string[] : []))]
        .filter(brandId => !productionBrandIds.has(brandId) && !discoveredBrandIds.has(brandId));
    if (missingBrands.length > 0) {
        throw new HttpError(409, `운영에 없는 브랜드를 가리켜 반영하지 않았습니다: ${missingBrands.slice(0, 5).join(', ')}`);
    }
    const brandsAdded = [...discoveredBrandIds].filter(brandId => !productionBrandIds.has(brandId)).length;

    const result: ManualPromotionReleaseResult = {
        status: 'unchanged',
        releaseId: bundle.releaseId,
        providerId: bundle.providerId,
        contentHash: bundle.contentHash,
        items: bundle.items.length,
        added: pending.filter(item =>
            !db.select({ id: promotionOffers.id }).from(promotionOffers)
                .where(eq(promotionOffers.id, item.offerId)).get()).length,
        updated: 0,
        unchanged,
        brandsAdded,
        warnings,
    };
    result.updated = pending.length - result.added;
    if (pending.length === 0) return result;

    const backup = options.dryRun
        ? undefined
        : options.backup
            ? await options.backup('pre-manual-promotion-release')
            : await backupLiveDatabase(sqlite, databasePath, 'pre-manual-promotion-release', now);

    try {
        db.transaction(() => {
            pending.forEach(item => {
                const candidateId = randomUUID();
                db.insert(promotionCandidates).values({
                    id: candidateId,
                    providerId: bundle.providerId,
                    sourceUrl: item.sourceUrl,
                    sourceHash: item.sourceHash,
                    sourceTitle: item.sourceTitle,
                    rawContent: item.rawContent,
                    parsedOffer: item.parsedOffer,
                    diff: {
                        ...item.diff,
                        manualRelease: { releaseId: bundle.releaseId, sourceCommit: bundle.sourceCommit },
                    },
                    status: 'PENDING',
                    discoveredAt: new Date(item.discoveredAt),
                }).run();
                reviewPromotionCandidate(
                    candidateId,
                    'APPROVED',
                    reviewerId,
                    undefined,
                    false,
                    item.approvalNote ?? undefined,
                    item.offerId,
                );
            });

            const foreignKeyProblems = sqlite.pragma('foreign_key_check') as unknown[];
            if (foreignKeyProblems.length > 0) {
                throw new HttpError(409, `반영 후 연결 오류 ${foreignKeyProblems.length}건이 있어 되돌렸습니다.`);
            }
            const different = pending.filter(item => {
                const row = db.select().from(promotionOffers).where(eq(promotionOffers.id, item.offerId)).get();
                return !row || !sameJson(comparableOffer(row), item.offer);
            });
            if (different.length > 0) {
                throw new HttpError(
                    500,
                    `반영 결과가 로컬 혜택과 달라 되돌렸습니다: ${different.slice(0, 3).map(item => item.sourceTitle).join(', ')}`,
                );
            }
            if (options.dryRun) throw new DryRunRollback();
        });
    } catch (error) {
        if (error instanceof DryRunRollback) return { ...result, status: 'dry-run' };
        throw error;
    }

    const applied: ManualPromotionReleaseResult = { ...result, status: 'applied', backup };
    recordRelease(applied, now);
    return applied;
}
