import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromotionSemanticAnalysis } from '@/types';
import type { ParsedPromotion } from './promotion-parsers';
import {
    applyPromotionSemanticAnalysis,
    classifyPromotionWithRules,
    OpenAIPromotionSemanticProvider,
    PromotionSemanticClassifier,
    type PromotionSemanticProvider,
} from './promotion-semantic-classifier';

const openAIResponse = (value: unknown) => ({
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    status: 'completed',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: 2_000,
    model: 'gpt-5.6-luna',
    output: [{
        id: 'msg_test',
        type: 'message',
        status: 'completed',
        role: 'assistant',
        content: [{
            type: 'output_text',
            text: JSON.stringify(value),
            annotations: [],
            logprobs: [],
        }],
    }],
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: 'low', summary: null },
    store: false,
    temperature: 1,
    text: { format: { type: 'json_schema' } },
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: {
        input_tokens: 10,
        output_tokens: 10,
        total_tokens: 20,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
    },
});

afterEach(() => {
    vi.unstubAllGlobals();
});

const parsedPromotion = (
    evidence: string,
    overrides: Partial<ParsedPromotion> = {},
): ParsedPromotion => ({
    sourceKey: 'promotion:1',
    evidence,
    autoPublish: true,
    warnings: [],
    offer: {
        providerId: 'naverpay',
        layer: 'POST_REWARD',
        title: '이마트24 20% 적립',
        description: evidence,
        brandIds: ['emart24'],
        categoryIds: [],
        channels: ['OFFLINE'],
        action: { type: 'POINTS', value: 20 },
        condition: { amountBasis: 'REMAINING_AMOUNT' },
        compatibility: { requiredPayProviderIds: ['naverpay'] },
        limitConfig: {},
        certainty: 'CONFIRMED',
        sourceUrl: 'https://pay.naver.com/benefit/payment/detail/1',
    },
    ...overrides,
});

