import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
    PromotionApplicabilityScope,
    PromotionRequiredInput,
    PromotionSemanticAnalysis,
} from '@/types';
import {
    OpenAIStructuredResponseClient,
    resolveOpenAIReasoningEffort,
} from './openai-responses';
import type { ParsedPromotion } from './promotion-parsers';

export type PromotionSemanticInput = {
    providerId: string;
    title: string;
    description: string;
    evidence: string;
    currentAmountBasis?: string;
    currentItemSpecific: boolean;
    requiresCoupon: boolean;
    requiresEnrollment: boolean;
};

export interface PromotionSemanticProvider {
    id: string;
    model?: string;
    classify(input: PromotionSemanticInput): Promise<PromotionSemanticAnalysis>;
}

const scopes = [
    'STORE_WIDE',
    'CATEGORY',
    'PRODUCT_SET',
    'CUSTOMER_TARGETED',
    'UNKNOWN',
] as const satisfies readonly PromotionApplicabilityScope[];
const requiredInputValues = [
    'ELIGIBLE_ITEM_AMOUNT',
    'COUPON',
    'ENROLLMENT',
    'SUBSCRIPTION_PRODUCT',
    'TARGET_ELIGIBILITY',
    'STORE_ELIGIBILITY',
    'PAYMENT_INSTRUMENT',
] as const satisfies readonly PromotionRequiredInput[];

const unique = <T,>(values: T[]) => [...new Set(values)];
const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizeForEvidence = (value: string) => normalizeText(value).toLocaleLowerCase('ko-KR');

const inputFromParsed = (parsed: ParsedPromotion): PromotionSemanticInput => ({
    providerId: parsed.offer.providerId,
    title: parsed.offer.title,
    description: parsed.offer.description,
    evidence: parsed.evidence,
    currentAmountBasis: parsed.offer.condition.amountBasis,
    currentItemSpecific: parsed.offer.condition.itemSpecific === true,
    requiresCoupon: parsed.offer.condition.requiresCoupon === true,
    requiresEnrollment: parsed.offer.condition.requiresEnrollment === true,
});

const semanticInputHash = (input: PromotionSemanticInput) => createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');

const semanticCacheKey = (
    provider: Pick<PromotionSemanticProvider, 'id' | 'model'>,
    inputHash: string,
) => `${provider.id}:${provider.model ?? ''}:${inputHash}`;

const evidenceLines = (input: PromotionSemanticInput) => unique([
    input.title,
    ...input.description.split(/\n/),
    ...input.evidence.split(/\n/),
].map(normalizeText).filter(Boolean));

const findEvidence = (
    input: PromotionSemanticInput,
    pattern: RegExp,
    exclude?: RegExp,
) => evidenceLines(input).find(line => pattern.test(line) && (!exclude || !exclude.test(line)));

const baseRequiredInputs = (input: PromotionSemanticInput) => unique([
    ...(input.requiresCoupon ? ['COUPON' as const] : []),
    ...(input.requiresEnrollment ? ['ENROLLMENT' as const] : []),
]);

