import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { GoodDealObservation } from './gooddeal-observation';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let collector: typeof import('./promotion-collector');
// The first upload uses the information-only offers published before 2026-10-25.
let legacyOffers = true;

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

const brands = Array.from({ length: 60 }, (_, index) => `굿딜 브랜드 ${index + 1}`);
const day = (dayOfMonth: number) => new Date(Date.UTC(2026, 9, dayOfMonth, 23, 0));
const observation = (observedAt: Date): GoodDealObservation => ({
    observedAt,
    kakaopayVersion: '26.8.10',
    parserVersion: 2,
    items: brands.map(brand => ({ brand, rate: 5 })),
    structure: ['items=60 badgeNodes=0'],
});
const ingest = (value: GoodDealObservation) => collector.ingestGoodDealObservation(value, {
    now: new Date(value.observedAt.getTime() + 60 * 60 * 1_000),
});

beforeAll(async () => {
    applyMigrations();
    integrationDb.insert(schema.categories).values([
        { id: 'etc', name: '기타', sortOrder: 0 },
    ]).run();
    integrationDb.insert(schema.promotionProviders).values([{
        id: 'kakaopay-gooddeal',
        name: '카카오페이 굿딜',
        kind: 'GOODDEAL',
        sourceUrl: 'https://good-deal-web.kakaopay.com/home/all',
        isActive: true,
        sortOrder: 0,
    }]).run();
    vi.doMock('@/db', () => ({ db: integrationDb, sqlite, databasePath: ':memory:' }));
    vi.doMock('./gooddeal-observation', async importOriginal => {
        const actual = await importOriginal<typeof import('./gooddeal-observation')>();
        return {
            ...actual,
            goodDealPromotions: (value: GoodDealObservation) => actual.goodDealPromotions(value)
                .map(promotion => (legacyOffers
                    ? {
                        ...promotion,
                        offer: {
                            ...promotion.offer,
                            action: { type: 'PERCENT' as const, value: promotion.offer.action.value },
                            condition: {
                                amountBasis: 'REMAINING_AMOUNT' as const,
                                applicabilityScope: 'STORE_WIDE' as const,
                                calculationMode: 'INFORMATION_ONLY' as const,
                                requiredNote: '굿딜 상품권의 하루 한도와 기간을 확인하지 않아 금액 계산에서 제외합니다.',
                            },
                        },
                    }
                    : promotion)),
        };
    });
    collector = await import('./promotion-collector');
});

describe('GoodDeal offers published as information only', () => {
    it('become counted discounts on the next upload without review', () => {
        expect(ingest(observation(day(24)))).toMatchObject({ status: 'applied', published: 60 });
        const offers = () => integrationDb.select().from(schema.promotionOffers)
            .where(eq(schema.promotionOffers.providerId, 'kakaopay-gooddeal'))
            .all();
        expect(offers()[0].condition.calculationMode).toBe('INFORMATION_ONLY');
        legacyOffers = false;

        const result = ingest(observation(day(25)));

        expect(result).toMatchObject({ status: 'applied', published: 60, reviewRequired: 0 });
        expect(offers()).toHaveLength(60);
        offers().forEach(offer => expect(offer).toMatchObject({
            status: 'PUBLISHED',
            action: { value: 5, maxBenefit: 25_000 },
            condition: { calculationMode: 'CALCULABLE' },
            certainty: 'CONFIRMED',
            collectedAt: day(25),
        }));
    });
});
