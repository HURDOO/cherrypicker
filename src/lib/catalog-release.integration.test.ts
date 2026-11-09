import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { CatalogReleaseBundle, CatalogReleaseCardEntry } from './catalog-release';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const testDb = drizzle(sqlite, { schema });
let release: typeof import('./catalog-release');

const applyMigrations = () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        sqlite.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    sqlite.pragma('foreign_keys = ON');
};

const noBackup = async () => 'test-backup.db';
const migration = { count: 0, lastHash: null };

const rule = (id: string, brandId: string, value = 10) => ({
    id,
    category: null,
    includedBrands: [brandId],
    excludedBrands: [],
    platformType: 'ALL' as const,
    sharedGroupId: null,
    usesCardLimit: true,
    description: `${brandId} ${value}% 할인`,
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value },
    limitConfig: {},
    programVersion: null,
    program: null,
});

const cardEntry = (
    id: string,
    rules: ReturnType<typeof rule>[],
    overrides: Partial<CatalogReleaseCardEntry['card']> = {},
): CatalogReleaseCardEntry => {
    const card = {
        id,
        name: `${id} 카드`,
        company: '테스트카드',
        color: '#000000',
        limitTable: [],
        network: null,
        performancePolicy: null,
        searchAliases: null,
        catalogStatus: 'PUBLISHED' as const,
        issueStatus: 'ACTIVE' as const,
        issuerProductCode: null,
        catalogCaveat: null,
        ...overrides,
    };
    return {
        card,
        rules,
        sourceConfigs: [{
            id: `${id}-source`,
            label: '상품 페이지',
            sourceUrl: `https://card.example.com/${id}`,
            sourceKind: 'PRODUCT_PAGE',
            format: 'html',
            allowedHosts: ['card.example.com'],
            required: true,
            candidateRole: 'PRIMARY',
            discoverLinkedPdfs: false,
            isActive: true,
            sortOrder: 0,
        }],
        activeRevision: {
            sourceRevision: 3,
            publishedAt: '2026-10-19T00:00:00.000Z',
            reviewed: true,
            snapshot: { card: { ...card }, rules: rules.map(item => ({ ...item, cardId: id })) },
        },
    };
};

const bundleFrom = (
    cards: CatalogReleaseCardEntry[],
    options: { allowShrink?: boolean; brands?: string[] } = {},
): CatalogReleaseBundle => {
    const content = {
        categories: [{ id: 'cafe', name: '카페', sortOrder: 0 }],
        brands: (options.brands ?? ['starbucks', 'twosome']).map((brandId, sortOrder) => ({
            id: brandId,
            name: brandId,
            categoryId: 'cafe',
            iconName: null,
            sortOrder,
            discoveryVisibility: 'BROWSE' as const,
        })),
        cards,
    };
    return {
        schemaVersion: 1,
        releaseId: crypto.randomUUID(),
        createdAt: '2026-11-10T00:00:00.000Z',
        sourceCommit: null,
        migration,
        allowShrink: options.allowShrink ?? false,
        contentHash: release.releaseContentHash(content),
        content,
    };
};

const seedProduction = () => {
    sqlite.exec(`
        delete from card_benefit_revisions; delete from card_benefit_source_configs;
        delete from benefit_rules; delete from cards; delete from brands; delete from categories;
        delete from "user";
    `);
    testDb.insert(schema.user).values({ id: 'owner', name: 'owner', email: 'owner@example.com' }).run();
    testDb.insert(schema.categories).values([{ id: 'cafe', name: '카페', sortOrder: 0 }]).run();
    testDb.insert(schema.brands).values([
        { id: 'starbucks', name: '스타벅스(옛 이름)', categoryId: 'cafe', sortOrder: 0 },
        { id: 'official_gooddeal_only', name: '굿딜 전용', categoryId: 'cafe', sortOrder: 9, discoveryVisibility: 'AUTO' },
    ]).run();
    testDb.insert(schema.cards).values([
        { id: 'card_a', name: '옛 카드 A', company: '테스트카드', color: '#111111', limitTable: [] },
        { id: 'card_z', name: '운영에만 있는 카드', company: '테스트카드', color: '#222222', limitTable: [] },
        { id: 'user_card', userId: 'owner', name: '내 카드', company: '내 카드사', color: '#333333', limitTable: [] },
    ]).run();
    testDb.insert(schema.benefitRules).values([
        { ...rule('card_a_old', 'starbucks', 5), cardId: 'card_a', userId: null },
        { ...rule('user_rule', 'starbucks', 50), cardId: 'user_card', userId: 'owner' },
    ] as typeof schema.benefitRules.$inferInsert[]).run();
};

beforeAll(async () => {
    applyMigrations();
    vi.doMock('@/db', () => ({ db: testDb, sqlite, databasePath: ':memory:' }));
    release = await import('./catalog-release');
});

beforeEach(() => seedProduction());