export function classifyPromotionWithRules(parsed: ParsedPromotion): PromotionSemanticAnalysis {
    const input = inputFromParsed(parsed);
    const structuredScope = parsed.offer.condition.applicabilityScope;
    if (input.providerId === 't-universe' && structuredScope && structuredScope !== 'UNKNOWN') {
        const itemScoped = structuredScope === 'CATEGORY' || structuredScope === 'PRODUCT_SET';
        return {
            scope: structuredScope,
            confidence: 0.99,
            evidenceQuotes: [evidenceLines(input)[0] ?? input.title],
            requiredInputs: unique([
                ...(parsed.offer.condition.requiredInputs ?? []),
                ...(itemScoped ? ['ELIGIBLE_ITEM_AMOUNT' as const] : []),
            ]),
            ...(parsed.offer.condition.eligibleItemSummary && {
                eligibleItemSummary: parsed.offer.condition.eligibleItemSummary,
            }),
            reasoningSummary: '공식 구조화 파서가 상품 범위와 구독 상품 조건을 함께 확인했습니다.',
            provider: 'rules',
        };
    }
    const existingProductScope = input.currentItemSpecific ||
        input.currentAmountBasis === 'ELIGIBLE_ITEM_AMOUNT';
    const productEvidence = findEvidence(
        input,
        /(?:번들|패키지|세트|단품|관람권|입장권|이용권|티켓|싱글|시그니처|종합이용권|숙소|객실|호텔|액티비티|항공|크루즈|포장이사|정기구독|월\s*구독\s*상품|쿼터\s*사이즈|(?:1회|정기|건강\s*검진)\s*서비스|전화\s*영어|화상\s*영어|렌탈\s*서비스\s*제품|\d+\s*종).*(?:구매|결제|주문|할인|적립|혜택|예약)|(?:대상|특정|해당|행사)\s*(?:상품|품목|메뉴|제품|모델|숙소|객실)|(?:상품|품목|메뉴|제품|모델|숙소|객실)\s*(?:한정|전용)/i,
        /(?:제외|미적용|불가)/,
    );
    const categoryEvidence = findEvidence(
        input,
        /(?:카테고리|주류|맥주|와인|샴페인|위스키|뷰티|화장품|가전|식품|의류)(?:\s*(?:\/|·|,|및)\s*(?:주류|맥주|와인|샴페인|위스키|뷰티|화장품|가전|식품|의류))*\s*(?:상품|제품|품목)?\s*(?:구매|결제|할인|적립|대상)/,
        /(?:제외|미적용|불가)/,
    );
    const targetEvidence = findEvidence(
        input,
        /(?:선착순|추첨|응모|랜덤|첫\s*(?:결제|구매)|신규\s*(?:회원|고객)|대상\s*(?:고객|회원)|일부\s*(?:고객|회원)|(?:10대|청소년|대학생|임직원|군인)\s*(?:대상|한정)|(?:회원|고객)\s*한정|개인별|초대\s*(?:대상|받은\s*(?:회원|고객)))/,
    );
    const productExclusionEvidence = findEvidence(
        input,
        /(?:일부|특정|행사)\s*(?:상품|품목|메뉴|제품)|(?:주류|담배|종량제봉투|세트\s*메뉴|런치\s*메뉴|할인\s*메뉴|행사\s*상품|상품(?!권)|품목|메뉴|제품)[^\n]{0,60}(?:제외|미적용|불가)/,
    );
    const storeExclusionEvidence = findEvidence(
        input,
        /일부\s*(?:브랜드\s*)?매장[^\n]{0,50}(?:제외|미적용|불가)|일부\s*매장\s*제외|(?:적용|혜택)\s*제외\s*매장|(?:점|지점)(?:\s*,\s*[^\n]{0,30}(?:점|지점))+[^\n]{0,40}(?:제외|미적용|불가)/,
    );
    const storeVariantEvidence = findEvidence(
        input,
        /(?:점|지점)(?:\s*,\s*[^\n]{0,20}(?:점|지점))+[^\n]{0,40}\d+(?:\.\d+)?\s*%\s*할인/,
    );
    const storeWideEvidence = findEvidence(
        input,
        /(?:전|전체)\s*(?:상품|품목)|(?:Npay|네이버페이|포인트|머니|결제\s*금액)[^\n]{0,50}(?:이상\s*)?(?:QR\s*)?결제\s*시|(?:QR|바코드)\s*결제\s*시|(?:구매|결제)\s*금액\s*(?:기준|당|의|에서)?/i,
    );
    const requiredInputs = baseRequiredInputs(input);

    if (productEvidence) {
        const summary = productEvidence;
        return {
            scope: 'PRODUCT_SET',
            confidence: 0.98,
            evidenceQuotes: [summary],
            requiredInputs: unique([...requiredInputs, 'ELIGIBLE_ITEM_AMOUNT']),
            eligibleItemSummary: summary.slice(0, 300),
            reasoningSummary: '상품명·세트·대상 상품 표현이 있어 전체 결제금액에 적용할 수 없습니다.',
            provider: 'rules',
        };
    }

    if (categoryEvidence) {
        return {
            scope: 'CATEGORY',
            confidence: 0.92,
            evidenceQuotes: [categoryEvidence],
            requiredInputs: unique([...requiredInputs, 'ELIGIBLE_ITEM_AMOUNT']),
            eligibleItemSummary: categoryEvidence.slice(0, 300),
            reasoningSummary: '특정 상품 카테고리에만 적용되는 혜택입니다.',
            provider: 'rules',
        };
    }

    if (storeExclusionEvidence && productExclusionEvidence) {
        return {
            scope: 'PRODUCT_SET',
            confidence: 0.98,
            evidenceQuotes: unique([productExclusionEvidence, storeExclusionEvidence]),
            requiredInputs: unique([
                ...requiredInputs,
                'ELIGIBLE_ITEM_AMOUNT',
                'STORE_ELIGIBILITY',
            ]),
            eligibleItemSummary: productExclusionEvidence.slice(0, 300),
            reasoningSummary: '일부 상품과 지점이 제외되어 대상 상품 합계와 이용 매장의 행사 여부를 확인해야 합니다.',
            provider: 'rules',
        };
    }

    if (storeExclusionEvidence) {
        return {
            scope: 'STORE_WIDE',
            confidence: 0.98,
            evidenceQuotes: [storeExclusionEvidence],
            requiredInputs: unique([...requiredInputs, 'STORE_ELIGIBILITY']),
            reasoningSummary: '할인율은 명확하지만 일부 지점이 제외되어 이용 매장의 행사 여부를 확인해야 합니다.',
            provider: 'rules',
        };
    }

    if (productExclusionEvidence) {
        return {
            scope: 'PRODUCT_SET',
            confidence: 0.94,
            evidenceQuotes: [productExclusionEvidence],
            requiredInputs: unique([...requiredInputs, 'ELIGIBLE_ITEM_AMOUNT']),
            eligibleItemSummary: productExclusionEvidence.slice(0, 300),
            reasoningSummary: '일부 상품·메뉴가 제외되어 대상 상품 합계를 기준으로 계산해야 합니다.',
            provider: 'rules',
        };
    }

    if (storeVariantEvidence) {
        return {
            scope: 'STORE_WIDE',
            confidence: 0.96,
            evidenceQuotes: [storeVariantEvidence],
            requiredInputs: unique([...requiredInputs, 'STORE_ELIGIBILITY']),
            reasoningSummary: '지점별 할인율이 달라 이용하려는 지점의 행사 조건을 확인해야 합니다.',
            provider: 'rules',
        };
    }

    if (existingProductScope) {
        const summary = evidenceLines(input)[0] ?? '행사 대상 상품에만 적용';
        return {
            scope: 'PRODUCT_SET',
            confidence: 0.7,
            evidenceQuotes: [summary],
            requiredInputs: unique([...requiredInputs, 'ELIGIBLE_ITEM_AMOUNT']),
            eligibleItemSummary: summary.slice(0, 300),
            reasoningSummary: '기존 파서가 상품 단위 혜택으로 감지했지만 공식 문구의 대상 표현을 추가 확인해야 합니다.',
            provider: 'rules',
        };
    }

    if (targetEvidence) {
        return {
            scope: 'CUSTOMER_TARGETED',
            confidence: 0.96,
            evidenceQuotes: [targetEvidence],
            requiredInputs: unique([...requiredInputs, 'TARGET_ELIGIBILITY']),
            reasoningSummary: '선착순·추첨·신규 고객 등 개인별 자격 확인이 필요합니다.',
            provider: 'rules',
        };
    }

    if (['skt', 'kt', 'lguplus'].includes(input.providerId)) {
        return {
            scope: 'STORE_WIDE',
            confidence: 0.95,
            evidenceQuotes: [storeWideEvidence ?? evidenceLines(input)[0] ?? input.title],
            requiredInputs,
            reasoningSummary: '통신사 제휴 할인이고 상품 지정 표현이 없어 매장 결제 혜택으로 분류했습니다.',
            provider: 'rules',
        };
    }

    if (input.providerId === 'naverpay' && storeWideEvidence) {
        return {
            scope: 'STORE_WIDE',
            confidence: 0.95,
            evidenceQuotes: [storeWideEvidence],
            requiredInputs,
            reasoningSummary: '결제수단과 결제금액 기준이 명시되고 상품·고객·지점 제한 표현이 없습니다.',
            provider: 'rules',
        };
    }

    if (storeWideEvidence || parsed.offer.condition.minSpend !== undefined) {
        return {
            scope: 'STORE_WIDE',
            confidence: storeWideEvidence ? 0.82 : 0.76,
            evidenceQuotes: [storeWideEvidence ?? evidenceLines(input)[0] ?? input.title],
            requiredInputs,
            reasoningSummary: '결제금액 기준 문구는 있으나 상품 범위가 생략될 수 있어 AI 또는 검수가 유용합니다.',
            provider: 'rules',
        };
    }

    return {
        scope: 'UNKNOWN',
        confidence: 0.35,
        evidenceQuotes: [],
        requiredInputs,
        reasoningSummary: '공식 문구만으로 매장 전체 적용 여부를 확정할 수 없습니다.',
        provider: 'rules',
    };
}

