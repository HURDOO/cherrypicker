import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import {
    officialNaverPayRows,
    promotionOfficialFixtureMetadata,
} from '@/test/fixtures/promotion-official-sources';
import { parseNaverPayPromotions } from './promotion-parsers';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let currentNaverPayRows = [...officialNaverPayRows];
let originalOpenAiApiKey: string | undefined;
let collectPromotionCandidates: (
    typeof import('./promotion-collector')
)['collectPromotionCandidates'];
let autoPromotionId: (
    typeof import('./promotion-collector')
)['autoPromotionId'];

const applyMigrations = () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;

    journal.entries.forEach(entry => {
        const migrationSql = readFileSync(
            resolve('drizzle', `${entry.tag}.sql`),
            'utf8',
        ).replaceAll('--> statement-breakpoint', '');
        sqlite.exec(migrationSql);
    });
    sqlite.pragma('foreign_keys = ON');
};

const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
});

const fetchOfficialFixture = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string'
        ? input
        : input instanceof URL
            ? input.toString()
            : input.url;

    if (url.includes('/benefit/payment/first-category')) {
        return jsonResponse([{ name: '현장결제', code: 'DOMESTIC_INSTORE' }]);
    }

    if (url.includes('/benefit/payment/accumulation-promotions')) {
        return jsonResponse({
            elements: currentNaverPayRows,
            pagination: { page: 1, totalPages: 1 },
        });
    }

    return new Response('fixture에서 지원하지 않는 공식 출처', { status: 503 });
});

beforeAll(async () => {
    applyMigrations();
    integrationDb.insert(schema.categories).values([
        { id: 'cafe', name: '카페', sortOrder: 0 },
        { id: 'shopping', name: '쇼핑', sortOrder: 1 },
    ]).run();
    integrationDb.insert(schema.brands).values({
        id: 'twosome',
        name: '투썸플레이스',
        categoryId: 'cafe',
        sortOrder: 0,
    }).run();
    integrationDb.insert(schema.promotionProviders).values({
        id: 'naverpay',
        name: 'Npay',
        kind: 'PAY',
        sourceUrl: promotionOfficialFixtureMetadata.sources.naverpay,
        isActive: true,
        sortOrder: 0,
    }).run();

    originalOpenAiApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    vi.stubGlobal('fetch', fetchOfficialFixture);
    vi.doMock('@/db', () => ({
        db: integrationDb,
        sqlite,
        databasePath: ':memory:',
    }));

    const collector = await import('./promotion-collector');
    collectPromotionCandidates = collector.collectPromotionCandidates;
    autoPromotionId = collector.autoPromotionId;
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/db');
    if (originalOpenAiApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
    } else {
        process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    }
    sqlite.close();
});

describe('official promotion collection lifecycle', () => {
    it('persists evidence, rejects a missing pending row, and queues a published removal', async () => {
        const parsed = parseNaverPayPromotions(
            officialNaverPayRows,
            'DOMESTIC_INSTORE',
            promotionOfficialFixtureMetadata.sources.naverpay,
        );
        const twosome = parsed.find(item => item.offer.title.startsWith('투썸플레이스'))!;
        const electroland = parsed.find(item => item.offer.title.startsWith('전자랜드'))!;
        const twosomePromotionId = autoPromotionId('naverpay', twosome.sourceKey);

        const firstResults = await collectPromotionCandidates();
        const firstNaverPayResult = firstResults.find(
            result => result.sourceId === 'naverpay-benefits',
        );
        expect(firstNaverPayResult?.message).toBeUndefined();
        expect(firstNaverPayResult)
            .toMatchObject({
                status: 'created',
                discovered: 2,
                published: 1,
                reviewRequired: 1,
            });

        const publishedTwosome = integrationDb.select()
            .from(schema.promotionOffers)
            .all()
            .find(offer => offer.id === twosomePromotionId);
        expect(publishedTwosome).toMatchObject({
            status: 'PUBLISHED',
            providerId: 'naverpay',
            action: { type: 'FLAT', value: 3_000 },
            condition: { minSpend: 15_000 },
        });

        const firstCandidates = integrationDb.select()
            .from(schema.promotionCandidates)
            .all();
        const twosomeCandidate = firstCandidates.find(
            candidate => candidate.diff.sourceKey === twosome.sourceKey,
        );
        const electrolandCandidate = firstCandidates.find(
            candidate => candidate.diff.sourceKey === electroland.sourceKey,
        );
        expect(twosomeCandidate).toMatchObject({
            status: 'APPROVED',
            linkedPromotionId: twosomePromotionId,
        });
        expect(twosomeCandidate?.sourceBundleHash).toMatch(/^[a-f0-9]{64}$/);
        expect(twosomeCandidate?.audit?.blockingErrors).toEqual([]);
        expect(twosomeCandidate?.audit?.coverage.every(
            item => item.evidence.length > 0,
        )).toBe(true);
        expect(electrolandCandidate).toMatchObject({ status: 'PENDING' });

        currentNaverPayRows = [officialNaverPayRows[0]];
        await collectPromotionCandidates();

        const missingElectroland = integrationDb.select()
            .from(schema.promotionCandidates)
            .all()
            .find(candidate => candidate.id === electrolandCandidate?.id);
        expect(missingElectroland).toMatchObject({
            status: 'REJECTED',
            diff: { resolution: 'MISSING_FROM_LATEST_SOURCE' },
        });

        currentNaverPayRows = [officialNaverPayRows[1]];
        const removalResults = await collectPromotionCandidates();
        expect(removalResults.find(result => result.sourceId === 'naverpay-benefits'))
            .toMatchObject({
                status: 'created',
                reviewRequired: 2,
                message: expect.stringContaining('삭제 의심 1건'),
            });

        const removalCandidate = integrationDb.select()
            .from(schema.promotionCandidates)
            .all()
            .find(candidate => (
                candidate.linkedPromotionId === twosomePromotionId
                && candidate.diff.removedFromSource === true
                && candidate.status === 'PENDING'
            ));
        expect(removalCandidate).toMatchObject({
            providerId: 'naverpay',
            sourceBundleHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            audit: {
                changes: [{ path: 'promotion', kind: 'REMOVED', risk: 'HIGH' }],
                blockingErrors: [expect.stringContaining('최신 공식 source bundle에서 사라졌습니다')],
            },
        });
        expect(integrationDb.select().from(schema.promotionSourceBundles).all().length)
            .toBeGreaterThanOrEqual(3);
        expect(integrationDb.select().from(schema.promotionSourceDocuments).all().length)
            .toBeGreaterThanOrEqual(4);

        currentNaverPayRows = [...officialNaverPayRows];
        await collectPromotionCandidates();

        const resolvedRemoval = integrationDb.select()
            .from(schema.promotionCandidates)
            .all()
            .find(candidate => candidate.id === removalCandidate?.id);
        expect(resolvedRemoval).toMatchObject({
            status: 'REJECTED',
            diff: { resolution: 'REAPPEARED_IN_SOURCE' },
        });
        expect(integrationDb.select().from(schema.promotionOffers).all()
            .find(offer => offer.id === twosomePromotionId)?.status).toBe('PUBLISHED');
    });
});
