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

const baseBrands = [
    '투썸플레이스',
    '노랑통닭',
    ...Array.from({ length: 106 }, (_, index) => `굿딜 브랜드 ${index + 1}`),
];

const day = (dayOfMonth: number) => new Date(Date.UTC(2026, 9, dayOfMonth, 23, 0));

const observation = (
    observedAt: Date,
    rates: Record<string, number> = {},
    names = baseBrands,
): GoodDealObservation => ({
    observedAt,
    kakaopayVersion: '26.8.10',
    parserVersion: 2,
    items: names.map(brand => ({ brand, rate: rates[brand] ?? 5 })),
    structure: ['items=124 badgeNodes=0'],
});

const ingest = (value: GoodDealObservation) => collector.ingestGoodDealObservation(value, {
    now: new Date(value.observedAt.getTime() + 60 * 60 * 1_000),
});

const offerFor = (brandId: string) => integrationDb.select().from(schema.promotionOffers)
    .where(eq(schema.promotionOffers.providerId, 'kakaopay-gooddeal'))
    .all()
    .find(offer => offer.brandIds.includes(brandId));

beforeAll(async () => {
    applyMigrations();
    integrationDb.insert(schema.categories).values([
        { id: 'cafe', name: '카페', sortOrder: 0 },
        { id: 'food', name: '외식', sortOrder: 1 },
        { id: 'etc', name: '기타', sortOrder: 2 },
    ]).run();
    integrationDb.insert(schema.brands).values([
        { id: 'twosome', name: '투썸플레이스', categoryId: 'cafe', sortOrder: 0 },
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
    collector = await import('./promotion-collector');
});

describe('ingestGoodDealObservation', () => {
    it('publishes a first observation and registers brands it has not seen', () => {
        const result = ingest(observation(day(20), { 투썸플레이스: 20, 노랑통닭: 3 }));

        expect(result).toMatchObject({ status: 'applied', discovered: 108, published: 108 });
        expect(offerFor('twosome')).toMatchObject({
            status: 'PUBLISHED',
            action: { type: 'PERCENT', value: 20 },
            condition: { calculationMode: 'INFORMATION_ONLY' },
            collectedAt: day(20),
        });
        const chicken = integrationDb.select().from(schema.brands)
            .where(eq(schema.brands.name, '노랑통닭'))
            .get();
        expect(chicken).toMatchObject({ categoryId: 'food', discoveryVisibility: 'AUTO' });
        expect(offerFor(chicken!.id)?.action.value).toBe(3);
    });

    it('ignores a repeated upload and records the sighting of unchanged rates', () => {
        expect(ingest(observation(day(20), { 투썸플레이스: 20, 노랑통닭: 3 })).status)
            .toBe('duplicate');

        const result = ingest(observation(day(21), { 투썸플레이스: 20, 노랑통닭: 3 }));

        expect(result).toMatchObject({ status: 'applied', discovered: 0, published: 0, unchanged: 108 });
        expect(offerFor('twosome')?.collectedAt).toEqual(day(21));
    });

    it('updates a changed rate without review', () => {
        const result = ingest(observation(day(22), { 투썸플레이스: 3, 노랑통닭: 3 }));

        expect(result).toMatchObject({ status: 'applied', published: 1 });
        expect(offerFor('twosome')?.action.value).toBe(3);
    });

    it('keeps the catalog when an upload fails the gate', () => {
        const mixed = [...baseBrands, ...Array.from({ length: 14 }, (_, index) => `추천 ${index}`)];
        const result = ingest(observation(day(23), { 투썸플레이스: 30 }, mixed));

        expect(result.status).toBe('held');
        expect(result.reasons).toEqual(['항목 수가 직전 반영본(108개)과 10% 넘게 다릅니다: 122개']);
        expect(offerFor('twosome')?.action.value).toBe(3);
        const stored = integrationDb.select().from(schema.promotionSourceDocuments)
            .where(eq(schema.promotionSourceDocuments.collectionSourceId, 'kakaopay-gooddeal'))
            .all();
        expect(stored.filter(document => (
            document.responseMetadata.appObservation?.gate.passed === false
        ))).toHaveLength(1);
    });

    it('expires a brand only after two passing uploads without it', () => {
        const withoutLast = baseBrands.slice(0, -1);
        const lastBrand = integrationDb.select().from(schema.brands)
            .where(eq(schema.brands.name, baseBrands.at(-1)!))
            .get()!;

        const first = ingest(observation(day(24), { 투썸플레이스: 3, 노랑통닭: 3 }, withoutLast));
        expect(first).toMatchObject({ status: 'applied', removalQueued: 1, expired: 0 });
        expect(offerFor(lastBrand.id)?.status).toBe('PUBLISHED');

        const second = ingest(observation(day(25), { 투썸플레이스: 3, 노랑통닭: 3 }, withoutLast));
        expect(second).toMatchObject({ status: 'applied', expired: 1 });
        expect(offerFor(lastBrand.id)?.status).toBe('EXPIRED');
    });

    it('holds an upload older than one already received', () => {
        const result = ingest(observation(new Date(day(25).getTime() - 60_000)));

        expect(result.status).toBe('held');
        expect(result.reasons).toContain('이미 받은 관측보다 오래된 기록입니다.');
    });
});
