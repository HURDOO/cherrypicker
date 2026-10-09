import { describe, expect, it } from 'vitest';
import type { BenefitProgramV1, BenefitRule, CardBenefitExtraction } from '@/types';
import {
    applyBenefitCoveragePatterns,
    BENEFIT_COVERAGE_PATTERNS,
    cardBenefitCoverageCaveats,
    toCardBenefitCoverageSummary,
} from './benefit-coverage-patterns';
import { evaluateBenefitProgram, listBenefitProgramEvidencePaths } from '@/utils/benefit-dsl';
import { createCardBenefitCandidateAudit } from './card-benefit-audit';
import { buildCardBenefitSupports } from './card-benefit-support';

const sourceUrl = 'https://card.example.com/benefits';

const program: BenefitProgramV1 = {
    languageVersion: 1,
    target: { includedBrandIds: ['cafe_a'] },
    eligibility: { op: 'literal', value: true },
    benefit: {
        op: 'arithmetic',
        operator: 'MULTIPLY',
        operands: [
            { op: 'input', name: 'PAYMENT_AMOUNT' },
            { op: 'literal', value: 0.1 },
        ],
    },
    usesCardLimit: false,
};

const rule = (id: string, overrides: Partial<BenefitRule> = {}): BenefitRule => ({
    id,
    cardId: 'card_a',
    includedBrands: ['cafe_a'],
    description: `${id} 10% 할인`,
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value: 10 },
    limitConfig: {},
    ...overrides,
});

const extraction = (
    rules: BenefitRule[],
    unsupportedClauses: CardBenefitExtraction['unsupportedClauses'],
): CardBenefitExtraction => ({
    schemaVersion: 2,
    completeness: 'FULL',
    card: { id: 'card_a', name: '카드 A', company: '카드사', limitTable: [] },
    rules,
    evidence: rules.map(item => ({
        id: `evidence-${item.id}`,
        ruleIds: [item.id],
        fields: item.program ? ['description', 'action', 'program'] : ['description', 'action'],
        ...(item.program && { programPaths: listBenefitProgramEvidencePaths(item.program) }),
        sourceUrl,
        quote: `${item.description}`,
    })),
    unsupportedClauses,
    notes: [],
});

const clause = (
    id: string,
    ruleIds: string[],
    patternId?: string,
    affectsValue = true,
) => ({
    id,
    ruleIds,
    sourceUrl,
    quote: `공식 문구 ${id}`,
    reason: '앱 입력으로 판정할 수 없음',
    affectsValue,
    ...(patternId && { patternId }),
});

