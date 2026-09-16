import { describe, expect, it } from 'vitest';
import type {
    BenefitDslEvaluationContext,
    BenefitDslExpression,
    BenefitProgramV1,
    BenefitRule,
    Card,
} from '@/types';
import { betaCardGoldenScenarios } from '@/test/fixtures/beta-card-golden';
import {
    compileLegacyBenefitRule,
    evaluateBenefitProgram,
    evaluateBenefitProgramCardMonthlyLimit,
    validateBenefitProgram,
    validateBenefitProgramSet,
} from './benefit-dsl';
import { calculateBestCards } from './calculation';

const literal = (value: number | string | boolean | null): BenefitDslExpression => ({
    op: 'literal',
    value,
});
const input = (name: Extract<BenefitDslExpression, { op: 'input' }>['name']): BenefitDslExpression => ({
    op: 'input',
    name,
});

const context = (
    overrides: Partial<BenefitDslEvaluationContext> = {},
): BenefitDslEvaluationContext => ({
    paymentAmount: 10_000,
    remainingPaymentAmount: 10_000,
    cardPerformance: 300_000,
    cardBaseMonthlyLimit: 20_000,
    cardFirstBenefitTierLimit: 10_000,
    cardUsedBenefitAmount: 0,
    brandId: 'merchant',
    categoryId: 'shopping',
    channel: 'OFFLINE',
    now: new Date('2026-09-07T03:00:00.000Z'),
    newCardWindowAvailable: false,
    usage: {
        dailyCount: 0,
        dailyBenefitAmount: 0,
        monthlyCount: 0,
        monthlyBenefitAmount: 0,
        yearlyCount: 0,
    },
    history: [],
    ...overrides,
});

const fixedBenefitProgram = (benefit = 1_000): BenefitProgramV1 => ({
    languageVersion: 1,
    eligibility: literal(true),
    benefit: literal(benefit),
    usesCardLimit: false,
});

const currentCardLimit = (card: Card, performance: number) => {
    const tier = [...card.limitTable]
        .sort((left, right) => right.threshold - left.threshold)
        .find(candidate => performance >= candidate.threshold);
    return tier?.limit ?? (card.limitTable.length === 0 ? 999_999_999 : 0);
};

