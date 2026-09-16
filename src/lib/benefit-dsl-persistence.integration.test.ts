import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import type { BenefitProgramV1 } from '@/types';
import { buildBenefitCatalogSnapshot } from './benefit-catalog';
import { parseBenefitCatalogSnapshot } from './benefit-catalog-contract';
import { toCard, toCategory, toBrand, toRule } from './db-mappers';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const database = drizzle(sqlite, { schema });

const program: BenefitProgramV1 = {
    languageVersion: 1,
    target: { includedBrandIds: ['merchant'] },
    eligibility: { op: 'literal', value: true },
    benefit: { op: 'literal', value: 1_000 },
    usesCardLimit: false,
    reason: 'DSL 정액 혜택',
};

const performancePolicy = {
    version: 1 as const,
    exclusionRules: [{
        id: 'discounted_sale',
        when: { op: 'CARD_DISCOUNT_APPLIED' as const, ruleIds: ['dsl_rule'] },
        reason: '할인 매출 실적 제외',
        sourceUrl: 'https://example.com/card',
        quote: '할인 적용 매출 전체',
    }],
};

beforeAll(() => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        const migrationSql = readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', '');
        sqlite.exec(migrationSql);
    });
    sqlite.pragma('foreign_keys = ON');
});

afterAll(() => sqlite.close());

describe('benefit DSL persistence and catalog compatibility', () => {
    it('round-trips a versioned program through SQLite and catalog v3', () => {
        database.insert(schema.categories).values({ id: 'shopping', name: '쇼핑' }).run();
        database.insert(schema.brands).values({
            id: 'merchant',
            name: '테스트 결제처',
            categoryId: 'shopping',
        }).run();
        database.insert(schema.cards).values({
            id: 'card',
            name: '테스트 카드',
            company: '테스트카드',
            color: 'bg-black',
            limitTable: [],
            performancePolicy,
            catalogStatus: 'PUBLISHED',
        }).run();
        database.insert(schema.benefitRules).values({
            id: 'dsl_rule',
            cardId: 'card',
            includedBrands: ['merchant'],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description: 'DSL 정액 혜택',
            detail: '',
            condition: {},
            action: { type: 'FLAT', value: 0 },
            limitConfig: {},
            programVersion: 1,
            program,
        }).run();

        const categories = database.select().from(schema.categories).all().map(toCategory);
        const brands = database.select().from(schema.brands).all().map(toBrand);
        const cards = database.select().from(schema.cards).all().map(toCard);
        const rules = database.select().from(schema.benefitRules).all().map(toRule);
        const snapshot = buildBenefitCatalogSnapshot({
            categories,
            brands,
            cards,
            rules,
            providers: [],
            subscriptionProducts: [],
            promotions: [],
            routeVerifications: [],
            cardBenefitSupports: [{
                cardId: 'card',
                reviewStatus: 'REVIEWED',
                supportScope: 'FULL',
                lastVerifiedAt: '2026-09-07T00:00:00.000Z',
                sources: [{ label: '공식 출처', url: 'https://example.com/card' }],
                caveats: [],
            }],
        }, '2026-09-07T00:00:00.000Z');

        expect(rules[0].program).toEqual(program);
        expect(cards[0].performancePolicy).toEqual(performancePolicy);
        expect(snapshot.schemaVersion).toBe(3);
        expect(parseBenefitCatalogSnapshot(snapshot).rules[0].program).toEqual(program);
        expect(parseBenefitCatalogSnapshot(snapshot).cards[0].performancePolicy)
            .toEqual(performancePolicy);
    });

    it('continues to parse a cached catalog v2 without DSL programs', () => {
        expect(parseBenefitCatalogSnapshot({
            schemaVersion: 2,
            catalogVersion: 'a'.repeat(64),
            generatedAt: '2026-09-07T00:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            providers: [],
            subscriptionProducts: [],
            promotions: [],
            routeVerifications: [],
            cardBenefitSupports: [],
        })).toMatchObject({ schemaVersion: 2, rules: [] });
    });
});