export const promotionSemanticOpenAISchema = z.object({
    scope: z.enum(scopes).describe('혜택이 적용되는 범위'),
    confidence: z.number().min(0).max(1).describe('공식 문구만으로 판단한 신뢰도'),
    evidenceQuotes: z.array(z.string()).max(3)
        .describe('입력 원문에서 그대로 복사한 짧은 근거 문장'),
    requiredInputs: z.array(z.enum(requiredInputValues))
        .describe('계산 전에 사용자에게 추가로 받아야 하는 정보'),
    eligibleItemSummary: z.string()
        .describe('상품/카테고리 한정이면 대상 요약, 아니면 빈 문자열'),
    reasoningSummary: z.string().describe('분류 이유를 설명하는 한 문장'),
}).strict();

type OpenAIClassification = z.infer<typeof promotionSemanticOpenAISchema>;

const validateOpenAIClassification = (
    value: unknown,
    input: PromotionSemanticInput,
): OpenAIClassification => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('OpenAI가 객체 형식의 분류를 반환하지 않았습니다.');
    }
    const result = value as Record<string, unknown>;
    if (!scopes.includes(result.scope as PromotionApplicabilityScope)) {
        throw new Error('OpenAI 적용 범위가 올바르지 않습니다.');
    }
    if (typeof result.confidence !== 'number' ||
        !Number.isFinite(result.confidence) ||
        result.confidence < 0 || result.confidence > 1) {
        throw new Error('OpenAI 신뢰도가 올바르지 않습니다.');
    }
    if (!Array.isArray(result.evidenceQuotes) || result.evidenceQuotes.length > 3 ||
        result.evidenceQuotes.some(item => typeof item !== 'string')) {
        throw new Error('OpenAI 근거 문장이 올바르지 않습니다.');
    }
    const sourceText = normalizeForEvidence(
        `${input.title}\n${input.description}\n${input.evidence}`
    );
    const evidenceQuotes = unique(result.evidenceQuotes
        .map(item => normalizeText(String(item)).slice(0, 300))
        .filter(Boolean));
    if (evidenceQuotes.some(quote => !sourceText.includes(normalizeForEvidence(quote)))) {
        throw new Error('OpenAI 근거 문장이 공식 원문에 없습니다.');
    }
    if (result.scope !== 'UNKNOWN' && evidenceQuotes.length === 0) {
        throw new Error('OpenAI 분류에 공식 원문 근거가 없습니다.');
    }
    if (!Array.isArray(result.requiredInputs) || result.requiredInputs.some(item =>
        !requiredInputValues.includes(item as PromotionRequiredInput)
    )) {
        throw new Error('OpenAI 추가 입력값이 올바르지 않습니다.');
    }
    if (typeof result.eligibleItemSummary !== 'string' ||
        typeof result.reasoningSummary !== 'string') {
        throw new Error('OpenAI 분류 설명이 올바르지 않습니다.');
    }

    return {
        scope: result.scope as PromotionApplicabilityScope,
        confidence: result.confidence,
        evidenceQuotes,
        requiredInputs: unique(result.requiredInputs as PromotionRequiredInput[]),
        eligibleItemSummary: normalizeText(result.eligibleItemSummary).slice(0, 300),
        reasoningSummary: normalizeText(result.reasoningSummary).slice(0, 500),
    };
};

