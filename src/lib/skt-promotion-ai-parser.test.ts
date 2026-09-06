import { describe, expect, it } from 'vitest';
import { createPromotionCandidateAudit } from './promotion-candidate-audit';
import {
    SktPromotionAiParser,
    sktPromotionAiInputHash,
    type SktPromotionAiInput,
    type SktPromotionAiProvider,
} from './skt-promotion-ai-parser';

const detailText = [
    '혜택',
    'VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백',
    '네이버에서 인터뷰박스 상품을 예약해 이용한 고객에게 적용됩니다.',
].join('\n');

const input: SktPromotionAiInput = {
    officialBrandId: '5537',
    brandName: '인터뷰박스',
    sourceUrl: 'https://example.com/list.do',
    detailUrl: 'https://example.com/detail.do?brandId=5537',
    listText: detailText,
    detailText,
    variants: [{
        membershipMode: 'DISCOUNT',
        tiers: ['VIP', 'GOLD', 'SILVER'],
        description: 'VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백',
    }],
};

const validOutput = {
    benefits: [{
        variantIndex: 0,
        layer: 'POST_REWARD',
        actionType: 'FLAT',
        actionValue: 3_000,
        valueSemantics: 'EXACT',
        maxBenefit: null,
        faceValue: null,
        unitAmount: null,
        applicabilityScope: 'PRODUCT_SET',
        calculationMode: 'CONDITIONAL',
        channels: ['OFFICIAL_SITE'],
        minSpend: null,
        eligibleItemSummary: '인터뷰박스 예약 상품',
        requiredInputs: ['ELIGIBLE_ITEM_AMOUNT'],
        dailyCount: null,
        dailyAmount: null,
        monthlyCount: null,
        monthlyAmount: null,
        yearlyCount: null,
        confidence: 0.96,
        reasoningSummary: '공식 예약 상품 이용 후 정액 페이백 혜택입니다.',
        fieldEvidence: [{
            path: 'action.type',
            quotes: ['VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백'],
        }, {
            path: 'action.value',
            quotes: ['VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백'],
        }, {
            path: 'condition.telecomModes',
            quotes: ['VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백'],
        }, {
            path: 'condition.telecomTiers',
            quotes: ['VIP/GOLD/SILVER 인터뷰박스 상품 예약 후 이용하면 3,000원 페이백'],
        }, {
            path: 'condition.applicabilityScope',
            quotes: ['네이버에서 인터뷰박스 상품을 예약해 이용한 고객에게 적용됩니다.'],
        }, {
            path: 'condition.eligibleItemSummary',
            quotes: ['네이버에서 인터뷰박스 상품을 예약해 이용한 고객에게 적용됩니다.'],
        }, {
            path: 'condition.requiredInputs',
            quotes: ['네이버에서 인터뷰박스 상품을 예약해 이용한 고객에게 적용됩니다.'],
        }, {
            path: 'channels',
            quotes: ['네이버에서 인터뷰박스 상품을 예약해 이용한 고객에게 적용됩니다.'],
        }],
    }],
} as const;

class FakeProvider implements SktPromotionAiProvider {
    readonly id = 'fake-ai';
    readonly model = 'fake-model';
    calls = 0;

    constructor(private readonly output: unknown = validOutput) {}

    async extract() {
        this.calls += 1;
        return this.output;
    }
}

