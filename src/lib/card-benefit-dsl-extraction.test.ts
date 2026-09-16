import { describe, expect, it } from 'vitest';
import type { BenefitProgramV1, Card, CardBenefitExtraction } from '@/types';
import { createCardBenefitCandidateAudit } from './card-benefit-audit';
import {
    normalizeEvidenceBackedCardBenefitExtraction,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import {
    evaluateBenefitProgram,
    listBenefitProgramEvidencePaths,
} from '@/utils/benefit-dsl';

const card: Card = {
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

const sourceUrl = 'https://card.kbcard.com/doosan-bears';
const benefitQuote = '두산베어스 입장권 및 구단 상품 결제 시 10% 할인';
const waiverQuote = '신규 회원은 카드 사용등록월의 다음 달 말까지 월 통합할인한도의 50%를 제공합니다.';

const program: BenefitProgramV1 = {
    languageVersion: 1,
    target: {
        includedBrandIds: ['doosan_bears'],
        channels: ['ONLINE', 'OFFLINE'],
    },
    eligibility: { op: 'literal', value: true },
    benefit: {
        op: 'round',
        mode: 'FLOOR',
        unit: 1,
        value: {
            op: 'arithmetic',
            operator: 'MULTIPLY',
            operands: [
                { op: 'input', name: 'PAYMENT_AMOUNT' },
                { op: 'literal', value: 0.1 },
            ],
        },
    },
    usesCardLimit: true,
    cardMonthlyLimit: {
        op: 'case',
        branches: [{
            when: { op: 'input', name: 'NEW_CARD_WINDOW_AVAILABLE' },
            then: {
                op: 'arithmetic',
                operator: 'MULTIPLY',
                operands: [
                    { op: 'input', name: 'CARD_FIRST_BENEFIT_TIER_LIMIT' },
                    { op: 'literal', value: 0.5 },
                ],
            },
        }],
        otherwise: { op: 'input', name: 'CARD_BASE_MONTHLY_LIMIT' },
    },
    confirmations: [{
        when: { op: 'input', name: 'NEW_CARD_WINDOW_AVAILABLE' },
        message: '신규회원 혜택 기간인지 확인',
    }],
    reason: '두산베어스 입장권·구단 상품 10% 할인',
};

const extraction = (): CardBenefitExtraction => ({
    schemaVersion: 2,
    completeness: 'FULL',
    card: {
        id: card.id,
        name: card.name,
        company: card.company,
        limitTable: card.limitTable,
    },
    rules: [{
        id: 'kb_doosan_bears_ticket_goods',
        cardId: card.id,
        includedBrands: ['doosan_bears'],
        excludedBrands: [],
        platformType: 'ALL',
        usesCardLimit: true,
        description: '두산베어스 입장권·구단 상품 10% 할인',
        detail: '',
        condition: {},
        action: { type: 'FLAT', value: 0 },
        limitConfig: {},
        program,
    }],
    evidence: [
        {
            id: 'doosan-benefit',
            ruleIds: ['kb_doosan_bears_ticket_goods'],
            fields: ['description', 'action', 'program'],
            programPaths: listBenefitProgramEvidencePaths(program).filter(path => (
                !path.startsWith('program.cardMonthlyLimit') &&
                !path.startsWith('program.confirmations')
            )),
            sourceUrl,
            quote: benefitQuote,
        },
        {
            id: 'doosan-new-card-cap',
            ruleIds: ['kb_doosan_bears_ticket_goods'],
            fields: ['program'],
            programPaths: listBenefitProgramEvidencePaths(program).filter(path => (
                path.startsWith('program.cardMonthlyLimit') ||
                path.startsWith('program.confirmations')
            )),
            sourceUrl,
            quote: waiverQuote,
        },
    ],
    unsupportedClauses: [],
    notes: [],
});

describe('card benefit DSL extraction gate', () => {
    it('preserves a reviewed purchase situation without inventing a merchant', () => {
        const candidate = extraction();
        const scenarioQuote = 'KBO 정규시즌 두산베어스 홈경기 입장권은 공식 지정 예매처에서 구매한 경우 할인';
        const rule = candidate.rules[0];
        rule.category = 'movie';
        rule.includedBrands = [];
        rule.program = {
            ...program,
            target: {
                purchaseScenario: {
                    id: 'kb_doosan_bears_home_game_ticket',
                    label: '두산 홈경기 입장권',
                    requiredChecks: ['공식 지정 경로의 정규시즌 홈경기 입장권인지 확인'],
                },
            },
        };
        candidate.evidence.push({
            id: 'doosan-purchase-scenario',
            ruleIds: [rule.id],
            fields: ['condition', 'program'],
            programPaths: listBenefitProgramEvidencePaths(rule.program).filter(path => (
                path.startsWith('program.target.purchaseScenario')
            )),
            sourceUrl,
            quote: scenarioQuote,
        });
        const normalized = normalizeEvidenceBackedCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}\n${scenarioQuote}`,
            catalog: {
                categories: [{ id: 'movie', name: '영화' }],
                brands: [],
            },
        });
        const normalizedRule = normalized.rules[0];
        expect(normalizedRule.includedBrands).toEqual([]);
        expect(normalizedRule.program?.target).toMatchObject({
            purchaseScenario: { id: 'kb_doosan_bears_home_game_ticket' },
        });
        expect(normalizedRule.program?.target?.categoryIds).toBeUndefined();
        const validation = validateCardBenefitExtraction(normalized, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}\n${scenarioQuote}`,
        }, {
            categoryIds: new Set(['movie']),
            brandIds: new Set(),
        });
        expect(validation.errors).toEqual([]);

        normalizedRule.category = undefined;
        normalizedRule.condition.itemSpecific = true;
        const itemSpecificValidation = validateCardBenefitExtraction(normalized, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}\n${scenarioQuote}`,
        }, {
            brandIds: new Set(),
        });
        expect(itemSpecificValidation.errors.join('\n')).not.toContain(
            '특정 상품 양수 혜택에 결제처 범위가 없습니다',
        );
    });

    it('keeps a purchase scenario channel when legacy fields are unrestricted', () => {
        const candidate = extraction();
        candidate.rules[0].includedBrands = [];
        candidate.rules[0].program = {
            ...program,
            target: {
                purchaseScenario: {
                    id: 'kb_doosan_bears_home_game_ticket',
                    label: '두산 홈경기 입장권',
                    requiredChecks: ['공식 온라인 예매처인지 확인'],
                },
                channels: ['ONLINE'],
            },
        };
        const normalized = normalizeEvidenceBackedCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}\n공식 온라인 예매처`,
        });
        expect(normalized.rules[0].program?.target?.channels).toEqual(['ONLINE']);
    });

    it('accepts an evidence-backed DSL rule with a safe legacy fallback', () => {
        const candidate = extraction();
        const validation = validateCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        });
        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: { card, rules: [] },
            baselineRevision: 0,
        });

        expect(validation.errors).toEqual([]);
        expect(audit.blockingErrors).toEqual([]);
        expect(audit.coverage).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: 'program.benefit', status: 'COVERED' }),
            expect.objectContaining({
                path: 'program.cardMonthlyLimit',
                status: 'COVERED',
            }),
        ]));
    });

    it('fails closed when a value-affecting official clause remains unsupported', () => {
        const candidate = extraction();
        candidate.unsupportedClauses = [{
            id: 'unknown-cap-formula',
            ruleIds: ['kb_doosan_bears_ticket_goods'],
            sourceUrl,
            quote: waiverQuote,
            reason: '등록일을 판정할 입력이 없음',
            affectsValue: true,
        }];

        expect(validateCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        }).errors).toContain('미지원 문구 1가 계산값에 영향을 주므로 게시할 수 없습니다.');
    });

    it('requires official evidence for every DSL AST node path', () => {
        const candidate = extraction();
        candidate.evidence[0].programPaths = candidate.evidence[0].programPaths?.filter(path => (
            path !== 'program.benefit.value.operands[0]'
        ));

        const errors = validateCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        }).errors;

        expect(errors.join('\n')).toContain('program.benefit.value.operands[0]');
    });

    it('rejects a DSL numeric literal that its mapped official quote does not support', () => {
        const candidate = extraction();
        const benefit = candidate.rules[0].program?.benefit;
        if (benefit?.op !== 'round' || benefit.value.op !== 'arithmetic') {
            throw new Error('테스트 DSL 혜택 구조가 다릅니다.');
        }
        benefit.value.operands[1] = { op: 'literal', value: 0.2 };

        const errors = validateCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        }).errors;

        expect(errors.join('\n')).toContain('program.benefit.value.operands[1]=0.2');
    });

    it('rejects a program target that references an unknown merchant', () => {
        const candidate = extraction();
        candidate.rules[0].program = {
            ...program,
            target: { includedBrandIds: ['invented_merchant'] },
        };

        expect(validateCardBenefitExtraction(candidate, {
            card,
            sourceUrl,
            sourceText: `${benefitQuote}\n${waiverQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        }).errors.join('\n')).toContain('없는 참조 invented_merchant');
    });

    it('composes legacy constraints with a DSL extension and repairs a service monthly cap', () => {
        const tierQuote = '두산베어스 결제 10% 할인, 전월 실적 30만원 이상 월 할인한도 1만원, 80만원 이상 월 할인한도 2만원';
        const newCardQuote = '신규 회원은 전월 실적 30만원 미만인 경우 월 할인한도 50%를 적용합니다.';
        const candidate: CardBenefitExtraction = {
            schemaVersion: 2,
            completeness: 'FULL',
            card: {
                id: card.id,
                name: card.name,
                company: card.company,
                limitTable: [],
            },
            rules: [{
                id: 'generic_dynamic_service_limit',
                cardId: card.id,
                includedBrands: ['doosan_bears'],
                excludedBrands: [],
                platformType: 'ALL',
                usesCardLimit: false,
                description: '두산베어스 결제 10% 할인',
                detail: '',
                condition: {
                    minPerformance: 300_000,
                    performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
                },
                action: { type: 'PERCENT', value: 10 },
                limitConfig: {
                    monthlyAmountByPerformance: [
                        { threshold: 300_000, limit: 10_000 },
                        { threshold: 800_000, limit: 20_000 },
                    ],
                },
                program: {
                    languageVersion: 1,
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
                    cardMonthlyLimit: {
                        op: 'case',
                        branches: [{
                            when: { op: 'input', name: 'NEW_CARD_WINDOW_AVAILABLE' },
                            then: {
                                op: 'arithmetic',
                                operator: 'MULTIPLY',
                                operands: [
                                    { op: 'literal', value: 10_000 },
                                    { op: 'literal', value: 0.5 },
                                ],
                            },
                        }],
                        otherwise: { op: 'literal', value: 10_000 },
                    },
                    reason: '신규회원 서비스 월 한도 조정',
                },
            }],
            evidence: [
                {
                    id: 'tier',
                    ruleIds: ['generic_dynamic_service_limit'],
                    fields: ['description', 'action', 'condition', 'limitConfig'],
                    sourceUrl,
                    quote: tierQuote,
                },
                {
                    id: 'new-card',
                    ruleIds: ['generic_dynamic_service_limit'],
                    fields: ['condition', 'limitConfig'],
                    sourceUrl,
                    quote: newCardQuote,
                },
            ],
            unsupportedClauses: [],
            notes: [],
        };

        const normalized = normalizeEvidenceBackedCardBenefitExtraction(candidate, {
            card: { ...card, limitTable: [] },
            sourceUrl,
            sourceText: `${tierQuote}\n${newCardQuote}`,
            catalog: {
                categories: [],
                brands: [{
                    id: 'doosan_bears',
                    name: '두산베어스',
                    categoryId: 'etc',
                }],
            },
        });
        const normalizedRule = normalized.rules[0];
        const validation = validateCardBenefitExtraction(normalized, {
            card: { ...card, limitTable: [] },
            sourceUrl,
            sourceText: `${tierQuote}\n${newCardQuote}`,
        }, {
            brandIds: new Set(['doosan_bears']),
        });

        expect(normalizedRule.action).toEqual({ type: 'FLAT', value: 0 });
        expect(normalizedRule.program?.cardMonthlyLimit).toBeUndefined();
        expect(normalizedRule.program?.limits?.monthlyBenefitAmount).toBeDefined();
        expect(validation.errors).toEqual([]);
        expect(new Set(normalized.evidence.flatMap(item => item.programPaths ?? [])))
            .toEqual(new Set(listBenefitProgramEvidencePaths(normalizedRule.program!)));

        const evaluation = evaluateBenefitProgram(normalizedRule.program!, {
            paymentAmount: 100_000,
            remainingPaymentAmount: 100_000,
            cardPerformance: 0,
            cardBaseMonthlyLimit: 0,
            cardFirstBenefitTierLimit: 0,
            cardUsedBenefitAmount: 0,
            brandId: 'doosan_bears',
            categoryId: 'etc',
            channel: 'OFFLINE',
            now: new Date('2026-09-08T00:00:00+09:00'),
            newCardWindowAvailable: true,
            usage: {
                dailyCount: 0,
                dailyBenefitAmount: 0,
                monthlyCount: 0,
                monthlyBenefitAmount: 0,
                yearlyCount: 0,
            },
            history: [],
        }, true);
        expect(evaluation.benefitAmount).toBe(5_000);

        const highPerformance = evaluateBenefitProgram(normalizedRule.program!, {
            paymentAmount: 300_000,
            remainingPaymentAmount: 300_000,
            cardPerformance: 800_000,
            cardBaseMonthlyLimit: 0,
            cardFirstBenefitTierLimit: 0,
            cardUsedBenefitAmount: 0,
            brandId: 'doosan_bears',
            categoryId: 'etc',
            channel: 'OFFLINE',
            now: new Date('2026-09-08T00:00:00+09:00'),
            newCardWindowAvailable: true,
            usage: {
                dailyCount: 0,
                dailyBenefitAmount: 0,
                monthlyCount: 0,
                monthlyBenefitAmount: 0,
                yearlyCount: 0,
            },
            history: [],
        }, true);
        expect(highPerformance.benefitAmount).toBe(20_000);
    });
});