export class OpenAIPromotionSemanticProvider implements PromotionSemanticProvider {
    readonly id = 'openai';
    readonly model: string;
    private readonly client: OpenAIStructuredResponseClient;

    constructor(options: { apiKey: string; model?: string }) {
        this.client = new OpenAIStructuredResponseClient({
            apiKey: options.apiKey,
            model: options.model,
            timeoutMs: 45_000,
        });
        this.model = this.client.model;
    }

    async classify(input: PromotionSemanticInput): Promise<PromotionSemanticAnalysis> {
        const instructions = [
            '당신은 한국 결제 혜택의 적용 범위를 분류합니다.',
            '입력된 공식 문구에 명시된 내용만 사용하고 브랜드에 대한 상식이나 추측은 사용하지 마세요.',
            'STORE_WIDE는 선택한 매장의 일반 결제금액 전체에 적용된다고 문구상 판단할 수 있을 때만 사용합니다.',
            'CATEGORY와 PRODUCT_SET은 결제금액 중 대상 상품 합계를 따로 알아야 합니다.',
            'CUSTOMER_TARGETED는 선착순, 추첨, 신규/일부 고객처럼 개인별 자격 확인이 필요할 때 사용합니다.',
            '불명확하면 반드시 UNKNOWN으로 분류하세요.',
            'evidenceQuotes는 아래 원문에서 공백을 포함해 그대로 복사한 문장만 넣으세요.',
        ].join('\n');
        const prompt = [
            `제공자: ${input.providerId}`,
            `제목: ${input.title}`,
            `설명: ${input.description}`,
            `공식 원문:\n${input.evidence.slice(0, 8_000)}`,
        ].join('\n');
        const parsed = await this.client.parse({
            schema: promotionSemanticOpenAISchema,
            schemaName: 'promotion_semantic_classification',
            instructions,
            input: prompt,
            reasoningEffort: resolveOpenAIReasoningEffort(
                process.env.PROMOTION_AI_REASONING_EFFORT,
                'low',
            ),
            maxOutputTokens: 2_000,
        });
        const classification = validateOpenAIClassification(parsed, input);
        return {
            ...classification,
            ...(classification.eligibleItemSummary && {
                eligibleItemSummary: classification.eligibleItemSummary,
            }),
            provider: this.id,
            model: this.model,
        };
    }
}