describe('SKT promotion AI fallback parser', () => {
    it('creates a review-only candidate whose calculated fields link to official evidence', async () => {
        const provider = new FakeProvider();
        const result = await new SktPromotionAiParser(provider, 5).parse(input);

        expect(result).toMatchObject({ attempted: true, cacheHit: false });
        expect(result.promotions).toHaveLength(1);
        expect(result.promotions[0]).toMatchObject({
            autoPublish: false,
            semanticScopeLocked: true,
            aiFallback: {
                provider: 'fake-ai',
                model: 'fake-model',
                officialBrandId: '5537',
                variantIndex: 0,
                variantCount: 1,
            },
            offer: {
                providerId: 'skt',
                layer: 'POST_REWARD',
                action: { type: 'FLAT', value: 3_000 },
                condition: {
                    applicabilityScope: 'PRODUCT_SET',
                    calculationMode: 'CONDITIONAL',
                    telecomModes: ['DISCOUNT'],
                },
            },
        });

        const audit = createPromotionCandidateAudit({
            candidate: result.promotions[0].offer as unknown as Record<string, unknown>,
            evidenceTexts: [result.promotions[0].evidence],
            documents: [{
                id: 'detail',
                sourceUrl: input.detailUrl,
                extractedText: detailText,
            }],
            fieldEvidence: result.promotions[0].fieldEvidence,
            requiredEvidenceSourceUrl: input.detailUrl,
        });
        expect(audit.blockingErrors).toEqual([]);
    });

    it('rejects hallucinated field evidence instead of creating a candidate', async () => {
        const invalid = {
            benefits: [{
                ...validOutput.benefits[0],
                fieldEvidence: validOutput.benefits[0].fieldEvidence.map((item, index) => (
                    index === 0
                        ? { ...item, quotes: ['공식 원문에 없는 9,999원 할인'] }
                        : item
                )),
            }],
        };
        const provider = new FakeProvider(invalid);
        const result = await new SktPromotionAiParser(provider, 5).parse(input);

        expect(result.promotions).toEqual([]);
        expect(result.diagnostic).toContain('공식 원문에 없습니다');
        expect(provider.calls).toBe(2);
    });

    it('downgrades an action number that is absent from its official quote', async () => {
        const unsupportedNumber = {
            benefits: [{
                ...validOutput.benefits[0],
                actionValue: 9_999,
            }],
        };
        const result = await new SktPromotionAiParser(
            new FakeProvider(unsupportedNumber),
            5,
        ).parse(input);

        expect(result.promotions[0]).toMatchObject({
            warnings: expect.arrayContaining([
                expect.stringContaining('정보 제공으로 낮춤'),
            ]),
            offer: {
                action: { value: 0, valueSemantics: 'UP_TO' },
                condition: { calculationMode: 'INFORMATION_ONLY' },
            },
        });
    });

    it('expands a short exact quote to its full official source line for audit', async () => {
        const monthlyLine = '온라인 상품 예약 시 월 1회 3,000원 페이백을 제공합니다.';
        const monthlyInput = {
            ...input,
            listText: `${detailText}\n${monthlyLine}`,
            detailText: `${detailText}\n${monthlyLine}`,
        };
        const monthlyOutput = {
            benefits: [{
                ...validOutput.benefits[0],
                monthlyCount: 1,
                fieldEvidence: [
                    ...validOutput.benefits[0].fieldEvidence,
                    { path: 'limitConfig.monthlyCount', quotes: ['월 1회'] },
                ],
            }],
        };
        const result = await new SktPromotionAiParser(
            new FakeProvider(monthlyOutput),
            5,
        ).parse(monthlyInput);

        expect(result.promotions[0].fieldEvidence?.['limitConfig.monthlyCount'])
            .toEqual([monthlyLine]);
        const audit = createPromotionCandidateAudit({
            candidate: result.promotions[0].offer as unknown as Record<string, unknown>,
            evidenceTexts: [result.promotions[0].evidence],
            documents: [{
                id: 'detail',
                sourceUrl: monthlyInput.detailUrl,
                extractedText: monthlyInput.detailText,
            }],
            fieldEvidence: result.promotions[0].fieldEvidence,
            requiredEvidenceSourceUrl: monthlyInput.detailUrl,
        });
        expect(audit.blockingErrors).toEqual([]);
    });

    it('reuses an exact input-hash cache without calling the provider', async () => {
        const firstProvider = new FakeProvider();
        const first = await new SktPromotionAiParser(firstProvider, 5).parse(input);
        const cachedPromotion = first.promotions[0];
        const secondProvider = new FakeProvider();
        const second = await new SktPromotionAiParser(secondProvider, 5, [{
            inputHash: sktPromotionAiInputHash(input),
            provider: 'fake-ai',
            model: 'fake-model',
            variantIndex: 0,
            variantCount: 1,
            promotion: cachedPromotion,
        }]).parse(input);

        expect(second).toMatchObject({ attempted: false, cacheHit: true });
        expect(second.promotions).toEqual([cachedPromotion]);
        expect(secondProvider.calls).toBe(0);
    });

    it('reports a bounded failure when AI is unavailable', async () => {
        const result = await new SktPromotionAiParser(undefined, 5).parse(input);

        expect(result.promotions).toEqual([]);
        expect(result.attempted).toBe(false);
        expect(result.diagnostic).toContain('OPENAI_API_KEY');
    });
});
