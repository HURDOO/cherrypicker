import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import {
    buildKtManualOfferDraft,
    KT_MANUAL_BENEFITS,
    ktManualSourceKey,
    ktPartnerDetailUrl,
} from './kt-membership-manual-benefits';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

// Local (Mac) and production are two in-memory databases behind one mocked `@/db`.
const migrated = () => {
    const sqlite = new Database(':memory:');
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        sqlite.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    sqlite.pragma('foreign_keys = ON');
    return { sqlite, db: drizzle(sqlite, { schema }) };
};
type Side = ReturnType<typeof migrated>;
let current: Side;

let release: typeof import('./manual-promotion-release');
let review: typeof import('./promotion-candidate-review-server');

beforeAll(async () => {
    vi.resetModules();
    vi.doMock('@/db', () => ({
        get db() { return current.db; },
        get sqlite() { return current.sqlite; },
        databasePath: ':memory:',
    }));
    release = await import('./manual-promotion-release');
    review = await import('./promotion-candidate-review-server');
});

const migration = { count: 0, lastHash: null };
const noBackup = async () => 'test-backup.db';
const benefit = KT_MANUAL_BENEFITS[0];
const NOTE = '[세션 임시 승인] 테스트';

function seed(side: Side, options: { reviewer: string; brand?: boolean }) {
    current = side;
    side.sqlite.prepare('insert into "user" (id, name, email) values (?, ?, ?)')
        .run(options.reviewer, options.reviewer, `${options.reviewer}@example.com`);
    side.sqlite.prepare(
        `insert into promotion_providers (id, name, kind, source_url, is_active, sort_order)
         values ('kt', 'KT멤버십', 'TELECOM', 'https://membership.kt.com', 1, 0)`,
    ).run();
    side.sqlite.prepare("insert into categories (id, name, sort_order) values ('food', '음식', 0)").run();
    if (options.brand !== false) {
        side.sqlite.prepare("insert into brands (id, name, category_id, sort_order) values (?, ?, 'food', 0)")
            .run(benefit.brandId, benefit.brandName);
    }
}

/** The KT registration script's path: a manual candidate approved through the review code. */
function registerLocally(draft: Record<string, unknown>, sourceHash: string, linkedPromotionId?: string) {
    const id = `local-${sourceHash.slice(0, 8)}`;
    current.db.insert(schema.promotionCandidates).values({
        id,
        providerId: 'kt',
        sourceUrl: ktPartnerDetailUrl(benefit.pageCode),
        sourceHash,
        sourceTitle: String(draft.title),
        rawContent: 'KT 제휴 상세 원문',
        parsedOffer: draft,
        diff: { manual: true, sourceKey: ktManualSourceKey(benefit), collectionMethod: 'test' },
        status: 'PENDING',
        ...(linkedPromotionId && { linkedPromotionId }),
        discoveredAt: new Date('2026-11-10T00:00:00.000Z'),
    }).run();
    return review.reviewPromotionCandidate(id, 'APPROVED', 'local-admin', undefined, false, NOTE);
}

const hash = (digit: string) => digit.repeat(64);
let local: Side;
let production: Side;

beforeEach(() => {
    local = migrated();
    production = migrated();
    seed(local, { reviewer: 'local-admin' });
    registerLocally(buildKtManualOfferDraft(benefit), hash('a'));
});

const buildLocal = () => {
    current = local;
    return release.buildManualPromotionRelease('kt', { createdAt: new Date('2026-11-10T09:00:00.000Z') });
};
const apply = (
    bundle: import('./manual-promotion-release').ManualPromotionReleaseBundle,
    overrides: Parameters<typeof release.applyManualPromotionRelease>[1] = {},
) => {
    current = production;
    return release.applyManualPromotionRelease(bundle, {
        reviewerId: 'prod-admin',
        backup: noBackup,
        localMigration: migration,
        handoverCompleted: true,
        ...overrides,
    });
};
const productionOffer = (id: string) => production.db.select().from(schema.promotionOffers)
    .where(eq(schema.promotionOffers.id, id)).get();