export class PromotionSemanticClassifier {
    private calls = 0;
    private readonly cache = new Map<string, PromotionSemanticAnalysis>();

    constructor(
        private readonly provider?: PromotionSemanticProvider,
        private readonly maxCalls = 25,
        cachedAnalyses: PromotionSemanticAnalysis[] = [],
    ) {
        cachedAnalyses.forEach(analysis => {
            if (!analysis.inputHash || analysis.provider === 'rules') return;
            this.cache.set(semanticCacheKey({
                id: analysis.provider,
                model: analysis.model,
            }, analysis.inputHash), analysis);
        });
    }

    async classify(parsed: ParsedPromotion): Promise<PromotionSemanticAnalysis> {
        const ruleResult = classifyPromotionWithRules(parsed);
        const inputHash = semanticInputHash(inputFromParsed(parsed));
        const providerApplicable = Boolean(this.provider) &&
            ruleResult.scope !== 'PRODUCT_SET' &&
            ruleResult.scope !== 'CATEGORY' &&
            ruleResult.scope !== 'CUSTOMER_TARGETED' &&
            ruleResult.confidence < 0.9;
        if (!providerApplicable || !this.provider) return ruleResult;
        const cached = this.cache.get(semanticCacheKey(this.provider, inputHash));
        if (cached) return cached;
        if (this.calls >= this.maxCalls) return ruleResult;

        this.calls += 1;
        try {
            const aiResult = await this.provider.classify(inputFromParsed(parsed));
            const result = { ...aiResult, inputHash };
            this.cache.set(semanticCacheKey(this.provider, inputHash), result);
            return result;
        } catch (error) {
            return {
                ...ruleResult,
                diagnostic: error instanceof Error
                    ? error.message.slice(0, 300)
                    : 'AI 분류 실패',
            };
        }
    }
}

const aiMaxCalls = () => {
    const configured = Number(process.env.PROMOTION_AI_MAX_CALLS ?? 25);
    return Number.isSafeInteger(configured) && configured >= 0 ? configured : 25;
};

export function createPromotionSemanticClassifier(
    cachedAnalyses: PromotionSemanticAnalysis[] = [],
) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const provider = apiKey ? new OpenAIPromotionSemanticProvider({
        apiKey,
        model: process.env.PROMOTION_AI_MODEL || process.env.OPENAI_MODEL,
    }) : undefined;
    return new PromotionSemanticClassifier(provider, aiMaxCalls(), cachedAnalyses);
}

