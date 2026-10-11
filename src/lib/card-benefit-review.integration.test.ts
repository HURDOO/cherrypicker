import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { CardBenefitExtraction } from '@/types';
import { CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR } from './card-benefit-candidate-selection';
import type { CollectedOfficialDocument } from './official-document-source';
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

const collectedPage = (text: string): CollectedOfficialDocument[] => [{
    definition: {
        id: 'product',
        label: '상품 페이지',
        sourceUrl,
        sourceKind: 'PRODUCT_PAGE',
        format: 'html',
        allowedHosts: ['card.example.com'],
        required: true,
        candidateRole: 'PRIMARY',
    },
    sourceUrl,
    mediaType: 'text/html',
    rawContent: `<html>${text}</html>`,
    extractedText: text,
    contentHash: createHash('sha256').update(text).digest('hex'),
    responseMetadata: {},
}];

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

    it('revises the published extraction without AI and approves it through the normal path', () => {
        const candidateCount = () => integrationDb.select().from(schema.cardBenefitCandidates).all().length;
        const unsupported = ingestion.createCardBenefitRevisionCandidate('coverage_card', {
            note: '근거 없는 할인율',
            rules: { coverage_card_wefan: { action: { value: 25 } } },
        }, { dryRun: true });

        expect(unsupported.validationErrors)
            .toContain('할인율 25%의 공식 숫자 근거가 없습니다: 위팬샵 20% 할인');
        expect(candidateCount()).toBe(1);

        const { candidate, validationErrors } = ingestion.createCardBenefitRevisionCandidate('coverage_card', {
            note: '베어스하우스 규칙 정리',
            removeRuleIds: ['coverage_card_bears'],
        });

        expect(validationErrors).toEqual([]);
        expect(candidate).toMatchObject({
            status: 'PENDING',
            baseRevision: 2,
            extractor: ingestion.CARD_BENEFIT_REVISION_EXTRACTOR,
        });
        expect(candidate?.extraction.unsupportedClauses?.map(clause => clause.id)).toEqual(['installment']);
        expect(() => ingestion.createCardBenefitRevisionCandidate('coverage_card', { note: '중복' }))
            .toThrow('검수 대기 후보');

        ingestion.reviewCardBenefitCandidate(candidate!.id, 'APPROVED', 'reviewer');
        const active = integrationDb.select().from(schema.cardBenefitRevisions)
            .where(and(
                eq(schema.cardBenefitRevisions.cardId, 'coverage_card'),
                eq(schema.cardBenefitRevisions.isActive, true),
            ))
            .get();

        expect(active).toMatchObject({ revision: 3, candidateId: candidate!.id });
        expect(active?.snapshot.coverage?.excludedRules).toEqual([]);
        expect(active?.snapshot.rules.map(rule => rule.id)).toEqual(['coverage_card_wefan']);
    });

    it('replaces a stale candidate of an unpublished card only with an approvable one', () => {
        const draftExtraction: CardBenefitExtraction = {
            ...structuredClone(extraction),
            card: { ...extraction.card, id: 'draft_card', name: '초안 카드' },
            rules: extraction.rules.map(rule => ({ ...rule, id: rule.id.replace('coverage_card', 'draft_card'), cardId: 'draft_card' })),
            evidence: extraction.evidence.map(item => ({
                ...item,
                ruleIds: item.ruleIds.map(ruleId => ruleId.replace('coverage_card', 'draft_card')),
            })),
            unsupportedClauses: extraction.unsupportedClauses!.map(clause => ({
                ...clause,
                ruleIds: clause.ruleIds.map(ruleId => ruleId.replace('coverage_card', 'draft_card')),
            })),
        };
        integrationDb.insert(schema.cards).values({
            id: 'draft_card',
            name: '초안 카드',
            company: '테스트카드',
            color: 'bg-gray-400',
            limitTable: [],
            catalogStatus: 'DRAFT',
        }).run();
        integrationDb.insert(schema.cardBenefitDocuments).values({
            id: 'draft-document',
            cardId: 'draft_card',
            sourceUrl,
            sourceKind: 'PRODUCT_PAGE',
            mediaType: 'text/html',
            contentHash: 'draft-hash',
            version: 1,
            rawContent: '<html></html>',
            extractedText: [wefanQuote, bearsQuote, pgQuote, installmentQuote].join('\n'),
        }).run();
        integrationDb.insert(schema.cardBenefitCandidates).values({
            id: 'stale-candidate',
            documentId: 'draft-document',
            cardId: 'draft_card',
            schemaVersion: 2,
            extractor: 'test',
            confidence: 0.9,
            extraction: draftExtraction,
            validationErrors: ['오래된 오류'],
        }).run();
        const patch = {
            note: 'PG 문구를 등록 패턴으로 재분류',
            unsupportedClauses: { 'pg-new-meaning': { patternId: 'MERCHANT_APPROVAL_PATH' } },
        };

        expect(() => ingestion.createCardBenefitRevisionCandidate('draft_card', patch))
            .toThrow('기준 구조화 결과');
        expect(() => ingestion.createCardBenefitRevisionCandidate('draft_card', patch, {
            baseExtraction: draftExtraction,
        })).toThrow('stale-candidate');

        const { candidate, validationErrors } = ingestion.createCardBenefitRevisionCandidate('draft_card', patch, {
            baseExtraction: draftExtraction,
            replacePending: true,
        });
        const statuses = Object.fromEntries(integrationDb.select().from(schema.cardBenefitCandidates)
            .where(eq(schema.cardBenefitCandidates.cardId, 'draft_card')).all()
            .map(row => [row.id, row.status]));

        expect(validationErrors).toEqual([]);
        expect(candidate).toMatchObject({ baseRevision: 0, documentId: 'draft-document' });
        expect(statuses).toEqual({ 'stale-candidate': 'REJECTED', [candidate!.id]: 'PENDING' });
    });

    it('keeps a changed official source for a reviewed revision while card AI is off', async () => {
        const originalText = [wefanQuote, bearsQuote, pgQuote, installmentQuote].join('\n');
        const changedQuote = '위팬샵 공식 온라인몰 결제 시 30% 할인';
        const changedText = [changedQuote, bearsQuote, pgQuote, installmentQuote].join('\n');
        const statuses = () => Object.fromEntries(integrationDb.select().from(schema.cardBenefitCandidates)
            .where(eq(schema.cardBenefitCandidates.cardId, 'coverage_card')).all()
            .map(row => [row.id, row.status]));
        const wefanRule = () => integrationDb.select().from(schema.benefitRules)
            .where(eq(schema.benefitRules.id, 'coverage_card_wefan')).get();

        const same = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(originalText),
        });
        expect(same).toMatchObject({ status: 'unchanged', cacheHit: true });
        expect(same.revisionRequired).toBeUndefined();

        const changed = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(changedText),
        });
        expect(changed).toMatchObject({
            status: 'created',
            extractor: CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR,
            revisionRequired: true,
        });
        expect(changed.validationErrors[0]).toMatch(/^공식 원문이 바뀌었습니다/);
        expect(changed.validationErrors.length).toBeGreaterThan(1);
        expect(wefanRule()?.action).toEqual({ type: 'PERCENT', value: 20 });

        const again = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(changedText),
        });
        expect(again).toMatchObject({
            status: 'unchanged',
            candidateId: changed.candidateId,
            revisionRequired: true,
        });

        const reverted = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(originalText),
        });
        expect(reverted).toMatchObject({ status: 'unchanged', cacheHit: true });
        expect(statuses()[changed.candidateId]).toBe('REJECTED');
        const changedAgain = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(changedText),
        });
        expect(changedAgain).toMatchObject({ status: 'created', revisionRequired: true });
        expect(changedAgain.validationErrors[0]).toMatch(/^공식 원문이 바뀌었습니다/);

        const sources = ingestion.getCardBenefitRevisionSources('coverage_card');
        expect(sources.current).toMatchObject({ candidateId: changedAgain.candidateId, revisionRequired: true });
        expect(sources.current.documents.map(document => document.extractedText)).toEqual([changedText]);
        expect(sources.published?.documents.map(document => document.extractedText)).toEqual([originalText]);

        const patch = {
            note: '위팬샵 할인율 변경',
            rules: { coverage_card_wefan: { description: '위팬샵 30% 할인', action: { value: 30 } } },
            evidence: { wefan: { quote: changedQuote } },
        };
        expect(() => ingestion.createCardBenefitRevisionCandidate('coverage_card', patch, {
            expectedSourceBundleHash: 'reviewed-other-bundle',
        })).toThrow('공식 문서 묶음');
        expect(ingestion.createCardBenefitRevisionCandidate('coverage_card', {
            note: '근거를 바꾸지 않은 수정안',
            rules: { coverage_card_wefan: { action: { value: 30 } } },
        }, { dryRun: true }).validationErrors).not.toEqual([]);

        const { candidate, validationErrors } = ingestion.createCardBenefitRevisionCandidate('coverage_card', patch, {
            expectedSourceBundleHash: sources.current.sourceBundleHash,
        });
        expect(validationErrors).toEqual([]);
        expect(candidate).toMatchObject({
            documentId: changed.documentId,
            sourceBundleHash: sources.current.sourceBundleHash,
        });
        expect(statuses()[changedAgain.candidateId]).toBe('REJECTED');

        ingestion.reviewCardBenefitCandidate(candidate!.id, 'APPROVED', 'reviewer');
        expect(wefanRule()?.action).toEqual({ type: 'PERCENT', value: 30 });

        const reviewed = await ingestion.collectSystemCardBenefits('coverage_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(changedText),
        });
        expect(reviewed).toMatchObject({ status: 'unchanged', cacheHit: true, candidateId: candidate!.id });
        expect(reviewed.revisionRequired).toBeUndefined();
    });

    it('stores the first official sources of a new card for a reviewed first revision', async () => {
        integrationDb.insert(schema.cards).values({
            id: 'fresh_card',
            name: '새 카드',
            company: '테스트카드',
            color: 'bg-gray-400',
            limitTable: [],
            catalogStatus: 'DRAFT',
        }).run();
        const text = [wefanQuote, bearsQuote, pgQuote, installmentQuote].join('\n');

        const collected = await ingestion.collectSystemCardBenefits('fresh_card', {
            sourcesOnly: true,
            collectedSources: collectedPage(text),
        });
        const placeholder = integrationDb.select().from(schema.cardBenefitCandidates)
            .where(eq(schema.cardBenefitCandidates.id, collected.candidateId)).get();
        expect(collected).toMatchObject({ status: 'created', revisionRequired: true });
        expect(collected.validationErrors[0]).toMatch(/^승인된 구조화 결과가 없는 카드의 공식 원문을 보관했습니다/);
        expect(placeholder?.extraction.rules).toEqual([]);
        await expect(ingestion.collectSystemCardBenefits('fresh_card', {
            sourcesOnly: true,
            forceExtraction: true,
            collectedSources: collectedPage(text),
        })).rejects.toThrow('AI 재추출');

        const rename = (value: string) => value.replace('coverage_card', 'fresh_card');
        const baseExtraction: CardBenefitExtraction = {
            ...structuredClone(extraction),
            card: { ...extraction.card, id: 'fresh_card', name: '새 카드' },
            rules: extraction.rules.map(rule => ({ ...rule, id: rename(rule.id), cardId: 'fresh_card' })),
            evidence: extraction.evidence.map(item => ({ ...item, ruleIds: item.ruleIds.map(rename) })),
            unsupportedClauses: extraction.unsupportedClauses!.map(clause => ({
                ...clause,
                ruleIds: clause.ruleIds.map(rename),
            })),
        };
        const { candidate, validationErrors } = ingestion.createCardBenefitRevisionCandidate('fresh_card', {
            note: '첫 혜택 작성',
        }, { baseExtraction });

        expect(validationErrors).toEqual([]);
        expect(candidate).toMatchObject({ baseRevision: 0, documentId: collected.documentId });
        expect(integrationDb.select().from(schema.cardBenefitCandidates)
            .where(eq(schema.cardBenefitCandidates.id, collected.candidateId)).get()?.status).toBe('REJECTED');
    });
});