describe('manual promotion release', () => {
    it('approves new manual benefits under the production admin with the local offer id, then skips them', async () => {
        const bundle = { ...buildLocal(), migration };
        seed(production, { reviewer: 'prod-admin' });
        expect(bundle.items).toHaveLength(1);
        const item = bundle.items[0];
        expect(item.approvalNote).toBe(NOTE);
        expect(Object.keys(item.diff)).not.toContain('sessionApproval');

        const parsed = release.parseManualPromotionRelease(JSON.parse(JSON.stringify(bundle)));
        const result = await apply(parsed);
        expect(result).toMatchObject({ status: 'applied', added: 1, updated: 0, unchanged: 0, backup: 'test-backup.db' });

        const offer = productionOffer(item.offerId);
        expect(offer && release.comparableOffer(offer)).toEqual(item.offer);
        const candidate = production.db.select().from(schema.promotionCandidates).get();
        expect(candidate).toMatchObject({ status: 'APPROVED', reviewerId: 'prod-admin', linkedPromotionId: item.offerId });
        expect(candidate?.diff).toMatchObject({
            manual: true,
            sessionApproval: { note: NOTE },
            manualRelease: { releaseId: bundle.releaseId },
        });

        expect(await apply(parsed)).toMatchObject({ status: 'unchanged', added: 0, unchanged: 1 });
    });

    it('rolls a dry run back and refuses before the handover or without an admin', async () => {
        const bundle = { ...buildLocal(), migration };
        seed(production, { reviewer: 'prod-admin' });
        expect(await apply(bundle, { dryRun: true })).toMatchObject({ status: 'dry-run', added: 1 });
        expect(productionOffer(bundle.items[0].offerId)).toBeUndefined();
        expect(production.db.select().from(schema.promotionCandidates).all()).toHaveLength(0);

        await expect(apply(bundle, { handoverCompleted: false })).rejects.toMatchObject({ status: 409 });
        await expect(apply(bundle, { reviewerId: null })).rejects.toMatchObject({ status: 409 });
        await expect(apply(bundle, { localMigration: { count: 1, lastHash: 'x' } }))
            .rejects.toMatchObject({ status: 409 });
    });

    it('updates the same offer when the local benefit changes', async () => {
        const first = { ...buildLocal(), migration };
        seed(production, { reviewer: 'prod-admin' });
        await apply(first);

        current = local;
        const offerId = first.items[0].offerId;
        registerLocally({ ...buildKtManualOfferDraft(benefit), title: '고친 KT 혜택' }, hash('b'), offerId);
        const second = { ...buildLocal(), migration };
        expect(second.items).toHaveLength(1);
        expect(second.items[0].offerId).toBe(offerId);

        expect(await apply(second)).toMatchObject({ status: 'applied', added: 0, updated: 1 });
        expect(productionOffer(offerId)?.title).toBe('고친 KT 혜택');
    });

    it('skips an offer production changed under the same source and warns', async () => {
        const bundle = { ...buildLocal(), migration };
        seed(production, { reviewer: 'prod-admin' });
        await apply(bundle);
        production.db.update(schema.promotionOffers)
            .set({ title: '운영에서 고침' })
            .where(eq(schema.promotionOffers.id, bundle.items[0].offerId))
            .run();

        const result = await apply(bundle);
        expect(result).toMatchObject({ status: 'unchanged', unchanged: 0 });
        expect(result.warnings[0]).toContain('운영에서 바뀐 혜택');
        expect(productionOffer(bundle.items[0].offerId)?.title).toBe('운영에서 고침');
    });

    it('refuses missing brands and ids that belong to a collected offer', async () => {
        const bundle = { ...buildLocal(), migration };
        seed(production, { reviewer: 'prod-admin', brand: false });
        await expect(apply(bundle)).rejects.toMatchObject({ status: 409 });

        production.sqlite.prepare("insert into brands (id, name, category_id, sort_order) values (?, ?, 'food', 0)")
            .run(benefit.brandId, benefit.brandName);
        production.sqlite.prepare(
            `insert into promotion_offers (id, provider_id, layer, title, description, brand_ids, category_ids,
               channels, action, condition, compatibility, limit_config, certainty, status, source_url,
               created_at, updated_at)
             values (?, 'kt', 'DISCOUNT', '수집 혜택', '', '[]', '[]', '["OFFLINE"]',
               '{"type":"PERCENT","value":10}', '{}', '{}', '{}', 'CONFIRMED', 'PUBLISHED', 'https://example.com', 0, 0)`,
        ).run(bundle.items[0].offerId);
        await expect(apply(bundle)).rejects.toMatchObject({ status: 409 });
        expect(productionOffer(bundle.items[0].offerId)?.title).toBe('수집 혜택');
    });

    it('rejects tampered bundles, other providers and local-only approval fields', () => {
        const bundle = JSON.parse(JSON.stringify({ ...buildLocal(), migration }));
        expect(() => release.parseManualPromotionRelease({ ...bundle, contentHash: 'f'.repeat(64) }))
            .toThrow('hash');
        expect(() => release.parseManualPromotionRelease({ ...bundle, providerId: 'naverpay' })).toThrow('형식');
        const withApproval = structuredClone(bundle);
        withApproval.items[0].diff.sessionApproval = { note: 'x' };
        expect(() => release.parseManualPromotionRelease(withApproval)).toThrow('수동 등록');
        const notManual = structuredClone(bundle);
        notManual.items[0].diff.manual = false;
        expect(() => release.parseManualPromotionRelease(notManual)).toThrow('수동 등록');
    });
});