export function applyPromotionSemanticAnalysis(
    parsed: ParsedPromotion,
    analysis: PromotionSemanticAnalysis,
): ParsedPromotion {
    const itemScoped = analysis.scope === 'CATEGORY' || analysis.scope === 'PRODUCT_SET';
    const storeWide = analysis.scope === 'STORE_WIDE';
    const existingCondition = parsed.offer.condition;
    const chanceBased = /추첨|랜덤|당첨/.test(`${parsed.offer.title}\n${parsed.evidence}`);
    const informational = parsed.offer.action.valueSemantics === 'UP_TO' ||
        existingCondition.calculationMode === 'INFORMATION_ONLY' || chanceBased;
    const requiredInputs = unique([
        ...(existingCondition.requiredInputs ?? []),
        ...analysis.requiredInputs,
        ...(existingCondition.requiresCoupon ? ['COUPON' as const] : []),
        ...(existingCondition.requiresEnrollment ? ['ENROLLMENT' as const] : []),
        ...(itemScoped ? ['ELIGIBLE_ITEM_AMOUNT' as const] : []),
    ]);
    const calculationMode = informational
        ? 'INFORMATION_ONLY' as const
        : existingCondition.calculationMode === 'CONDITIONAL' ||
            analysis.scope === 'CUSTOMER_TARGETED' ||
            requiredInputs.includes('STORE_ELIGIBILITY') ||
            requiredInputs.includes('PAYMENT_INSTRUMENT')
                ? 'CONDITIONAL' as const
                : 'CALCULABLE' as const;
    const confirmationRequired = existingCondition.confirmationRequired === true ||
        calculationMode === 'CONDITIONAL';
    const manualCheckRequired = existingCondition.manualCheckRequired === true ||
        analysis.scope === 'UNKNOWN' ||
        analysis.confidence < 0.75;
    const amountBasis = itemScoped
        ? 'ELIGIBLE_ITEM_AMOUNT' as const
        : existingCondition.amountBasis === 'ELIGIBLE_ITEM_AMOUNT'
            ? parsed.offer.layer === 'DISCOUNT' ? 'ORIGINAL_AMOUNT' as const : 'REMAINING_AMOUNT' as const
            : existingCondition.amountBasis;
    const requiredNote = existingCondition.requiredNote ||
        (informational
            ? chanceBased
                ? '추첨형 혜택이며 최대 할인 계산에서는 제외됩니다.'
                : '최대 혜택 정보이며 정확한 할인 계산에서는 제외됩니다.'
            : requiredInputs.includes('STORE_ELIGIBILITY')
                ? itemScoped
                    ? '대상 상품 합계와 이용하려는 지점의 행사 여부를 확인해야 합니다.'
                    : '이용하려는 지점이 행사 대상인지 확인해야 합니다.'
            : itemScoped
            ? analysis.eligibleItemSummary || '행사 대상 상품 합계를 입력해야 계산할 수 있습니다.'
            : analysis.scope === 'CUSTOMER_TARGETED'
                ? '개인별 행사 대상 여부를 확인해야 합니다.'
                : analysis.scope === 'UNKNOWN'
                    ? '매장 전체 적용 여부를 공식 상세에서 확인해야 합니다.'
                    : undefined);
    const autoPublish = parsed.autoPublish &&
        (analysis.scope !== 'UNKNOWN' || informational) &&
        (analysis.scope !== 'CUSTOMER_TARGETED' || calculationMode !== 'CALCULABLE') &&
        analysis.confidence >= 0.85;
    const warnings = unique([
        ...parsed.warnings,
        ...(itemScoped ? ['상품 한정 혜택: 대표 최대 혜택에서 분리'] : []),
        ...(analysis.scope === 'UNKNOWN' ? ['적용 범위 미확정: 승인 전 범위 선택 필요'] : []),
        ...(analysis.diagnostic ? [`AI 폴백: ${analysis.diagnostic}`] : []),
    ]);

    return {
        ...parsed,
        autoPublish,
        warnings,
        semanticAnalysis: analysis,
        offer: {
            ...parsed.offer,
            condition: {
                ...existingCondition,
                amountBasis,
                applicabilityScope: analysis.scope,
                calculationMode,
                headlineEligible: storeWide && !informational,
                itemSpecific: itemScoped,
                requiredInputs,
                ...(analysis.eligibleItemSummary
                    ? { eligibleItemSummary: analysis.eligibleItemSummary }
                    : {}),
                manualCheckRequired,
                confirmationRequired,
                ...(requiredNote ? { requiredNote } : {}),
            },
            certainty: analysis.scope === 'UNKNOWN'
                ? 'CONDITIONAL'
                : parsed.offer.certainty,
        },
    };
}

export async function classifyParsedPromotions(
    parsed: ParsedPromotion[],
    classifier = createPromotionSemanticClassifier(),
) {
    const classified: ParsedPromotion[] = [];
    for (const offer of parsed) {
        const analysis = await classifier.classify(offer);
        classified.push(applyPromotionSemanticAnalysis(offer, analysis));
    }
    return classified;
}