describe('catalog release', () => {
    it('applies the reviewed catalog, hides cards it does not carry and leaves user data alone', async () => {
        const bundle = release.parseCatalogReleaseBundle(bundleFrom([
            cardEntry('card_a', [rule('card_a_new', 'starbucks', 20)]),
            cardEntry('card_b', [rule('card_b_rule', 'twosome', 30)]),
        ]));
        const result = await release.applyCatalogRelease(bundle, {
            reviewerId: 'owner',
            backup: noBackup,
            localMigration: migration,
        });

        expect(result).toMatchObject({
            status: 'applied',
            backup: 'test-backup.db',
            cards: { added: 1, updated: 1, hidden: 1 },
            brands: { added: 1, updated: 1 },
            revisions: 2,
            publishedCards: 2,
            warnings: [],
        });
        const ruleIds = testDb.select({ id: schema.benefitRules.id }).from(schema.benefitRules).all()
            .map(row => row.id).sort();
        expect(ruleIds).toEqual(['card_a_new', 'card_b_rule', 'user_rule']);
        expect(testDb.select().from(schema.cards).where(eq(schema.cards.id, 'card_z')).get()?.catalogStatus)
            .toBe('DRAFT');
        expect(testDb.select().from(schema.cards).where(eq(schema.cards.id, 'user_card')).get()?.userId)
            .toBe('owner');
        expect(testDb.select().from(schema.brands).where(eq(schema.brands.id, 'official_gooddeal_only')).get())
            .toBeDefined();

        const revision = testDb.select().from(schema.cardBenefitRevisions)
            .where(eq(schema.cardBenefitRevisions.cardId, 'card_b'))
            .get();
        expect(revision).toMatchObject({ revision: 1, isActive: true, candidateId: null, reviewerId: 'owner' });
        expect(revision?.snapshot.release).toEqual({
            releaseId: bundle.releaseId,
            sourceRevision: 3,
            reviewed: true,
        });
        expect(release.currentReleaseScopeHash(bundle.content)).toBe(bundle.contentHash);
    });

    it('changes nothing when the same release comes again', async () => {
        const bundle = release.parseCatalogReleaseBundle(bundleFrom([
            cardEntry('card_a', [rule('card_a_new', 'starbucks', 20)]),
        ]));
        const options = { backup: noBackup, localMigration: migration };
        await release.applyCatalogRelease(bundle, options);
        const revisionCount = testDb.select().from(schema.cardBenefitRevisions).all().length;

        const again = await release.applyCatalogRelease(
            release.parseCatalogReleaseBundle({ ...bundle, releaseId: crypto.randomUUID() }),
            options,
        );
        expect(again.status).toBe('unchanged');
        expect(testDb.select().from(schema.cardBenefitRevisions).all()).toHaveLength(revisionCount);
    });

    it('rejects a tampered bundle, another migration and user-owned IDs', async () => {
        const bundle = bundleFrom([cardEntry('card_a', [rule('card_a_new', 'starbucks')])]);
        expect(() => release.parseCatalogReleaseBundle({ ...bundle, contentHash: '0'.repeat(64) }))
            .toThrow('hash');
        expect(() => release.parseCatalogReleaseBundle({ ...bundle, extra: true })).toThrow('형식');

        await expect(release.applyCatalogRelease(release.parseCatalogReleaseBundle(bundle), {
            backup: noBackup,
            localMigration: { count: 1, lastHash: 'a'.repeat(64) },
        })).rejects.toThrow('migration');

        const clash = release.parseCatalogReleaseBundle(bundleFrom([
            cardEntry('user_card', [rule('card_x', 'starbucks')]),
        ]));
        await expect(release.applyCatalogRelease(clash, { backup: noBackup, localMigration: migration }))
            .rejects.toThrow('사용자 데이터');
    });

    it('refuses a release that drops most published cards unless allowed, and a dry run writes nothing', async () => {
        const many = Array.from({ length: 10 }, (_, index) =>
            cardEntry(`card_${index}`, [rule(`rule_${index}`, 'starbucks')]));
        await release.applyCatalogRelease(
            release.parseCatalogReleaseBundle(bundleFrom(many)),
            { backup: noBackup, localMigration: migration },
        );

        const few = many.slice(0, 5);
        await expect(release.applyCatalogRelease(
            release.parseCatalogReleaseBundle(bundleFrom(few)),
            { backup: noBackup, localMigration: migration },
        )).rejects.toThrow('크게 줄어');

        const backup = vi.fn(noBackup);
        const dryRun = await release.applyCatalogRelease(
            release.parseCatalogReleaseBundle(bundleFrom(few, { allowShrink: true })),
            { backup, localMigration: migration, dryRun: true },
        );
        expect(dryRun).toMatchObject({ status: 'dry-run', cards: { hidden: 5 } });
        expect(backup).not.toHaveBeenCalled();
        expect(testDb.select().from(schema.cards)
            .where(and(eq(schema.cards.catalogStatus, 'PUBLISHED'), isNull(schema.cards.userId)))
            .all()).toHaveLength(10);

        const allowed = await release.applyCatalogRelease(
            release.parseCatalogReleaseBundle(bundleFrom(few, { allowShrink: true })),
            { backup: noBackup, localMigration: migration },
        );
        expect(allowed).toMatchObject({ status: 'applied', publishedCards: 5 });
    });

    it('warns when rules point to brands the catalog does not have', async () => {
        const result = await release.applyCatalogRelease(
            release.parseCatalogReleaseBundle(bundleFrom([
                cardEntry('card_a', [rule('card_a_new', 'missing_brand')]),
            ])),
            { backup: noBackup, localMigration: migration, dryRun: true },
        );
        expect(result.warnings[0]).toContain('missing_brand');
    });
});