describe('benefit coverage patterns', () => {
    it('keeps registered pattern IDs unique and upper snake case', () => {
        const ids = BENEFIT_COVERAGE_PATTERNS.map(pattern => pattern.id);
        expect(new Set(ids).size).toBe(ids.length);
        ids.forEach(id => expect(id).toMatch(/^[A-Z][A-Z0-9_]{1,63}$/));
    });

    it('leaves candidates without value-affecting clauses unchanged', () => {
        const input = extraction([rule('rule_a')], [clause('note', ['rule_a'], undefined, false)]);
        const { value, result } = applyBenefitCoveragePatterns(input);

        expect(value).toBe(input);
        expect(result.outcomes).toEqual([]);
        expect(result.blockingErrors).toEqual([]);
    });

    it('turns a confirmable clause into a user check on a legacy rule only', () => {
        const input = extraction(
            [rule('rule_a'), rule('rule_b')],
            [clause('pg', ['rule_a'], 'MERCHANT_APPROVAL_PATH')],
        );
        const { value, result } = applyBenefitCoveragePatterns(input);
        const [lowered, untouched] = value.rules;

        expect(lowered.condition).toMatchObject({
            confirmationRequired: true,
            requiredNote: '카드사 승인 가맹점(업종)으로 직접 결제되는지 확인',
        });
        expect(lowered.action).toEqual({ type: 'PERCENT', value: 10 });
        expect(untouched).toEqual(input.rules[1]);
        expect(value.evidence).toContainEqual(expect.objectContaining({
            id: 'coverage-pg-rule_a',
            ruleIds: ['rule_a'],
            fields: ['condition'],
            quote: '공식 문구 pg',
        }));
        expect(result.outcomes).toEqual([{
            clauseId: 'pg',
            patternId: 'MERCHANT_APPROVAL_PATH',
            level: 'CONFIRM',
            ruleIds: ['rule_a'],
        }]);
        expect(input.rules[0].condition).toEqual({});
    });

    it('adds an evidenced DSL confirmation so the benefit stays conditional until checked', () => {
        const input = extraction(
            [rule('rule_a', { action: { type: 'FLAT', value: 0 }, program })],
            [clause('pg', ['rule_a'], 'MERCHANT_APPROVAL_PATH')],
        );
        const { value } = applyBenefitCoveragePatterns(input);
        const lowered = value.rules[0];

        expect(lowered.program?.confirmations).toEqual([{
            when: { op: 'literal', value: true },
            message: '카드사 승인 가맹점(업종)으로 직접 결제되는지 확인',
        }]);
        const coverageEvidence = value.evidence.find(item => item.id === 'coverage-pg-rule_a');
        expect(coverageEvidence?.fields).toEqual(['condition', 'program']);
        expect(coverageEvidence?.programPaths).toEqual([
            'program.confirmations[0].when',
            'program.confirmations[0].message',
        ]);

        const context = {
            paymentAmount: 10_000,
            remainingPaymentAmount: 10_000,
            cardPerformance: 0,
            cardBaseMonthlyLimit: 0,
            cardFirstBenefitTierLimit: 0,
            cardUsedBenefitAmount: 0,
            brandId: 'cafe_a',
            channel: 'OFFLINE' as const,
            now: new Date('2026-10-10T03:00:00Z'),
            newCardWindowAvailable: false,
            usage: {
                dailyCount: 0,
                dailyBenefitAmount: 0,
                monthlyCount: 0,
                monthlyBenefitAmount: 0,
                yearlyCount: 0,
            },
            history: [],
        };
        const unchecked = evaluateBenefitProgram(lowered.program!, context);
        expect(unchecked.benefitAmount).toBe(1_000);
        expect(unchecked.certainty).toBe('CONDITIONAL');
        expect(unchecked.requiredChecks).toContain('카드사 승인 가맹점(업종)으로 직접 결제되는지 확인');
        expect(evaluateBenefitProgram(lowered.program!, context, true).certainty).toBe('CONFIRMED');
    });

    it('turns an information pattern into a zero-value note and drops program evidence for that rule', () => {
        const input = extraction(
            [
                rule('rule_a', { action: { type: 'FLAT', value: 0 }, program }),
                rule('rule_b', { action: { type: 'FLAT', value: 0 }, program }),
            ],
            [clause('lounge', ['rule_a'], 'INFO_NON_CASH')],
        );
        input.evidence = [{
            id: 'shared',
            ruleIds: ['rule_a', 'rule_b'],
            fields: ['description', 'action', 'program'],
            programPaths: listBenefitProgramEvidencePaths(program),
            sourceUrl,
            quote: '공통 근거',
        }];
        const { value } = applyBenefitCoveragePatterns(input);
        const [information, computed] = value.rules;

        expect(information.program).toBeUndefined();
        expect(information.action).toEqual({ type: 'FLAT', value: 0 });
        expect(information.condition).toMatchObject({
            manualCheckRequired: true,
            requiredNote: '현금 할인이 아닌 혜택이라 금액을 자동 계산하지 않습니다.',
        });
        expect(computed.program).toEqual(program);
        expect(value.evidence).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'shared', ruleIds: ['rule_b'], fields: ['description', 'action', 'program'] }),
            expect.objectContaining({ id: 'shared-information', ruleIds: ['rule_a'], fields: ['description', 'action'] }),
        ]));
        expect(value.evidence.find(item => item.id === 'shared-information')).not.toHaveProperty('programPaths');
    });

    it('records card caveats without changing rules', () => {
        const input = extraction(
            [rule('rule_a')],
            [clause('installment', [], 'PERF_EXCLUDE_TRANSACTION_TYPE')],
        );
        const { value, result } = applyBenefitCoveragePatterns(input);

        expect(value.rules).toEqual(input.rules);
        expect(result.caveats).toEqual([
            '일부 거래는 카드사 전월 실적에서 제외되어 예상 실적과 다를 수 있습니다. 공식 조건: “공식 문구 installment”',
        ]);
        expect(result.blockingErrors).toEqual([]);
    });

    it('keeps rules of unregistered patterns unpublished, with their fallbacks', () => {
        const input = extraction(
            [
                rule('rule_a'),
                rule('rule_b', { condition: { fallbackAfterRuleIds: ['rule_a'] } }),
                rule('rule_c', { condition: { stackableWithRuleIds: ['rule_a'] } }),
            ],
            [clause('unknown', ['rule_a'], 'NEW')],
        );
        const { value, result } = applyBenefitCoveragePatterns(input);

        expect(value.rules.map(item => item.id)).toEqual(['rule_c']);
        expect(value.rules[0].condition).toEqual({});
        expect(value.evidence.map(item => item.ruleIds)).toEqual([['rule_c']]);
        expect(result.excludedRules).toEqual([
            { ruleId: 'rule_a', description: 'rule_a 10% 할인' },
            { ruleId: 'rule_b', description: 'rule_b 10% 할인' },
        ]);
        expect(result.outcomes[0]).toMatchObject({ level: 'UNREGISTERED', patternId: 'NEW' });
        expect(result.originalRuleIds).toEqual(['rule_a', 'rule_b', 'rule_c']);
        expect(result.blockingErrors).toEqual([]);
    });

    it('lets the strongest lowering win when clauses overlap', () => {
        const input = extraction(
            [rule('rule_a')],
            [
                clause('pg', ['rule_a'], 'MERCHANT_APPROVAL_PATH'),
                clause('rate', ['rule_a'], 'INFO_MULTI_RATE_UNRESOLVED'),
            ],
        );
        const { value } = applyBenefitCoveragePatterns(input);

        expect(value.rules[0].action).toEqual({ type: 'FLAT', value: 0 });
        expect(value.rules[0].condition.manualCheckRequired).toBe(true);
        expect(value.rules[0].condition.confirmationRequired).toBeUndefined();
    });

    it('blocks the card for card-wide clauses that cannot be lowered', () => {
        expect(applyBenefitCoveragePatterns(extraction(
            [rule('rule_a')],
            [clause('cap', [], 'CARD_WIDE_LIMIT_UNMODELED')],
        )).result.blockingErrors).toEqual([
            '미지원 문구 cap(CARD_WIDE_LIMIT_UNMODELED)가 카드 전체 계산을 제한해 게시할 수 없습니다.',
        ]);
        expect(applyBenefitCoveragePatterns(extraction(
            [rule('rule_a')],
            [clause('mystery', [])],
        )).result.blockingErrors).toEqual([
            '카드 전체에 걸린 미지원 문구 mystery의 패턴이 등록되지 않았습니다.',
        ]);
    });

    it('blocks the card when no rule is left to publish', () => {
        expect(applyBenefitCoveragePatterns(extraction(
            [rule('rule_a')],
            [clause('unknown', ['rule_a'])],
        )).result.blockingErrors).toEqual([
            '미지원 문구를 반영하고 나면 게시할 수 있는 규칙이 남지 않습니다.',
        ]);
    });

    it('summarizes published coverage as public caveats', () => {
        const summary = toCardBenefitCoverageSummary({
            caveats: ['실적 제외 안내'],
            excludedRules: [{ ruleId: 'rule_a', description: '홈경기 F&B 할인' }],
        });

        expect(cardBenefitCoverageCaveats(summary)).toEqual([
            '실적 제외 안내',
            '아직 반영하지 않은 혜택: 홈경기 F&B 할인',
        ]);
        expect(toCardBenefitCoverageSummary({ caveats: [], excludedRules: [] })).toBeUndefined();
    });

    it('audits a published rule kept out by an unregistered clause as a high-risk removal', () => {
        const published = rule('rule_a');
        const audit = createCardBenefitCandidateAudit({
            extraction: extraction(
                [published, rule('rule_b')],
                [clause('unknown', ['rule_a'], 'NEW')],
            ),
            baseline: {
                card: { id: 'card_a', name: '카드 A', company: '카드사', color: 'bg-gray-400', limitTable: [] },
                rules: [published],
            },
            baselineRevision: 1,
            asOfDate: '2026-10-10',
        });

        expect(audit.changes).toContainEqual(expect.objectContaining({
            entityId: 'rule_a',
            kind: 'REMOVED',
            risk: 'HIGH',
        }));
    });

    it('shows published coverage caveats in the public card support', () => {
        const support = buildCardBenefitSupports([{
            id: 'card_a',
            name: '카드 A',
            company: '카드사',
            color: 'bg-gray-400',
            limitTable: [],
        }], [{
            cardId: 'card_a',
            candidateId: 'candidate-1',
            publishedAt: '2026-10-10T03:00:00.000Z',
            coverageCaveats: ['아직 반영하지 않은 혜택: 홈경기 F&B 할인'],
        }], [])[0];

        expect(support.caveats).toContain('아직 반영하지 않은 혜택: 홈경기 F&B 할인');
    });
});
