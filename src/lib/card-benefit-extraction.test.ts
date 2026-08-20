import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types';
import {
    cardBenefitGeminiSchema,
    extractShinhanSolTravelWithRules,
    GeminiCardBenefitExtractionProvider,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { calculateBestCards } from '@/utils/calculation';

const card: Card = {
    id: 'shinhan_sol',
    name: '신한 SOL트래블 체크카드',
    company: '신한카드',
    color: 'bg-blue-400',
    limitTable: [],
    network: 'MASTERCARD',
};

const sourceText = [
    '해외 이용 시 원화 환산 절차없이 외화결제계좌에서 해당 현지 통화로 인출되는 서비스',
    '해외 결제 수수료 면제',
    '국제 브랜드 수수료(1%)/해외 서비스 수수료(0.2%) 면제',
    '해외 ATM 이용 인출 수수료(건당 $3) 및 국제 브랜드 수수료(1%) 면제',
    '컨택리스 해외 대중교통 1% 결제일 할인 월 3천원까지 할인',
    '해외 대중교통 중 컨택리스 결제를 지원하는 대중교통에 한하여 결제일 할인 서비스가 제공되며, 택시 이용은 할인 대상에 포함되지 않습니다.',
    '세븐일레븐·CU·GS25·이마트 24 5% 결제일 할인 편의점 통합 일 1회, 월 3회, 월 3천원까지 할인',
    '국내 후불교통(공항철도·버스 포함) 1% 결제일 할인 국내 대중교통 월 3천원까지 할인',
    '후불교통 기능을 이용한 터치(RF) 거래 시 결제일 할인 서비스가 제공되며, 고속버스 이용은 할인 대상에 포함되지 않습니다.',
    'CU 행사상품(간편식, Get커피) 5% 즉시할인 결제 1회 당 최대 2,000원까지 할인',
    '국내 4대 편의점 5% 결제일 할인과는 중복 적용이 가능합니다. 단, 중복 적용될 경우 결제일 할인 서비스는 즉시할인 금액이 제외된 금액에서 적용됩니다.',
    '타 결제수단과 복합 결제 시 할인 적용 불가합니다. 전액 SOL트래블카드 결제 시에만 적용하며 일부 간편결제 거래건은 할인 적용 제외됩니다.',
    '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
    '전월 국내 이용금액 30만원 이상 시 서비스가 제공됩니다.',
    '신규 발급 회원의 경우 카드 사용 등록월의 익월 말(등록월+1개월)까지는 전월 이용금액 조건 없이 서비스가 제공됩니다.',
    '해외 이용 서비스 및 해외 대중교통 컨택리스 방식으로 이용 시 1% 결제일 할인 서비스는 MASTERCARD 브랜드 선택 시에만 제공 가능합니다.',
    '마스터카드 트래블 리워드는 해외 가맹점에서 캐시백(최대 10%) 혜택을 받을 수 있는 프로그램입니다.',
    '마스터 트래블 리워드는 2026년 12월 31일까지 제공됩니다.',
    '일본 3대 편의점 5% 결제일 할인 월 5천원까지 할인',
    '베트남 롯데마트 5% 결제일 할인 월 3천원까지 할인',
    '베트남 Grab 5% 결제일 할인 월 3천원까지 할인',
    '미국 스타벅스 5% 결제일 할인 월 5천원까지 할인',
    '해외 가맹점 이용 할인 프로모션은 2026년 12월 31일까지 제공됩니다.',
].join('\n');

const input = {
    card,
    sourceUrl: 'https://www.shinhancard.com/sol-travel',
    sourceText,
};

const references = {
    categoryIds: new Set(['cafe', 'etc', 'transport', 'convenience']),
    brandIds: new Set([
        'overseas_payment',
        'overseas_atm',
        'overseas_transport',
        'cu',
        'gs25',
        'seveneleven',
        'emart24',
        'transport_public',
        'cu_event',
        'airport_lounge',
        'master_travel_rewards',
        'japan_convenience',
        'vietnam_lottemart',
        'vietnam_grab',
        'usa_starbucks',
    ]),
};

describe('card benefit extraction', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('creates a fully evidenced representative SOL Travel candidate', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(
            result.extraction,
            input,
            references,
        );

        expect(validation.errors).toEqual([]);
        expect(result.extraction.rules).toHaveLength(13);
        expect(result.extraction.rules.find(rule => rule.id === 'sol_domestic_convenience'))
            .toMatchObject({
                condition: { minPerformance: 300_000 },
                action: { type: 'PERCENT', value: 5 },
                limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            });
        const normalizedFixture = sourceText.replace(/\s+/g, ' ');
        expect(result.extraction.evidence.every(item => normalizedFixture.includes(item.quote)))
            .toBe(true);
    });

    it('holds a candidate when a rule has no official-source evidence', () => {
        const result = extractShinhanSolTravelWithRules({
            ...input,
            sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', ''),
        });
        const validation = validateCardBenefitExtraction(
            result.extraction,
            { ...input, sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', '') },
            references,
        );

        expect(validation.errors).toContain('규칙 sol_lounge의 혜택·계산 근거가 없습니다.');
    });

    it('rejects evidence quotes that are not present in the raw source', () => {
        const result = extractShinhanSolTravelWithRules(input);
        result.extraction.evidence[0] = {
            ...result.extraction.evidence[0],
            quote: '원문에는 없는 99% 할인',
        };

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('근거 1 문장이 공식 원문에서 확인되지 않습니다.');
    });

    it('rejects rule IDs owned by another card or a user', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(result.extraction, input, {
            ...references,
            ruleOwners: new Map([
                ['sol_domestic_convenience', { cardId: 'other_card', userId: null }],
                ['sol_lounge', { cardId: card.id, userId: 'user-1' }],
            ]),
        });

        expect(validation.errors).toContain(
            '규칙 5 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
        expect(validation.errors).toContain(
            '규칙 8 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
    });

    it('rejects a FULL candidate that omits an official representative benefit', () => {
        const result = extractShinhanSolTravelWithRules(input);
        result.extraction.rules = result.extraction.rules
            .filter(rule => rule.id !== 'sol_overseas_atm');
        result.extraction.evidence = result.extraction.evidence
            .filter(item => !item.ruleIds.includes('sol_overseas_atm'));

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('공식 혜택 sol_overseas_atm 규칙이 누락되었습니다.');
    });

    it('rejects a representative rule whose official amount is changed', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const promotion = result.extraction.rules
            .find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.limitConfig.monthlyAmount = 50_000;

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('공식 혜택 sol_japan_convenience의 계산 조건·한도가 공식 기준과 다릅니다.');
    });

    it('rejects impossible calendar dates in a period condition', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const promotion = result.extraction.rules
            .find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.condition.endsAt = '2026-02-31';

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('규칙 10 endsAt 날짜가 올바르지 않습니다.');
    });

    it('uses a simple transport schema and parses the locally validated extraction JSON', async () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            candidates: [{
                content: {
                    parts: [{
                        text: JSON.stringify({
                            confidence: 0.91,
                            extractionJson: JSON.stringify(extraction),
                        }),
                    }],
                },
            }],
        }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GeminiCardBenefitExtractionProvider({
            apiKey: 'test-key',
            model: 'gemini-3.6-flash',
        }).extract(input);
        const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

        expect(cardBenefitGeminiSchema.properties).toHaveProperty('extractionJson');
        expect(cardBenefitGeminiSchema.properties).not.toHaveProperty('extraction');
        expect(requestBody.generationConfig.responseFormat.text.schema)
            .toEqual(cardBenefitGeminiSchema);
        expect(result.extraction.rules).toHaveLength(13);
        expect(result.confidence).toBe(0.91);
    });

    it('feeds the validated representative rule into the existing calculator', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const gs25 = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };
        const eligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
        )[0];
        const ineligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 299_999 }],
            false,
            { allowPerformanceWaiver: false },
        )[0];

        expect(eligible).toMatchObject({
            calculatedDiscount: 1_000,
            matchedRule: { id: 'sol_domestic_convenience' },
        });
        expect(ineligible.calculatedDiscount).toBe(0);
    });

    it('stacks the CU instant discount with the statement discount on the remaining amount', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const cuEvent = { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' };
        const result = calculateBestCards(
            20_000,
            cuEvent,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
            {
                confirmedConditionIds: [
                    'card-rule:sol_cu_event',
                    'card-rule:sol_domestic_convenience',
                ],
            },
        )[0];

        expect(result.calculatedDiscount).toBe(1_950);
        expect(result.confirmedDiscount).toBe(1_950);
        expect(result.matchedBenefits.map(benefit => ({
            ruleId: benefit.rule.id,
            discount: benefit.discount,
        }))).toEqual([
            { ruleId: 'sol_cu_event', discount: 1_000 },
            { ruleId: 'sol_domestic_convenience', discount: 950 },
        ]);
    });

    it('caps stacked benefits at the original payment amount', () => {
        const brand = { id: 'stacked', name: '중복 혜택', categoryId: 'etc' };
        const rules = ['first', 'second'].map((id, index) => ({
            id,
            cardId: card.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL' as const,
            usesCardLimit: false,
            description: `${index + 1}번 혜택`,
            detail: '결제금액 초과 방지 테스트',
            condition: {
                stackableWithRuleIds: [index === 0 ? 'second' : 'first'],
                applicationOrder: index + 1,
            },
            action: { type: 'FLAT' as const, value: 80 },
            limitConfig: {},
        }));

        const result = calculateBestCards(
            100,
            brand,
            [card],
            rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(100);
        expect(result.matchedBenefits.map(benefit => benefit.discount)).toEqual([80, 20]);
    });

    it('tracks each stacked rule separately when enforcing later usage limits', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const cuEvent = { id: 'cu_event', name: 'CU 행사상품', categoryId: 'convenience' };
        const result = calculateBestCards(
            20_000,
            cuEvent,
            [card],
            extraction.rules,
            [{
                id: 1,
                date: new Date().toISOString(),
                brandId: cuEvent.id,
                cardId: card.id,
                ruleId: 'sol_cu_event',
                amount: 20_000,
                discountAmount: 1_950,
                combinationSnapshot: {
                    steps: [
                        {
                            ruleId: 'sol_cu_event',
                            benefitAmount: 1_000,
                            certainty: 'CONFIRMED',
                        },
                        {
                            ruleId: 'sol_domestic_convenience',
                            benefitAmount: 950,
                            certainty: 'CONFIRMED',
                        },
                    ],
                },
            }],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
            {
                confirmedConditionIds: [
                    'card-rule:sol_cu_event',
                    'card-rule:sol_domestic_convenience',
                ],
            },
        )[0];

        expect(result.calculatedDiscount).toBe(1_000);
        expect(result.matchedBenefits.map(benefit => benefit.rule.id))
            .toEqual(['sol_cu_event']);
    });

    it('keeps a new-card performance waiver conditional until the user confirms it', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const gs25 = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };
        const conditional = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 0 }],
            false,
        )[0];
        const confirmed = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 0 }],
            false,
            { confirmedConditionIds: ['card-rule:sol_domestic_convenience'] },
        )[0];

        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_000,
        });
        expect(conditional.matchedBenefits[0].requiredChecks)
            .toContain('신규 발급 후 등록월의 다음 달 말 이내인지 확인');
        expect(confirmed).toMatchObject({
            confirmedDiscount: 1_000,
            conditionalDiscount: 0,
        });
    });

    it('does not apply Mastercard-only benefits to a domestic card', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const overseas = { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' };
        const result = calculateBestCards(
            20_000,
            overseas,
            [{ ...card, network: 'DOMESTIC' }],
            extraction.rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(0);
        expect(result.reason).toBe('MASTERCARD 카드 전용 혜택');
    });

    it('drops an expired promotion while preserving the permanent overseas fee waiver', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const promotion = extraction.rules.find(rule => rule.id === 'sol_japan_convenience')!;
        promotion.condition.endsAt = '2000-01-01';
        const brand = {
            id: 'japan_convenience',
            name: '일본 3대 편의점',
            categoryId: 'convenience',
        };

        const result = calculateBestCards(
            20_000,
            brand,
            [card],
            extraction.rules,
            [],
            [],
            false,
        )[0];

        expect(result.calculatedDiscount).toBe(240);
        expect(result.matchedBenefits.map(benefit => benefit.rule.id))
            .toEqual(['sol_overseas_fee']);
    });
});