describe('promotion semantic classifier', () => {
    it('keeps a product bundle out of the store-wide headline calculation', () => {
        const parsed = parsedPromotion([
            '인기 맥주 번들 5종 결제 시',
            '20% 적립',
            '포인트·머니 QR 결제 시 혜택 적용',
        ].join('\n'));
        const analysis = classifyPromotionWithRules(parsed);
        const result = applyPromotionSemanticAnalysis(parsed, analysis);

        expect(analysis.scope).toBe('PRODUCT_SET');
        expect(analysis.evidenceQuotes[0]).toContain('맥주 번들 5종');
        expect(result.offer.condition).toMatchObject({
            applicabilityScope: 'PRODUCT_SET',
            headlineEligible: false,
            itemSpecific: true,
            amountBasis: 'ELIGIBLE_ITEM_AMOUNT',
        });
        expect(result.offer.condition.requiredInputs).toContain('ELIGIBLE_ITEM_AMOUNT');
    });

    it('publishes an up-to category benefit as information without making it calculable', () => {
        const base = parsedPromotion([
            '와인/샴페인 결제 시',
            '최대 40% 할인',
            '카드, 삼성페이 결제 시 혜택 적용 불가',
        ].join('\n'));
        const parsed: ParsedPromotion = {
            ...base,
            offer: {
                ...base.offer,
                title: '세븐일레븐 최대 40% 할인',
                action: { type: 'PERCENT', value: 40, valueSemantics: 'UP_TO' },
            },
        };
        const analysis = classifyPromotionWithRules(parsed);
        const result = applyPromotionSemanticAnalysis(parsed, analysis);

        expect(analysis.scope).toBe('CATEGORY');
        expect(result.autoPublish).toBe(true);
        expect(result.offer.condition).toMatchObject({
            applicabilityScope: 'CATEGORY',
            headlineEligible: false,
            itemSpecific: true,
        });
        expect(result.offer.condition.requiredNote).toContain('정확한 할인 계산에서는 제외');
    });

    it('keeps a telecom discount with product exclusions out of the store-wide headline', () => {
        const parsed = parsedPromotion(
            'VVIP/VIP 1천원당 100원 할인 · 일부 행사상품 제외',
            {
                offer: {
                    ...parsedPromotion('').offer,
                    providerId: 'lguplus',
                    title: 'GS25 VVIP/VIP 10% 할인',
                    description: 'VVIP/VIP 1천원당 100원 할인 · 일부 행사상품 제외',
                    brandIds: ['gs25'],
                    layer: 'DISCOUNT',
                    action: { type: 'PERCENT', value: 10 },
                    condition: { amountBasis: 'ORIGINAL_AMOUNT' },
                    compatibility: {},
                },
            }
        );

        expect(classifyPromotionWithRules(parsed).scope).toBe('PRODUCT_SET');
    });

    it('holds branch exclusions and customer targets for confirmation', () => {
        const branch = parsedPromotion('포인트·머니 1만원 이상 결제 시\n일부 브랜드 매장에서는 혜택 적용 불가');
        const targeted = parsedPromotion('1만원 이상 결제 시(10대 대상)\n2천원 적립');

        const branchResult = applyPromotionSemanticAnalysis(
            branch,
            classifyPromotionWithRules(branch),
        );
        const targetedResult = applyPromotionSemanticAnalysis(
            targeted,
            classifyPromotionWithRules(targeted),
        );

        expect(branchResult.autoPublish).toBe(true);
        expect(branchResult.offer.condition).toMatchObject({
            applicabilityScope: 'STORE_WIDE',
            calculationMode: 'CONDITIONAL',
            confirmationRequired: true,
        });
        expect(branchResult.offer.condition.requiredInputs).toContain('STORE_ELIGIBILITY');
        expect(targetedResult.autoPublish).toBe(true);
        expect(targetedResult.offer.condition).toMatchObject({
            applicabilityScope: 'CUSTOMER_TARGETED',
            calculationMode: 'CONDITIONAL',
            confirmationRequired: true,
        });
    });

    it('publishes lottery rewards as information without calculating them', () => {
        const parsed = parsedPromotion('10만원 이상 결제 시 추첨 1,200명\n12,000원 적립');
        const result = applyPromotionSemanticAnalysis(
            parsed,
            classifyPromotionWithRules(parsed),
        );

        expect(result.autoPublish).toBe(true);
        expect(result.offer.condition.calculationMode).toBe('INFORMATION_ONLY');
        expect(result.offer.condition.requiredNote).toContain('추첨형');
    });

    it('confirms explicit Npay payment wording without an AI call', () => {
        const parsed = parsedPromotion('포인트·머니 2만원 이상 결제 시\n3천원 적립');
        const analysis = classifyPromotionWithRules(parsed);

        expect(analysis).toMatchObject({
            scope: 'STORE_WIDE',
            confidence: 0.95,
            provider: 'rules',
        });
    });

    it('keeps deterministic high-confidence rules ahead of the AI provider', async () => {
        let calls = 0;
        const provider: PromotionSemanticProvider = {
            id: 'unused-ai',
            classify: async () => {
                calls += 1;
                throw new Error('should not run');
            },
        };
        const parsed = parsedPromotion('포인트·머니 2만원 이상 결제 시\n3천원 적립');
        const analysis = await new PromotionSemanticClassifier(provider, 1).classify(parsed);

        expect(calls).toBe(0);
        expect(analysis).toMatchObject({ scope: 'STORE_WIDE', provider: 'rules' });
    });

    it('does not mistake a generic order procedure for a named-product restriction', () => {
        const parsed = parsedPromotion(
            '반올림피자 앱 로그인 > 메뉴 선택 및 주문하기 > LG U+ 멤버십 할인 > 결제',
            {
                offer: {
                    ...parsedPromotion('').offer,
                    providerId: 'lguplus',
                    title: '반올림피자 20% 할인',
                    description: '메뉴 선택 및 주문하기 > LG U+ 멤버십 할인 > 결제',
                    brandIds: ['banolim_pizza'],
                    layer: 'DISCOUNT',
                    action: { type: 'PERCENT', value: 20 },
                    condition: { amountBasis: 'ORIGINAL_AMOUNT' },
                    compatibility: {},
                },
            }
        );

        expect(classifyPromotionWithRules(parsed).scope).toBe('STORE_WIDE');
    });

    it('can narrow an ambiguous rule result through a replaceable AI provider', async () => {
        const aiResult: PromotionSemanticAnalysis = {
            scope: 'PRODUCT_SET',
            confidence: 0.94,
            evidenceQuotes: ['포카칩 2+1 적용'],
            requiredInputs: ['ELIGIBLE_ITEM_AMOUNT'],
            eligibleItemSummary: '포카칩 2+1 행사 상품',
            reasoningSummary: '특정 상품 행사입니다.',
            provider: 'test-ai',
            model: 'portable-test-model',
        };
        const provider: PromotionSemanticProvider = {
            id: 'test-ai',
            classify: async () => aiResult,
        };
        const parsed = parsedPromotion('현장 결제 혜택 10% 적립\n포카칩 2+1 적용');
        const classifier = new PromotionSemanticClassifier(provider, 1);

        const analysis = await classifier.classify(parsed);
        const result = applyPromotionSemanticAnalysis(parsed, analysis);

        expect(analysis.provider).toBe('test-ai');
        expect(result.offer.condition.applicabilityScope).toBe('PRODUCT_SET');
        expect(result.offer.condition.headlineEligible).toBe(false);
    });

    it('falls back safely when the AI provider fails', async () => {
        const provider: PromotionSemanticProvider = {
            id: 'failing-ai',
            classify: async () => {
                throw new Error('HTTP 429');
            },
        };
        const parsed = parsedPromotion('현장 결제 혜택 10% 적립');
        const classifier = new PromotionSemanticClassifier(provider, 1);

        const analysis = await classifier.classify(parsed);
        const result = applyPromotionSemanticAnalysis(parsed, analysis);

        expect(analysis.provider).toBe('rules');
        expect(analysis.diagnostic).toBe('HTTP 429');
        expect(result.autoPublish).toBe(false);
        expect(result.warnings.join(' ')).toContain('AI 폴백');
    });

    it('reuses provider results so the free-tier budget advances to new wording', async () => {
        let calls = 0;
        const provider: PromotionSemanticProvider = {
            id: 'cached-ai',
            model: 'cache-test-model',
            classify: async () => {
                calls += 1;
                return {
                    scope: 'STORE_WIDE',
                    confidence: 0.95,
                    evidenceQuotes: ['Npay 현장결제 시 10% 적립'],
                    requiredInputs: [],
                    reasoningSummary: '일반 결제 혜택입니다.',
                    provider: 'cached-ai',
                    model: 'cache-test-model',
                };
            },
        };
        const parsed = parsedPromotion('현장 결제 혜택 10% 적립');
        const first = await new PromotionSemanticClassifier(provider, 1).classify(parsed);
        const second = await new PromotionSemanticClassifier(provider, 1, [first]).classify(parsed);

        expect(calls).toBe(1);
        expect(second).toEqual(first);
        expect(first.inputHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('uses the Responses API JSON schema with server-side storage disabled', async () => {
        let requestBody: Record<string, unknown> | undefined;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
            requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
            const responseBody = openAIResponse({
                scope: 'PRODUCT_SET',
                confidence: 0.98,
                evidenceQuotes: ['인기 맥주 번들 5종 결제 시'],
                requiredInputs: ['ELIGIBLE_ITEM_AMOUNT'],
                eligibleItemSummary: '인기 맥주 번들 5종',
                reasoningSummary: '특정 상품 행사입니다.',
            });
            return new Response(JSON.stringify(responseBody), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        }));
        const provider = new OpenAIPromotionSemanticProvider({
            apiKey: 'test-key',
            model: 'gpt-5.6-luna',
        });

        const analysis = await provider.classify({
            providerId: 'naverpay',
            title: '이마트24 20% 적립',
            description: '인기 맥주 번들 5종 결제 시',
            evidence: '인기 맥주 번들 5종 결제 시',
            currentAmountBasis: 'REMAINING_AMOUNT',
            currentItemSpecific: false,
            requiresCoupon: false,
            requiresEnrollment: false,
        });
        expect(requestBody).toMatchObject({
            model: 'gpt-5.6-luna',
            store: false,
            reasoning: { effort: 'low' },
            text: { format: { type: 'json_schema', strict: true } },
        });
        expect(analysis.scope).toBe('PRODUCT_SET');
    });
});
