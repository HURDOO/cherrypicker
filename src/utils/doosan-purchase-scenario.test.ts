import { describe, expect, it } from 'vitest';
import type {
    BenefitDslExpression,
    BenefitProgramV1,
    BenefitRule,
    Card,
    PaymentTarget,
    TransactionHistory,
} from '@/types';
import { calculateBestCards } from './calculation';
import { calculatePerformanceContribution } from './performance-policy';
import { validateBenefitProgramSet } from './benefit-dsl';

const card: Card = {
    id: 'kb_doosan_bears',
    name: '두산베어스 KB카드',
    company: 'KB국민카드',
    color: 'bg-blue-500',
    limitTable: [],
};
const ticketGoodsGroupId = 'kb_doosan_bears_ticket_goods';
const literal = (value: number): BenefitDslExpression => ({ op: 'literal', value });
const performanceAtLeast = (amount: number): BenefitDslExpression => ({
    op: 'compare',
    operator: 'GTE',
    left: { op: 'input', name: 'CARD_PERFORMANCE' },
    right: literal(amount),
});
const newCardAtLowPerformance: BenefitDslExpression = {
    op: 'logic',
    operator: 'ALL',
    operands: [
        { op: 'input', name: 'NEW_CARD_WINDOW_AVAILABLE' },
        {
            op: 'compare',
            operator: 'LT',
            left: { op: 'input', name: 'CARD_PERFORMANCE' },
            right: literal(300_000),
        },
    ],
};
const createRule = ({
    id,
    scenarioId,
    label,
    checks,
    rate,
    cap30,
    cap80,
    groupId,
}: {
    id: string;
    scenarioId: string;
    label: string;
    checks: string[];
    rate: number;
    cap30: number;
    cap80: number;
    groupId?: string;
}): BenefitRule => {
    const program: BenefitProgramV1 = {
        languageVersion: 1,
        target: {
            purchaseScenario: { id: scenarioId, label, requiredChecks: checks },
        },
        eligibility: {
            op: 'logic',
            operator: 'ANY',
            operands: [performanceAtLeast(300_000), newCardAtLowPerformance],
        },
        benefit: {
            op: 'arithmetic',
            operator: 'MULTIPLY',
            operands: [
                { op: 'input', name: 'PAYMENT_AMOUNT' },
                literal(rate),
            ],
        },
        limits: {
            monthlyBenefitAmount: {
                op: 'case',
                branches: [
                    {
                        when: newCardAtLowPerformance,
                        then: literal(cap30 / 2),
                    },
                    { when: performanceAtLeast(800_000), then: literal(cap80) },
                    { when: performanceAtLeast(300_000), then: literal(cap30) },
                ],
                otherwise: literal(0),
            },
        },
        ...(groupId && { usageGroupId: groupId }),
        usesCardLimit: false,
    };
    return {
        id,
        cardId: card.id,
        includedBrands: [],
        excludedBrands: [],
        platformType: 'ALL',
        ...(groupId && { sharedGroupId: groupId }),
        usesCardLimit: false,
        description: label,
        detail: '',
        condition: {
            minPerformance: 300_000,
            performanceWaiver: 'NEW_CARD_REGISTRATION_WINDOW',
            manualCheckRequired: true,
        },
        action: { type: 'FLAT', value: 0 },
        limitConfig: {
            monthlyAmountByPerformance: [
                { threshold: 300_000, limit: cap30 },
                { threshold: 800_000, limit: cap80 },
            ],
            ...(groupId && { sharedFields: ['monthlyAmount'] }),
        },
        program,
    };
};
const ticket = createRule({
    id: 'kb_doosan_bears_ticket',
    scenarioId: 'kb_doosan_bears_home_ticket',
    label: '두산베어스 홈경기 티켓',
    checks: ['지정 예매처인지 확인', 'KBO 정규시즌 홈경기인지 확인'],
    rate: 0.5,
    cap30: 10_000,
    cap80: 20_000,
    groupId: ticketGoodsGroupId,
});
const goods = createRule({
    id: 'kb_doosan_bears_goods',
    scenarioId: 'kb_doosan_bears_goods',
    label: '두산베어스 지정 굿즈·용품',
    checks: ['위팬·NOL 상품샵 등 지정 판매처인지 확인'],
    rate: 0.5,
    cap30: 10_000,
    cap80: 20_000,
    groupId: ticketGoodsGroupId,
});
const stadiumFood = createRule({
    id: 'kb_doosan_bears_stadium_food',
    scenarioId: 'kb_doosan_bears_stadium_food',
    label: '잠실야구장 지정 F&B',
    checks: ['지정 F&B 업체인지 확인', 'GS25 등 제외 매장이 아닌지 확인'],
    rate: 0.2,
    cap30: 5_000,
    cap80: 10_000,
});
const rules = [ticket, goods, stadiumFood];
const scenarioTarget = (scenarioId: string): PaymentTarget => ({
    kind: 'SCENARIO', scenarioId, label: scenarioId,
});
const calculate = (
    target: PaymentTarget,
    amount: number,
    performance: number,
    history: TransactionHistory[] = [],
    newCardWindowAvailable = false,
) => calculateBestCards(
    amount,
    target,
    [card],
    rules,
    history,
    [{ cardId: card.id, performanceMonth: '2026-09', amount: performance }],
    false,
    { now: new Date('2026-09-12T03:00:00.000Z'), allowPerformanceWaiver: newCardWindowAvailable },
)[0];

