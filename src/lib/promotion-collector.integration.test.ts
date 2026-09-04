import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import {
    officialNaverPayRows,
    officialParisKtHtmlExcerpt,
    officialParisSktHtmlExcerpt,
    officialTousLesJoursHtmlExcerpt,
    officialTUniverseBigGuideHtmlExcerpt,
    officialTUniverseDailyPassHtmlExcerpt,
    officialTUniverseOliveStarbucksHtmlExcerpt,
    promotionOfficialFixtureMetadata,
} from '@/test/fixtures/promotion-official-sources';
import {
    parseNaverPayPromotions,
    parseParisMembershipHtml,
} from './promotion-parsers';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let currentNaverPayRows = [...officialNaverPayRows];
let currentParisKtHtml = officialParisKtHtmlExcerpt;
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

const htmlResponse = (value: string) => new Response(value, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
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

    if (url === promotionOfficialFixtureMetadata.sources.tUniverseBig) {
        return htmlResponse(officialTUniverseBigGuideHtmlExcerpt);
    }

    if (url === promotionOfficialFixtureMetadata.sources.tUniverseDaily) {
        return htmlResponse(officialTUniverseDailyPassHtmlExcerpt);
    }

    if (url === promotionOfficialFixtureMetadata.sources.tUniverseOliveStarbucks) {
        return htmlResponse(officialTUniverseOliveStarbucksHtmlExcerpt);
    }

    if (url === promotionOfficialFixtureMetadata.sources.parisKt) {
        return htmlResponse(currentParisKtHtml);
    }

    if (url === promotionOfficialFixtureMetadata.sources.parisSkt) {
        return htmlResponse(officialParisSktHtmlExcerpt);
    }

    if (url === promotionOfficialFixtureMetadata.sources.tousLesJours) {
        return htmlResponse(officialTousLesJoursHtmlExcerpt);
    }

    return new Response('fixture에서 지원하지 않는 공식 출처', { status: 503 });
});