describe('benefit DSL validation and evaluation', () => {
    it('treats a purchase scenario as a confirmed user-supplied context, not a merchant', () => {
        const program: BenefitProgramV1 = {
            ...fixedBenefitProgram(5_000),
            target: {
                purchaseScenario: {
                    id: 'home_game_ticket',
                    label: '홈경기 입장권',
                    requiredChecks: ['정규시즌 홈경기 입장권인지 확인', '공식 지정 예매처인지 확인'],
                },
            },
        };
        expect(validateBenefitProgram(program).valid).toBe(true);
        expect(evaluateBenefitProgram(program, context())).toMatchObject({
            eligible: false,
            benefitAmount: 0,
        });
        expect(evaluateBenefitProgram(program, context({
            purchaseScenarioId: 'home_game_ticket',
            brandId: undefined,
            categoryId: undefined,
        }))).toMatchObject({
            eligible: true,
            benefitAmount: 5_000,
            certainty: 'CONDITIONAL',
            requiredChecks: program.target?.purchaseScenario?.requiredChecks,
        });
        expect(evaluateBenefitProgram(program, context({
            purchaseScenarioId: 'home_game_ticket',
            brandId: undefined,
            categoryId: undefined,
        }), true)).toMatchObject({ certainty: 'CONFIRMED' });
        expect(validateBenefitProgram({
            ...program,
            target: { ...program.target, categoryIds: ['movie'] },
        }).errors.join('\n')).toContain('동시에 지정할 수 없습니다');
        const rule: BenefitRule = {
            id: 'test-rule',
            cardId: 'test_card',
            includedBrands: [],
            excludedBrands: [],
            description: '테스트',
            detail: '',
            condition: {},
            action: { type: 'FLAT', value: 0 },
            limitConfig: {},
            program,
        };
        expect(validateBenefitProgramSet([rule]).join('\n')).toContain('카드 ID test_card');
        expect(validateBenefitProgramSet([{
            ...rule,
            program: {
                ...program,
                target: {
                    purchaseScenario: {
                        ...program.target!.purchaseScenario!,
                        id: 'test_card_home_game_ticket',
                    },
                },
            },
        }])).toEqual([]);
    });

    it('rejects unknown operators, input names, nested aggregates, and oversized programs', () => {
        const unknown = {
            languageVersion: 1,
            eligibility: { op: 'executeJavascript', source: 'return true' },
            benefit: { op: 'input', name: 'SECRET_VALUE' },
        };
        expect(validateBenefitProgram(unknown)).toMatchObject({ valid: false });
        expect(validateBenefitProgram(unknown).errors.join('\n')).toContain('허용되지 않은 op');
        expect(validateBenefitProgram(unknown).errors.join('\n')).toContain('허용되지 않은 input');

        const unknownFields = {
            ...fixedBenefitProgram(),
            execute: 'arbitrary-code',
            benefit: { op: 'literal', value: 1_000, currency: 'KRW' },
        };
        expect(validateBenefitProgram(unknownFields).errors.join('\n'))
            .toContain('program.execute: 허용되지 않은 필드');
        expect(validateBenefitProgram(unknownFields).errors.join('\n'))
            .toContain('program.benefit.currency: 허용되지 않은 필드');

        const nestedAggregate: BenefitProgramV1 = {
            ...fixedBenefitProgram(),
            eligibility: {
                op: 'compare',
                operator: 'GT',
                left: {
                    op: 'aggregate',
                    function: 'COUNT',
                    period: 'MONTH',
                    field: 'PAYMENT_AMOUNT',
                    where: {
                        op: 'compare',
                        operator: 'GT',
                        left: {
                            op: 'aggregate',
                            function: 'SUM',
                            period: 'MONTH',
                            field: 'PAYMENT_AMOUNT',
                        },
                        right: literal(0),
                    },
                },
                right: literal(0),
            },
        };
        expect(validateBenefitProgram(nestedAggregate).errors.join('\n'))
            .toContain('집계 안에 다른 집계를 중첩할 수 없습니다');

        let deep: BenefitDslExpression = literal(true);
        for (let index = 0; index < 20; index += 1) deep = { op: 'not', value: deep };
        expect(validateBenefitProgram({ ...fixedBenefitProgram(), eligibility: deep }).errors.join('\n'))
            .toContain('중첩 깊이');

        const cyclic = { op: 'not' } as unknown as Extract<
            BenefitDslExpression,
            { op: 'not' }
        >;
        cyclic.value = cyclic;
        expect(validateBenefitProgram({ ...fixedBenefitProgram(), eligibility: cyclic }).errors.join('\n'))
            .toContain('중첩 깊이');
    });

    it('expresses a new-card percentage of the ordinary monthly cap as data', () => {
        const program: BenefitProgramV1 = {
            languageVersion: 1,
            eligibility: literal(true),
            benefit: {
                op: 'round',
                mode: 'FLOOR',
                unit: 1,
                value: {
                    op: 'arithmetic',
                    operator: 'MULTIPLY',
                    operands: [input('PAYMENT_AMOUNT'), literal(0.1)],
                },
            },
            cardMonthlyLimit: {
                op: 'case',
                branches: [{
                    when: input('NEW_CARD_WINDOW_AVAILABLE'),
                    then: {
                        op: 'arithmetic',
                        operator: 'MULTIPLY',
                        operands: [input('CARD_FIRST_BENEFIT_TIER_LIMIT'), literal(0.5)],
                    },
                }],
                otherwise: input('CARD_BASE_MONTHLY_LIMIT'),
            },
        };

        expect(evaluateBenefitProgramCardMonthlyLimit(program, context({
            newCardWindowAvailable: true,
        }))).toBe(5_000);
        expect(evaluateBenefitProgramCardMonthlyLimit(program, context({
            newCardWindowAvailable: false,
        }))).toBe(20_000);
    });

    it('expresses a filtered nth transaction without a new evaluator branch', () => {
        const program: BenefitProgramV1 = {
            ...fixedBenefitProgram(2_000),
            target: { includedBrandIds: ['taxi'] },
            eligibility: {
                op: 'compare',
                operator: 'EQ',
                left: {
                    op: 'aggregate',
                    function: 'COUNT',
                    period: 'MONTH',
                    field: 'PAYMENT_AMOUNT',
                    includeCurrent: true,
                    where: {
                        op: 'compare',
                        operator: 'EQ',
                        left: input('BRAND_ID'),
                        right: literal('taxi'),
                    },
                },
                right: literal(3),
            },
        };
        const result = evaluateBenefitProgram(program, context({
            brandId: 'taxi',
            categoryId: 'transport',
            history: [
                { occurredAt: '2026-09-01T03:00:00.000Z', paymentAmount: 8_000, benefitAmount: 0, brandId: 'taxi', categoryId: 'transport' },
                { occurredAt: '2026-09-03T03:00:00.000Z', paymentAmount: 9_000, benefitAmount: 0, brandId: 'taxi', categoryId: 'transport' },
            ],
        }));

        expect(result).toMatchObject({ eligible: true, benefitAmount: 2_000 });
    });

    it('selects the highest-spend group using history plus the current transaction', () => {
        const program: BenefitProgramV1 = {
            ...fixedBenefitProgram(500),
            eligibility: {
                op: 'isTopGroup',
                period: 'MONTH',
                groupBy: 'CATEGORY_ID',
                metric: 'PAYMENT_AMOUNT',
                includeCurrent: true,
            },
        };
        const history = [
            { occurredAt: '2026-09-01T03:00:00.000Z', paymentAmount: 10_000, benefitAmount: 0, categoryId: 'cafe' },
            { occurredAt: '2026-09-02T03:00:00.000Z', paymentAmount: 5_000, benefitAmount: 0, categoryId: 'food' },
        ];

        expect(evaluateBenefitProgram(program, context({
            paymentAmount: 6_000,
            remainingPaymentAmount: 6_000,
            categoryId: 'food',
            history,
        }))).toMatchObject({ eligible: true, benefitAmount: 500 });
        expect(evaluateBenefitProgram(program, context({
            paymentAmount: 4_000,
            remainingPaymentAmount: 4_000,
            categoryId: 'food',
            history,
        }))).toMatchObject({ eligible: false, benefitAmount: 0 });
    });

    it('caps different rules against the same externally supplied group usage', () => {
        const first = {
            ...fixedBenefitProgram(200),
            usageGroupId: 'shared-service',
            limits: { monthlyBenefitAmount: literal(1_000) },
        } satisfies BenefitProgramV1;
        const second = {
            ...fixedBenefitProgram(300),
            usageGroupId: 'shared-service',
            limits: { monthlyBenefitAmount: literal(1_000) },
        } satisfies BenefitProgramV1;
        const sharedContext = context({
            usage: {
                dailyCount: 0,
                dailyBenefitAmount: 0,
                monthlyCount: 1,
                monthlyBenefitAmount: 900,
                yearlyCount: 1,
            },
        });

        expect(evaluateBenefitProgram(first, sharedContext).benefitAmount).toBe(100);
        expect(evaluateBenefitProgram(second, sharedContext).benefitAmount).toBe(100);
    });

    it.each(betaCardGoldenScenarios)(
        'compiles legacy $id into an equivalent DSL result',
        scenario => {
            const program = compileLegacyBenefitRule(scenario.rule);
            const cardLimit = currentCardLimit(scenario.card, scenario.performance);
            const result = evaluateBenefitProgram(program, context({
                paymentAmount: scenario.amount,
                remainingPaymentAmount: scenario.amount,
                cardPerformance: scenario.performance,
                cardBaseMonthlyLimit: cardLimit,
                cardFirstBenefitTierLimit: [...scenario.card.limitTable]
                    .filter(tier => tier.limit > 0)
                    .sort((left, right) => left.threshold - right.threshold)[0]?.limit ?? cardLimit,
                brandId: scenario.target.id,
                categoryId: scenario.target.categoryId,
                channel: scenario.isOnline ? 'ONLINE' : 'OFFLINE',
            }), true);

            expect(validateBenefitProgram(program)).toMatchObject({ valid: true });
            expect(result.errors).toEqual([]);
            expect(result.benefitAmount).toBe(scenario.expectedBenefit);
            expect(result.certainty).toBe('CONFIRMED');
        },
    );

    it('runs the Doosan-style dynamic cap through the public card calculator', () => {
        const doosanCard: Card = {
            id: 'kb_doosan_bears',
            name: '두산베어스 KB국민카드',
            company: 'KB국민카드',
            color: 'bg-blue-500',
            limitTable: [
                { threshold: 800_000, limit: 30_000 },
                { threshold: 300_000, limit: 20_000 },
                { threshold: 0, limit: 0 },
            ],
        };
        const newCardCondition: BenefitDslExpression = {
            op: 'logic',
            operator: 'ALL',
            operands: [
                {
                    op: 'compare',
                    operator: 'LT',
                    left: input('CARD_PERFORMANCE'),
                    right: literal(300_000),
                },
                input('NEW_CARD_WINDOW_AVAILABLE'),
            ],
        };
        const doosanProgram: BenefitProgramV1 = {
            languageVersion: 1,
            target: { includedBrandIds: ['doosan_bears'] },
            eligibility: {
                op: 'logic',
                operator: 'ANY',
                operands: [
                    {
                        op: 'compare',
                        operator: 'GTE',
                        left: input('CARD_PERFORMANCE'),
                        right: literal(300_000),
                    },
                    newCardCondition,
                ],
            },
            benefit: {
                op: 'round',
                mode: 'FLOOR',
                unit: 1,
                value: {
                    op: 'arithmetic',
                    operator: 'MULTIPLY',
                    operands: [input('PAYMENT_AMOUNT'), literal(0.1)],
                },
            },
            cardMonthlyLimit: {
                op: 'case',
                branches: [{
                    when: newCardCondition,
                    then: {
                        op: 'arithmetic',
                        operator: 'MULTIPLY',
                        operands: [input('CARD_FIRST_BENEFIT_TIER_LIMIT'), literal(0.5)],
                    },
                }],
                otherwise: input('CARD_BASE_MONTHLY_LIMIT'),
            },
            usesCardLimit: true,
            confirmations: [{
                when: newCardCondition,
                message: '신규회원 혜택 기간인지 확인',
            }],
            reason: '두산베어스 입장권·구단 상품 10% 할인',
        };
        const doosanRule = {
            id: 'kb_doosan_bears_ticket_goods',
            cardId: doosanCard.id,
            includedBrands: ['doosan_bears'],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: true,
            description: '두산베어스 입장권·구단 상품 10% 할인',
            detail: '',
            condition: {},
            action: { type: 'FLAT' as const, value: 0 },
            limitConfig: {},
            program: doosanProgram,
        };
        const doosan = { id: 'doosan_bears', name: '두산베어스', categoryId: 'sports' };
        const other = { id: 'other', name: '다른 결제처', categoryId: 'sports' };
        const calculateDoosan = (
            history: Parameters<typeof calculateBestCards>[4] = [],
            confirm = true,
            allowPerformanceWaiver = true,
            performance = 0,
            target = doosan,
        ) => calculateBestCards(
            10_000,
            target,
            [doosanCard],
            [doosanRule],
            history,
            [{ cardId: doosanCard.id, performanceMonth: '2026-08', amount: performance }],
            false,
            {
                now: new Date('2026-09-07T03:00:00.000Z'),
                allowPerformanceWaiver,
                confirmedConditionIds: confirm ? [`card-rule:${doosanRule.id}`] : [],
            },
        )[0];

        expect(calculateDoosan()).toMatchObject({
            calculatedDiscount: 1_000,
            confirmedDiscount: 1_000,
            monthlyMaxLimit: 10_000,
        });
        expect(calculateDoosan([], false)).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_000,
        });
        expect(calculateDoosan([], true, false)).toMatchObject({
            calculatedDiscount: 0,
            isApplicable: false,
        });
        expect(calculateDoosan([], true, false, 300_000)).toMatchObject({
            calculatedDiscount: 1_000,
            monthlyMaxLimit: 20_000,
        });
        const generalSportsRule = {
            id: 'kb_doosan_bears_general_sports',
            cardId: doosanCard.id,
            includedBrands: ['other'],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: true,
            description: '일반 스포츠 결제 10% 할인',
            detail: '',
            condition: {},
            action: { type: 'PERCENT' as const, value: 10 },
            limitConfig: {},
        };
        expect(calculateBestCards(
            100_000,
            other,
            [doosanCard],
            [doosanRule, generalSportsRule],
            [],
            [{ cardId: doosanCard.id, performanceMonth: '2026-08', amount: 0 }],
            false,
            {
                now: new Date('2026-09-07T03:00:00.000Z'),
                allowPerformanceWaiver: true,
            },
        )[0]).toMatchObject({
            calculatedDiscount: 10_000,
            monthlyMaxLimit: 10_000,
        });
        expect(calculateDoosan([{
            id: 'past',
            date: '2026-09-05T03:00:00.000Z',
            brandId: doosan.id,
            cardId: doosanCard.id,
            ruleId: doosanRule.id,
            amount: 95_000,
            discountAmount: 9_500,
        }])).toMatchObject({
            calculatedDiscount: 500,
            remainingLimit: 500,
        });
        expect(calculateDoosan([], true, true, 0, other)).toMatchObject({
            calculatedDiscount: 0,
            isApplicable: false,
        });
    });

    it('scopes aggregate history to the card being evaluated', () => {
        const card: Card = {
            id: 'dsl_history_card',
            name: 'DSL 이력 카드',
            company: '테스트',
            color: 'bg-blue-500',
            limitTable: [],
        };
        const merchant = { id: 'taxi', name: '택시', categoryId: 'transport' };
        const program: BenefitProgramV1 = {
            ...fixedBenefitProgram(2_000),
            target: { includedBrandIds: [merchant.id] },
            eligibility: {
                op: 'compare',
                operator: 'EQ',
                left: {
                    op: 'aggregate',
                    function: 'COUNT',
                    period: 'MONTH',
                    field: 'PAYMENT_AMOUNT',
                    includeCurrent: true,
                },
                right: literal(1),
            },
        };
        const rule = {
            id: 'dsl_history_rule',
            cardId: card.id,
            includedBrands: [merchant.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: false,
            description: '첫 번째 결제 할인',
            detail: '',
            condition: {},
            action: { type: 'FLAT' as const, value: 0 },
            limitConfig: {},
            program,
        };

        expect(calculateBestCards(
            10_000,
            merchant,
            [card],
            [rule],
            [{
                id: 'other-card-transaction',
                date: '2026-09-01T03:00:00.000Z',
                brandId: merchant.id,
                cardId: 'another_card',
                amount: 10_000,
                discountAmount: 0,
            }],
            [],
            false,
            { now: new Date('2026-09-07T03:00:00.000Z') },
        )[0]).toMatchObject({
            calculatedDiscount: 2_000,
            isApplicable: true,
        });
    });
});