describe('Doosan official purchase-scenario boundaries', () => {
    it('excludes the full approved sale, not merely the discount, from next-month performance', () => {
        const result = calculatePerformanceContribution({
            policy: {
                version: 1,
                exclusionRules: [{
                    id: 'doosan_discounted_sales',
                    when: { op: 'CARD_DISCOUNT_APPLIED' },
                    reason: '두산 카드 할인이 적용된 매출 전체는 전월 실적에서 제외',
                    sourceUrl: 'https://card.kbcard.com/CRD/DVIEW/HCAMCXPRICAC0076?cooperationcode=02219&mainCC=a',
                    quote: '두산베어스 KB카드로 할인(두산베어스 특화할인, 생활 영역 할인) 적용 받은 매출(해당 매출 전체)',
                }],
            },
            cardId: card.id,
            cardChargeAmount: 10_000,
            steps: [{
                id: 'ticket-discount',
                layer: 'PAYMENT_METHOD',
                providerName: card.company,
                title: '두산 홈경기 티켓 할인',
                certainty: 'CONFIRMED',
                amountBefore: 10_000,
                amountAfter: 5_000,
                benefitAmount: 5_000,
                isImmediate: true,
                cardId: card.id,
                ruleId: ticket.id,
            }],
        });
        expect(result).toMatchObject({ amount: 0, status: 'CONFIRMED' });
    });

    it('separates ticket-only season checks from goods and stadium food', () => {
        expect(validateBenefitProgramSet(rules)).toEqual([]);
        expect(ticket.program?.target?.purchaseScenario?.requiredChecks.join(' '))
            .toContain('정규시즌');
        expect(goods.program?.target?.purchaseScenario?.requiredChecks.join(' '))
            .not.toContain('정규시즌');
        expect(stadiumFood.program?.target?.purchaseScenario?.requiredChecks.join(' '))
            .toContain('제외 매장');
        expect(calculate({ kind: 'GENERAL', label: '일반 결제' }, 20_000, 300_000)
            .calculatedDiscount).toBe(0);
        expect(calculate({
            kind: 'BRAND',
            brand: { id: 'gs25', name: 'GS25', categoryId: 'convenience' },
        }, 20_000, 300_000).calculatedDiscount).toBe(0);
    });

    it('applies the official performance and new-registration half-limit tiers', () => {
        expect(calculate(scenarioTarget('kb_doosan_bears_home_ticket'), 20_000, 0)
            .calculatedDiscount).toBe(0);
        expect(calculate(scenarioTarget('kb_doosan_bears_home_ticket'), 20_000, 0, [], true)
            .conditionalDiscount).toBe(5_000);
        expect(calculate(scenarioTarget('kb_doosan_bears_home_ticket'), 20_000, 300_000)
            .conditionalDiscount).toBe(10_000);
        expect(calculate(scenarioTarget('kb_doosan_bears_home_ticket'), 50_000, 800_000)
            .conditionalDiscount).toBe(20_000);
        expect(calculate(scenarioTarget('kb_doosan_bears_stadium_food'), 50_000, 800_000)
            .conditionalDiscount).toBe(10_000);
    });

    it('shares the ticket/goods monthly limit without sharing the food limit', () => {
        const history: TransactionHistory[] = [{
            id: 'ticket-record',
            date: '2026-09-11T03:00:00.000Z',
            cardId: card.id,
            ruleId: ticket.id,
            paymentTarget: {
                kind: 'SCENARIO', scenarioId: 'kb_doosan_bears_home_ticket', label: '홈경기 티켓',
            },
            amount: 20_000,
            discountAmount: 10_000,
        }];
        expect(calculate(scenarioTarget('kb_doosan_bears_goods'), 20_000, 300_000, history)
            .calculatedDiscount).toBe(0);
        expect(calculate(scenarioTarget('kb_doosan_bears_stadium_food'), 20_000, 300_000, history)
            .conditionalDiscount).toBe(4_000);
    });
});