beforeAll(async () => {
    applyMigrations();
    integrationDb.insert(schema.categories).values([
        { id: 'cafe', name: '카페', sortOrder: 0 },
        { id: 'convenience', name: '편의점', sortOrder: 1 },
        { id: 'shopping', name: '쇼핑', sortOrder: 2 },
    ]).run();
    integrationDb.insert(schema.brands).values([
        { id: 'twosome', name: '투썸플레이스', categoryId: 'cafe', sortOrder: 0 },
        { id: 'starbucks', name: '스타벅스', categoryId: 'cafe', sortOrder: 1 },
        { id: 'paris_baguette', name: '파리바게뜨', categoryId: 'cafe', sortOrder: 2 },
        { id: 'tous_les_jours', name: '뚜레쥬르', categoryId: 'cafe', sortOrder: 3 },
        { id: 'cu', name: 'CU', categoryId: 'convenience', sortOrder: 0 },
        { id: 'seveneleven', name: '세븐일레븐', categoryId: 'convenience', sortOrder: 1 },
        { id: 'emart24', name: '이마트24', categoryId: 'convenience', sortOrder: 2 },
    ]).run();
    integrationDb.insert(schema.promotionProviders).values([
        {
            id: 'naverpay',
            name: 'Npay',
            kind: 'PAY',
            sourceUrl: promotionOfficialFixtureMetadata.sources.naverpay,
            isActive: true,
            sortOrder: 0,
        },
        {
            id: 't-universe',
            name: 'T우주',
            kind: 'SUBSCRIPTION',
            sourceUrl: promotionOfficialFixtureMetadata.sources.tUniverseBig,
            isActive: true,
            sortOrder: 1,
        },
        {
            id: 'skt',
            name: 'T멤버십',
            kind: 'TELECOM',
            sourceUrl: promotionOfficialFixtureMetadata.sources.parisSkt,
            isActive: true,
            sortOrder: 2,
        },
        {
            id: 'kt',
            name: 'KT멤버십',
            kind: 'TELECOM',
            sourceUrl: promotionOfficialFixtureMetadata.sources.parisKt,
            isActive: true,
            sortOrder: 3,
        },
        {
            id: 'lguplus',
            name: 'U+멤버십',
            kind: 'TELECOM',
            sourceUrl: promotionOfficialFixtureMetadata.sources.tousLesJours,
            isActive: true,
            sortOrder: 4,
        },
    ]).run();

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
    it('covers composite HTML, evidence, pending loss, removal, and reappearance', async () => {
        const parsed = parseNaverPayPromotions(
            officialNaverPayRows,
            'DOMESTIC_INSTORE',
            promotionOfficialFixtureMetadata.sources.naverpay,
        );
        const twosome = parsed.find(item => item.offer.title.startsWith('투썸플레이스'))!;
        const electroland = parsed.find(item => item.offer.title.startsWith('전자랜드'))!;
        const twosomePromotionId = autoPromotionId('naverpay', twosome.sourceKey);

        const firstResults = await collectPromotionCandidates();
        expect(firstResults.find(result => result.sourceId === 't-universe-products'))
            .toMatchObject({
                status: 'created',
                discovered: 6,
                published: 6,
                reviewRequired: 0,
                products: 8,
            });
        expect(firstResults.find(result => result.sourceId === 'paris-kt'))
            .toMatchObject({ discovered: 2, published: 2, reviewRequired: 0 });
        expect(firstResults.find(result => result.sourceId === 'paris-skt'))
            .toMatchObject({ discovered: 2, published: 2, reviewRequired: 0 });
        expect(firstResults.find(result => result.sourceId === 'tlj-membership'))
            .toMatchObject({ discovered: 7, published: 7, reviewRequired: 0 });
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
        const tUniverseCandidate = firstCandidates.find(candidate => (
            candidate.diff.collectionSourceId === 't-universe-products'
            && (candidate.parsedOffer.brandIds as string[]).includes('starbucks')
        ));
        const tUniverseBundle = integrationDb.select()
            .from(schema.promotionSourceBundles)
            .all()
            .find(bundle => bundle.collectionSourceId === 't-universe-products');
        const tUniverseBundleDocuments = integrationDb.select()
            .from(schema.promotionSourceBundleDocuments)
            .all()
            .filter(row => row.bundleId === tUniverseBundle?.id);
        expect(tUniverseBundleDocuments).toHaveLength(3);
        expect(tUniverseCandidate).toMatchObject({
            status: 'APPROVED',
            sourceBundleHash: tUniverseBundle?.sourceBundleHash,
            audit: { blockingErrors: [] },
        });
        expect(tUniverseCandidate?.audit?.coverage.every(
            item => item.evidence.length > 0,
        )).toBe(true);
        expect(firstCandidates.filter(candidate => (
            ['paris-kt', 'paris-skt', 'tlj-membership']
                .includes(candidate.diff.collectionSourceId as string)
        )).every(candidate => (
            candidate.status === 'APPROVED'
            && candidate.audit?.blockingErrors.length === 0
            && candidate.audit.coverage.every(item => item.evidence.length > 0)
        ))).toBe(true);
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

        const parisKtOffers = parseParisMembershipHtml(
            officialParisKtHtmlExcerpt,
            'kt',
            promotionOfficialFixtureMetadata.sources.parisKt,
        );
        const parisSilver = parisKtOffers.find(item => (
            item.offer.condition.telecomTiers?.includes('SILVER')
        ))!;
        const parisSilverPromotionId = autoPromotionId('kt', parisSilver.sourceKey);
        const silverBlock = /<div class="elementor-widget-container"><h2[^>]*>SILVER[\s\S]*?<\/h3><\/div>\s*/;
        currentParisKtHtml = officialParisKtHtmlExcerpt.replace(silverBlock, '');
        const parisFirstMissingAt = new Date(Date.now() + 60 * 60 * 1_000);

        const parisRemovalResults = await collectPromotionCandidates({
            now: parisFirstMissingAt,
        });
        expect(parisRemovalResults.find(result => result.sourceId === 'paris-kt'))
            .toMatchObject({
                status: 'created',
                discovered: 0,
                published: 0,
                unchanged: 1,
                reviewRequired: 1,
            });
        const parisRemovalCandidate = integrationDb.select()
            .from(schema.promotionCandidates)
            .all()
            .find(candidate => (
                candidate.linkedPromotionId === parisSilverPromotionId
                && candidate.diff.removedFromSource === true
                && candidate.status === 'PENDING'
            ));
        expect(parisRemovalCandidate).toMatchObject({
            providerId: 'kt',
            sourceUrl: promotionOfficialFixtureMetadata.sources.parisKt,
            sourceBundleHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            diff: {
                removalObservation: {
                    count: 1,
                    observations: [expect.objectContaining({
                        coverageSourceBundleHashes: expect.objectContaining({
                            'paris-kt': expect.any(String),
                            'tlj-membership': expect.any(String),
                        }),
                    })],
                },
            },
        });

        const autoRemovalResults = await collectPromotionCandidates({
            now: new Date(parisFirstMissingAt.getTime() + 6 * 60 * 1_000),
        });
        expect(autoRemovalResults.find(result => result.sourceId === 'paris-kt'))
            .toMatchObject({
                status: 'created',
                expired: 1,
                message: expect.stringContaining('삭제 확정 1건 자동 만료'),
            });
        expect(integrationDb.select().from(schema.promotionCandidates).all()
            .find(candidate => candidate.id === parisRemovalCandidate?.id))
            .toMatchObject({
                status: 'APPROVED',
                reviewerId: null,
                diff: {
                    resolution: 'REMOVAL_AUTO_CONFIRMED',
                    automaticApproval: {
                        actor: 'PROMOTION_COLLECTOR',
                        observationCount: 2,
                    },
                },
            });
        expect(integrationDb.select().from(schema.promotionOffers).all()
            .find(offer => offer.id === parisSilverPromotionId)?.status).toBe('EXPIRED');

        currentParisKtHtml = officialParisKtHtmlExcerpt;
        await collectPromotionCandidates({
            now: new Date(parisFirstMissingAt.getTime() + 7 * 60 * 1_000),
        });

        expect(integrationDb.select().from(schema.promotionCandidates).all()
            .find(candidate => candidate.id === parisRemovalCandidate?.id))
            .toMatchObject({
                status: 'APPROVED',
                diff: { resolution: 'REMOVAL_AUTO_CONFIRMED' },
            });
        expect(integrationDb.select().from(schema.promotionOffers).all()
            .find(offer => offer.id === parisSilverPromotionId)?.status).toBe('PUBLISHED');
        expect(integrationDb.select().from(schema.subscriptionProducts).all())
            .toHaveLength(8);
    });
});
