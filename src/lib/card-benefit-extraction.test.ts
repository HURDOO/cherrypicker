import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types';
import {
    cardBenefitGeminiSchema,
    extractShinhanSolTravelWithRules,
    GeminiCardBenefitExtractionProvider,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { calculateBestCards } from '@/utils/calculation';
import { shinhanSolSourceText } from '@/test/fixtures/shinhan-sol-source';

const card: Card = {
    id: 'shinhan_sol',
    name: '신한 SOL트래블 체크카드',
    company: '신한카드',
    color: 'bg-blue-400',
    limitTable: [],
    network: 'MASTERCARD',
};

const sourceText = shinhanSolSourceText;

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
                condition: {
                    minPerformance: 300_000,
                    requiredNote: expect.stringContaining('CU 행사상품 중복 외'),
                },
                action: { type: 'PERCENT', value: 5 },
                limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            });
        expect(result.extraction.rules.find(rule => rule.id === 'sol_overseas_fee'))
            .toMatchObject({
                condition: {
                    confirmationRequired: true,
                    requiredNote: expect.stringContaining('수수료가 실제 부과되는 거래'),
                },
            });
        expect(result.extraction.evidence.map(item => item.id)).toEqual(
            expect.arrayContaining([
                'overseas-fee-exclusion',
                'discount-service-exclusions',
            ]),
        );
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

    it('links a supporting PDF quote to its exact source URL and page', () => {
        const primaryText = sourceText.replace(
            '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
            '',
        );
        const pdfUrl = 'https://www.shinhancard.com/guides/sol-travel.pdf';
        const pdfPages = [
            '표지와 카드 상품 기본 정보입니다.',
            '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
        ];
        const multiSourceInput = {
            ...input,
            sourceText: primaryText,
            sources: [
                { sourceUrl: input.sourceUrl, sourceText: primaryText, mediaType: 'text/html' },
                {
                    sourceUrl: pdfUrl,
                    sourceText: pdfPages.join('\n'),
                    mediaType: 'application/pdf',
                    pageTexts: pdfPages,
                },
            ],
        };
        const result = extractShinhanSolTravelWithRules(multiSourceInput);
        const loungeEvidence = result.extraction.evidence.find(item => item.id === 'lounge');

        expect(loungeEvidence).toMatchObject({ sourceUrl: pdfUrl, page: 2 });
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual([]);

        delete loungeEvidence!.page;
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual(expect.arrayContaining([
            expect.stringContaining('PDF 페이지 번호가 없습니다.'),
        ]));

        loungeEvidence!.page = 1;
        expect(validateCardBenefitExtraction(
            result.extraction,
            multiSourceInput,
            references,
        ).errors).toEqual(expect.arrayContaining([
            expect.stringContaining('지정한 PDF 페이지에서 확인되지 않습니다.'),
        ]));
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

    it('keeps the overseas fee waiver conditional until fee eligibility is confirmed', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const overseas = { id: 'overseas_payment', name: '해외 가맹점', categoryId: 'etc' };
        const conditional = calculateBestCards(
            100_000,
            overseas,
            [card],
            extraction.rules,
            [],
            [],
            false,
        )[0];
        const confirmed = calculateBestCards(
            100_000,
            overseas,
            [card],
            extraction.rules,
            [],
            [],
            false,
            { confirmedConditionIds: ['card-rule:sol_overseas_fee'] },
        )[0];

        expect(conditional).toMatchObject({
            confirmedDiscount: 0,
            conditionalDiscount: 1_200,
        });
        expect(conditional.matchedBenefits[0].requiredChecks)
            .toContain('해외가맹점에서 수수료가 실제 부과되는 거래인지 확인');
        expect(confirmed).toMatchObject({
            confirmedDiscount: 1_200,
            conditionalDiscount: 0,
        });
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
