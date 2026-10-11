import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { CardBenefitExtraction } from '@/types';
import { officialBrandIdFor } from './promotion-parsers';

interface MigrationJournal {
    entries: Array<{ tag: string }>;
}

const sqlite = new Database(':memory:');
const integrationDb = drizzle(sqlite, { schema });
let ingestion: typeof import('./card-benefit-ingestion');

const sourceUrl = 'https://card.example.com/benefits';
const wefanQuote = '위팬샵 공식 온라인몰 결제 시 20% 할인';
const bearsQuote = '베어스하우스 결제 시 10% 할인';
const pgQuote = 'PG 경유 결제 등 일부 거래는 할인 대상에서 제외';
const installmentQuote = '무이자할부 및 상품권 구매 금액은 전월 이용실적에서 제외';
const wefanId = officialBrandIdFor('위팬샵');
const bearsId = officialBrandIdFor('베어스하우스');

const extraction: CardBenefitExtraction = {
    schemaVersion: 2,
    completeness: 'FULL',
    card: { id: 'coverage_card', name: '범위 테스트 카드', company: '테스트카드', limitTable: [] },
    rules: [
        {
            id: 'coverage_card_wefan',
            cardId: 'coverage_card',
            includedBrands: [wefanId],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description: '위팬샵 20% 할인',
            detail: '',
            condition: {},
            action: { type: 'PERCENT', value: 20 },
            limitConfig: {},
        },
        {
            id: 'coverage_card_bears',
            cardId: 'coverage_card',
            includedBrands: [bearsId],
            excludedBrands: [],
            platformType: 'ALL',
            usesCardLimit: false,
            description: '베어스하우스 10% 할인',
            detail: '',
            condition: {},
            action: { type: 'PERCENT', value: 10 },
            limitConfig: {},
        },
    ],
    evidence: [
        {
            id: 'wefan',
            ruleIds: ['coverage_card_wefan'],
            fields: ['description', 'action'],
            sourceUrl,
            quote: wefanQuote,
        },
        {
            id: 'bears',
            ruleIds: ['coverage_card_bears'],
            fields: ['description', 'action'],
            sourceUrl,
            quote: bearsQuote,
        },
    ],
    unsupportedClauses: [
        {
            id: 'pg-new-meaning',
            ruleIds: ['coverage_card_bears'],
            sourceUrl,
            quote: pgQuote,
            reason: '처음 보는 결제 경로 조건',
            affectsValue: true,
            patternId: 'NEW',
        },
        {
            id: 'installment',
            ruleIds: [],
            sourceUrl,
            quote: installmentQuote,
            reason: '앱이 할부·상품권 거래를 판정할 수 없음',
            affectsValue: true,
            patternId: 'PERF_EXCLUDE_TRANSACTION_TYPE',
        },
    ],
    proposedBrands: [
        {
            id: wefanId,
            name: '위팬샵',
            categoryId: 'shopping',
            aliases: [],
            sourceUrl,
            quote: wefanQuote,
        },
        {
            id: bearsId,
            name: '베어스하우스',
            categoryId: 'shopping',
            aliases: [],
            sourceUrl,
            quote: bearsQuote,
        },
    ],
    notes: [],
};

beforeAll(async () => {
    const journal = JSON.parse(
        readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8'),
    ) as MigrationJournal;
    journal.entries.forEach(entry => {
        sqlite.exec(readFileSync(resolve('drizzle', `${entry.tag}.sql`), 'utf8')
            .replaceAll('--> statement-breakpoint', ''));
    });
    sqlite.pragma('foreign_keys = ON');
    vi.doMock('@/db', () => ({
        db: integrationDb,
        sqlite,
        databasePath: ':memory:',
    }));
    ingestion = await import('./card-benefit-ingestion');
});

afterAll(() => {
    vi.doUnmock('@/db');
    sqlite.close();
});

describe('card benefit review with rule-level coverage', () => {
    it('publishes covered rules, records caveats and registers only used proposed brands', () => {
        integrationDb.insert(schema.user).values({
            id: 'reviewer',
            name: '검수자',
            email: 'reviewer@example.com',
        }).run();
        integrationDb.insert(schema.categories).values({
            id: 'shopping',
            name: '쇼핑',
            userId: null,
            sortOrder: 0,
        }).run();
        integrationDb.insert(schema.cards).values({
            id: 'coverage_card',
            name: '범위 테스트 카드',
            company: '테스트카드',
            color: 'bg-gray-400',
            limitTable: [],
            catalogStatus: 'DRAFT',
        }).run();
        integrationDb.insert(schema.cardBenefitDocuments).values({
            id: 'document',
            cardId: 'coverage_card',
            sourceUrl,
            sourceKind: 'PRODUCT_PAGE',
            mediaType: 'text/html',
            contentHash: 'hash',
            version: 1,
            rawContent: '<html></html>',
            extractedText: [wefanQuote, bearsQuote, pgQuote, installmentQuote].join('\n'),
        }).run();
        integrationDb.insert(schema.cardBenefitCandidates).values({
            id: 'candidate',
            documentId: 'document',
            cardId: 'coverage_card',
            schemaVersion: 2,
            extractor: 'test',
            confidence: 0.9,
            extraction,
            validationErrors: [],
        }).run();

        ingestion.reviewCardBenefitCandidate('candidate', 'APPROVED', 'reviewer');
        const revision = integrationDb.select().from(schema.cardBenefitRevisions)
            .where(and(
                eq(schema.cardBenefitRevisions.cardId, 'coverage_card'),
                eq(schema.cardBenefitRevisions.isActive, true),
            ))
            .get();

        expect(revision?.candidateId).toBe('candidate');
        expect(revision?.snapshot.coverage).toEqual({
            caveats: [
                '일부 거래는 카드사 전월 실적에서 제외되어 예상 실적과 다를 수 있습니다. ' +
                `공식 조건: “${installmentQuote}”`,
            ],
            excludedRules: [{ ruleId: 'coverage_card_bears', description: '베어스하우스 10% 할인' }],
        });
        expect(integrationDb.select().from(schema.benefitRules)
            .where(eq(schema.benefitRules.cardId, 'coverage_card')).all()
            .map(rule => rule.id)).toEqual(['coverage_card_wefan']);
        expect(integrationDb.select().from(schema.brands).all()).toEqual([
            expect.objectContaining({
                id: wefanId,
                name: '위팬샵',
                categoryId: 'shopping',
                userId: null,
                discoveryVisibility: 'AUTO',
            }),
        ]);
        expect(integrationDb.select().from(schema.cards)
            .where(eq(schema.cards.id, 'coverage_card')).get()?.catalogStatus).toBe('PUBLISHED');
    });
});
