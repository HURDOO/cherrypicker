import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
    LimitConfig,
    PromotionAction,
    PromotionApplicabilityScope,
    PromotionCalculationMode,
    PromotionChannel,
    PromotionRequiredInput,
} from '@/types';
import {
    OpenAIStructuredResponseClient,
    resolveOpenAIReasoningEffort,
} from './openai-responses';
import {
    resolveOfficialBrand,
    type ParsedPromotion,
    type SktMembershipBenefitVariantSource,
} from './promotion-parsers';

const actionTypes = [
    'PERCENT',
    'FLAT',
    'FIXED_PRICE',
    'POINTS',
    'CASHBACK',
    'GIFT_CERTIFICATE',
] as const;
const scopes = [
    'STORE_WIDE',
    'CATEGORY',
    'PRODUCT_SET',
    'CUSTOMER_TARGETED',
    'UNKNOWN',
] as const;
const calculationModes = [
    'CALCULABLE',
    'CONDITIONAL',
    'INFORMATION_ONLY',
] as const;
const channels = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'] as const;
const requiredInputs = [
    'ELIGIBLE_ITEM_AMOUNT',
    'COUPON',
    'ENROLLMENT',
    'SUBSCRIPTION_PRODUCT',
    'TARGET_ELIGIBILITY',
    'STORE_ELIGIBILITY',
    'PAYMENT_INSTRUMENT',
] as const;
const evidencePaths = [
    'action.type',
    'action.value',
    'action.valueSemantics',
    'action.maxBenefit',
    'action.faceValue',
    'action.unitAmount',
    'condition.applicabilityScope',
    'condition.eligibleItemSummary',
    'condition.minSpend',
    'condition.telecomTiers',
    'condition.telecomModes',
    'condition.requiredInputs',
    'channels',
    'limitConfig.dailyCount',
    'limitConfig.dailyAmount',
    'limitConfig.monthlyCount',
    'limitConfig.monthlyAmount',
    'limitConfig.yearlyCount',
    'limitConfig.sharedFields',
] as const;

const evidenceItemSchema = z.object({
    path: z.enum(evidencePaths),
    quotes: z.array(z.string()).min(1).max(4),
}).strict();

const aiBenefitSchema = z.object({
    variantIndex: z.number().int().min(0),
    layer: z.enum(['DISCOUNT', 'POST_REWARD']),
    actionType: z.enum(actionTypes),
    actionValue: z.number().min(0),
    valueSemantics: z.enum(['EXACT', 'UP_TO']),
    maxBenefit: z.number().int().positive().nullable(),
    faceValue: z.number().int().positive().nullable(),
    unitAmount: z.number().int().positive().nullable(),
    applicabilityScope: z.enum(scopes),
    calculationMode: z.enum(calculationModes),
    channels: z.array(z.enum(channels)).max(4),
    minSpend: z.number().int().positive().nullable(),
    eligibleItemSummary: z.string(),
    requiredInputs: z.array(z.enum(requiredInputs)).max(7),
    dailyCount: z.number().int().positive().nullable(),
    dailyAmount: z.number().int().positive().nullable(),
    monthlyCount: z.number().int().positive().nullable(),
    monthlyAmount: z.number().int().positive().nullable(),
    yearlyCount: z.number().int().positive().nullable(),
    confidence: z.number().min(0).max(1),
    reasoningSummary: z.string(),
    fieldEvidence: z.array(evidenceItemSchema).max(30),
}).strict();

export const sktPromotionOpenAISchema = z.object({
    benefits: z.array(aiBenefitSchema).min(1).max(20),
}).strict();

type SktPromotionOpenAIOutput = z.infer<typeof sktPromotionOpenAISchema>;

export interface SktPromotionAiInput {
    officialBrandId: string;
    brandName: string;
    sourceUrl: string;
    detailUrl: string;
    listText: string;
    detailText: string;
    variants: SktMembershipBenefitVariantSource[];
    retryFeedback?: string;
}

export interface SktPromotionAiProvider {
    id: string;
    model?: string;
    extract(input: SktPromotionAiInput): Promise<unknown>;
}

export interface SktPromotionAiCachedResult {
    inputHash: string;
    provider: string;
    model?: string;
    variantIndex: number;
    variantCount: number;
    promotion: ParsedPromotion;
}

export interface SktPromotionAiParseResult {
    promotions: ParsedPromotion[];
    attempted: boolean;
    cacheHit: boolean;
    diagnostic?: string;
}

const unique = <T,>(values: T[]) => [...new Set(values)];
const normalizedText = (value: string) => value
    .normalize('NFKC')
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/\s*([/,:·])\s*/g, '$1')
    .trim()
    .toLocaleLowerCase('ko-KR');

export const sktPromotionAiInputHash = (input: SktPromotionAiInput) => createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');

const requiredEvidencePaths = (
    benefit: SktPromotionOpenAIOutput['benefits'][number],
) => unique([
    'action.type',
    'action.value',
    ...(benefit.valueSemantics === 'UP_TO' ? ['action.valueSemantics'] : []),
    ...(benefit.maxBenefit !== null ? ['action.maxBenefit'] : []),
    ...(benefit.faceValue !== null ? ['action.faceValue'] : []),
    ...(benefit.unitAmount !== null ? ['action.unitAmount'] : []),
    ...(benefit.applicabilityScope !== 'UNKNOWN'
        ? ['condition.applicabilityScope']
        : []),
    ...(benefit.eligibleItemSummary ? ['condition.eligibleItemSummary'] : []),
    ...(benefit.requiredInputs.length > 0 ? ['condition.requiredInputs'] : []),
    ...(benefit.channels.length > 0 ? ['channels'] : []),
    ...(benefit.minSpend !== null ? ['condition.minSpend'] : []),
    ...(benefit.dailyCount !== null ? ['limitConfig.dailyCount'] : []),
    ...(benefit.dailyAmount !== null ? ['limitConfig.dailyAmount'] : []),
    ...(benefit.monthlyCount !== null ? ['limitConfig.monthlyCount'] : []),
    ...(benefit.monthlyAmount !== null ? ['limitConfig.monthlyAmount'] : []),
    ...(benefit.yearlyCount !== null ? ['limitConfig.yearlyCount'] : []),
] as typeof evidencePaths[number][]);

const validateEvidence = (
    benefit: SktPromotionOpenAIOutput['benefits'][number],
    variant: SktMembershipBenefitVariantSource,
    input: SktPromotionAiInput,
) => {
    const combinedSourceText = `${input.listText}\n${input.detailText}`;
    const sourceText = normalizedText(combinedSourceText);
    const sourceLines = combinedSourceText
        .split('\n')
        .map(line => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    const fieldEvidence: Record<string, string[]> = {};
    benefit.fieldEvidence.forEach(item => {
        fieldEvidence[item.path] = unique([
            ...(fieldEvidence[item.path] ?? []),
            ...item.quotes.map(quote => quote.replace(/\s+/g, ' ').trim()).filter(Boolean),
        ]);
    });
    const allQuotes = Object.values(fieldEvidence).flat();
    const missingQuote = allQuotes.find(quote => !sourceText.includes(normalizedText(quote)));
    if (missingQuote) {
        throw new Error(
            `OpenAI SKT 근거 문장이 공식 원문에 없습니다: ${missingQuote.slice(0, 160)}`
        );
    }
    const missingPath = requiredEvidencePaths(benefit).find(path => (
        !fieldEvidence[path]?.length
    ));
    if (missingPath) {
        throw new Error(`OpenAI SKT 구조화 필드의 근거가 없습니다: ${missingPath}`);
    }
    Object.entries(fieldEvidence).forEach(([path, quotes]) => {
        fieldEvidence[path] = unique(quotes.map(quote => (
            sourceLines.find(line => normalizedText(line).includes(normalizedText(quote))) ?? quote
        )));
    });
    return fieldEvidence;
};

const numericValuesIn = (values: string[]) => unique(values.flatMap(value => {
    const matches = [...value.normalize('NFKC').matchAll(
        /(\d[\d,]*(?:\.\d+)?)\s*(억|만|천|백)?/g
    )].map(match => {
        const amount = Number(match[1].replaceAll(',', ''));
        const multiplier = match[2] === '억'
            ? 100_000_000
            : match[2] === '만'
                ? 10_000
                : match[2] === '천'
                    ? 1_000
                    : match[2] === '백'
                        ? 100
                        : 1;
        return amount * multiplier;
    }).filter(Number.isFinite);
    const perThousandRates = [...value.normalize('NFKC').matchAll(
        /(?:1\s*천|1,?000|천)\s*원당\s*([\d,.]+)\s*(?:원|P)/gi
    )].map(match => Number(match[1].replaceAll(',', '')) / 10)
        .filter(Number.isFinite);
    return [...matches, ...perThousandRates];
}));

const fieldSupportsNumber = (
    fieldEvidence: Record<string, string[]>,
    path: string,
    value: number | null,
) => value === null || value === 0 || numericValuesIn(fieldEvidence[path] ?? [])
    .some(candidate => Math.abs(candidate - value) < 0.0001);

const validateBenefit = (
    benefit: SktPromotionOpenAIOutput['benefits'][number],
) => {
    if (benefit.calculationMode !== 'INFORMATION_ONLY' && benefit.actionValue <= 0) {
        throw new Error('계산 가능한 OpenAI SKT 혜택 값은 0보다 커야 합니다.');
    }
    if (
        (benefit.valueSemantics === 'UP_TO' || benefit.actionValue === 0) &&
        benefit.calculationMode !== 'INFORMATION_ONLY'
    ) {
        throw new Error('최대값 또는 미확정 값은 정보 제공 혜택이어야 합니다.');
    }
    if (
        benefit.applicabilityScope === 'UNKNOWN' &&
        benefit.calculationMode !== 'INFORMATION_ONLY'
    ) {
        throw new Error('적용 범위가 불명확한 혜택은 정보 제공이어야 합니다.');
    }
};

const buildPromotion = (options: {
    benefit: SktPromotionOpenAIOutput['benefits'][number];
    variant: SktMembershipBenefitVariantSource;
    input: SktPromotionAiInput;
    inputHash: string;
    provider: Pick<SktPromotionAiProvider, 'id' | 'model'>;
    fieldEvidence: Record<string, string[]>;
}): ParsedPromotion => {
    const { benefit, variant, input, inputHash, provider, fieldEvidence } = options;
    const resolvedBrand = resolveOfficialBrand(input.brandName);
    if (!resolvedBrand) throw new Error('OpenAI SKT 후보의 브랜드를 확인할 수 없습니다.');
    const itemScoped = benefit.applicabilityScope === 'CATEGORY' ||
        benefit.applicabilityScope === 'PRODUCT_SET';
    const unsupportedActionValue = !fieldSupportsNumber(
        fieldEvidence,
        'action.value',
        benefit.actionValue,
    );
    const supportedLimit = (
        field: 'dailyCount' | 'dailyAmount' | 'monthlyCount' | 'monthlyAmount' | 'yearlyCount',
        value: number | null,
    ) => value !== null && fieldSupportsNumber(fieldEvidence, `limitConfig.${field}`, value);
    const extractedLimits: LimitConfig = {
        ...(supportedLimit('dailyCount', benefit.dailyCount) && {
            dailyCount: benefit.dailyCount!,
        }),
        ...(supportedLimit('dailyAmount', benefit.dailyAmount) && {
            dailyAmount: benefit.dailyAmount!,
        }),
        ...(supportedLimit('monthlyCount', benefit.monthlyCount) && {
            monthlyCount: benefit.monthlyCount!,
        }),
        ...(supportedLimit('monthlyAmount', benefit.monthlyAmount) && {
            monthlyAmount: benefit.monthlyAmount!,
        }),
        ...(supportedLimit('yearlyCount', benefit.yearlyCount) && {
            yearlyCount: benefit.yearlyCount!,
        }),
    };
    const sharedFields = [
        'dailyCount',
        'dailyAmount',
        'monthlyCount',
        'monthlyAmount',
        'yearlyCount',
    ].filter(field => extractedLimits[field as keyof LimitConfig] !== undefined) as
        NonNullable<LimitConfig['sharedFields']>;
    const limitConfig: LimitConfig = sharedFields.length > 0
        ? { ...extractedLimits, sharedFields }
        : extractedLimits;
    if (sharedFields.length > 0) {
        fieldEvidence['limitConfig.sharedFields'] = unique(sharedFields.flatMap(field => (
            fieldEvidence[`limitConfig.${field}`] ?? []
        )));
    }
    fieldEvidence['condition.telecomModes'] ??= [variant.description];
    if (variant.tiers.length > 0) {
        fieldEvidence['condition.telecomTiers'] ??= [variant.description];
    }
    fieldEvidence['action.type'] = unique([
        variant.description,
        ...(fieldEvidence['action.type'] ?? []),
    ]);
    if (unsupportedActionValue) {
        fieldEvidence['action.valueSemantics'] = unique([
            variant.description,
            ...(fieldEvidence['action.valueSemantics'] ?? []),
        ]);
    }
    const pointVariant = variant.membershipMode === 'POINTS';
    const action: PromotionAction = {
        type: pointVariant ? 'POINTS' : benefit.actionType,
        value: unsupportedActionValue ? 0 : benefit.actionValue,
        valueSemantics: unsupportedActionValue ? 'UP_TO' : benefit.valueSemantics,
        ...(fieldSupportsNumber(fieldEvidence, 'action.maxBenefit', benefit.maxBenefit) &&
            benefit.maxBenefit !== null && { maxBenefit: benefit.maxBenefit }),
        ...(fieldSupportsNumber(fieldEvidence, 'action.faceValue', benefit.faceValue) &&
            benefit.faceValue !== null && { faceValue: benefit.faceValue }),
        ...(fieldSupportsNumber(fieldEvidence, 'action.unitAmount', benefit.unitAmount) &&
            benefit.unitAmount !== null && { unitAmount: benefit.unitAmount }),
    };
    const quoteHash = createHash('sha256')
        .update(`${variant.membershipMode}:${variant.tiers.join(',')}:${variant.description}`)
        .digest('hex')
        .slice(0, 12);
    const requiredInputValues = unique([
        ...benefit.requiredInputs,
        ...(itemScoped ? ['ELIGIBLE_ITEM_AMOUNT' as const] : []),
    ]) as PromotionRequiredInput[];
    const evidenceQuotes = unique(Object.values(fieldEvidence).flat());
    const calculationMode = (unsupportedActionValue
        ? 'INFORMATION_ONLY'
        : benefit.calculationMode) as PromotionCalculationMode;
    const scope = benefit.applicabilityScope as PromotionApplicabilityScope;
    const channelValues = benefit.channels as PromotionChannel[];

    return {
        sourceKey: `brand:${resolvedBrand.id}:${variant.membershipMode.toLocaleLowerCase('en-US')}:ai:${quoteHash}`,
        evidence: unique([variant.description, ...evidenceQuotes]).join('\n'),
        autoPublish: false,
        warnings: [
            'SKT 규칙 파서 미해석: OpenAI 보조 구조화',
            '신규·변경 후보는 사람 검수 후 게시',
            ...(unsupportedActionValue ? [
                'AI action 숫자가 원문 근거에 없어 정보 제공으로 낮춤',
            ] : []),
        ],
        semanticScopeLocked: true,
        fieldEvidence,
        requiredEvidenceSourceUrl: input.detailUrl,
        ...(resolvedBrand.discoveredBrand && { discoveredBrand: resolvedBrand.discoveredBrand }),
        aiFallback: {
            inputHash,
            provider: provider.id,
            ...(provider.model && { model: provider.model }),
            officialBrandId: input.officialBrandId,
            variantIndex: benefit.variantIndex,
            variantCount: input.variants.length,
        },
        semanticAnalysis: {
            scope,
            confidence: benefit.confidence,
            evidenceQuotes,
            requiredInputs: requiredInputValues,
            ...(benefit.eligibleItemSummary && {
                eligibleItemSummary: benefit.eligibleItemSummary.slice(0, 300),
            }),
            reasoningSummary: benefit.reasoningSummary.slice(0, 500),
            provider: provider.id,
            ...(provider.model && { model: provider.model }),
        },
        offer: {
            providerId: 'skt',
            usageGroupId: `telecom:skt:brand:${resolvedBrand.id}`,
            layer: pointVariant ? 'POST_REWARD' : benefit.layer,
            title: `${input.brandName} ${variant.tiers.join('/')} ${variant.description}`
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 300),
            description: variant.description,
            brandIds: [resolvedBrand.id],
            categoryIds: [],
            channels: channelValues,
            action,
            condition: {
                amountBasis: itemScoped ? 'ELIGIBLE_ITEM_AMOUNT' : 'ORIGINAL_AMOUNT',
                applicabilityScope: scope,
                calculationMode,
                headlineEligible: scope === 'STORE_WIDE' &&
                    calculationMode !== 'INFORMATION_ONLY',
                telecomTiers: variant.tiers,
                telecomModes: [variant.membershipMode],
                ...(fieldSupportsNumber(
                    fieldEvidence,
                    'condition.minSpend',
                    benefit.minSpend,
                ) && benefit.minSpend !== null && { minSpend: benefit.minSpend }),
                ...(benefit.eligibleItemSummary && {
                    eligibleItemSummary: benefit.eligibleItemSummary.slice(0, 300),
                }),
                requiredInputs: requiredInputValues,
                manualCheckRequired: scope === 'UNKNOWN',
                confirmationRequired: calculationMode === 'CONDITIONAL',
                ...(calculationMode === 'INFORMATION_ONLY' && {
                    requiredNote: '복합·미확정 혜택은 공식 상세를 확인해야 합니다.',
                }),
                itemSpecific: itemScoped,
            },
            compatibility: {
                exclusiveGroup: `telecom:skt:${resolvedBrand.id}`,
            },
            limitConfig,
            certainty: calculationMode === 'CALCULABLE' ? 'CONFIRMED' : 'CONDITIONAL',
            sourceUrl: input.detailUrl,
        },
    };
};

const validateAndBuild = (
    value: unknown,
    input: SktPromotionAiInput,
    provider: Pick<SktPromotionAiProvider, 'id' | 'model'>,
    inputHash: string,
) => {
    const parsed = sktPromotionOpenAISchema.parse(value);
    if (parsed.benefits.length !== input.variants.length) {
        throw new Error('OpenAI SKT 결과가 모든 할인형·적립형 variant를 포함하지 않았습니다.');
    }
    const indexes = parsed.benefits.map(benefit => benefit.variantIndex);
    if (new Set(indexes).size !== input.variants.length ||
        indexes.some(index => index >= input.variants.length)) {
        throw new Error('OpenAI SKT variant 연결이 올바르지 않습니다.');
    }
    return parsed.benefits
        .slice()
        .sort((left, right) => left.variantIndex - right.variantIndex)
        .map(benefit => {
            const variant = input.variants[benefit.variantIndex];
            validateBenefit(benefit);
            const fieldEvidence = validateEvidence(benefit, variant, input);
            return buildPromotion({
                benefit,
                variant,
                input,
                inputHash,
                provider,
                fieldEvidence,
            });
        });
};

export class OpenAISktPromotionProvider implements SktPromotionAiProvider {
    readonly id = 'openai';
    readonly model: string;
    private readonly client: OpenAIStructuredResponseClient;

    constructor(options: { apiKey: string; model?: string }) {
        this.client = new OpenAIStructuredResponseClient({
            apiKey: options.apiKey,
            model: options.model,
            timeoutMs: 60_000,
        });
        this.model = this.client.model;
    }

    async extract(input: SktPromotionAiInput) {
        const instructions = [
            '당신은 SKT T 멤버십 공식 혜택의 보조 구조화 파서입니다.',
            '브랜드 상식이나 추측 없이 입력된 공식 문구만 사용하세요.',
            '입력 variants 각각에 정확히 결과 하나를 만들고 variantIndex로 연결하세요.',
            '한 variant에 복수 상품·금액·쿠폰이 섞여 단일 계산식으로 확정할 수 없으면 actionValue=0, valueSemantics=UP_TO, calculationMode=INFORMATION_ONLY로 두세요.',
            'UNKNOWN 적용 범위와 UP_TO 값은 반드시 INFORMATION_ONLY여야 합니다.',
            'channels는 공식 이용 방법에서 확인된 경우만 넣고 불명확하면 빈 배열로 두세요.',
            'fieldEvidence의 문장은 아래 원문에서 그대로 복사하고, 값을 만든 모든 필드에 대응하는 근거를 넣으세요.',
            '할인형과 적립형을 섞지 말고, 적립형 결과의 layer는 POST_REWARD로 두세요.',
            '신규가입중단 등 상태 문구도 reasoningSummary에 명시하세요.',
        ].join('\n');
        const prompt = [
            `공식 브랜드 ID: ${input.officialBrandId}`,
            `브랜드: ${input.brandName}`,
            `variants:\n${JSON.stringify(input.variants, null, 2)}`,
            `목록 원문:\n${input.listText}`,
            `상세 원문:\n${input.detailText}`,
            ...(input.retryFeedback ? [
                `직전 결과 검증 오류:\n${input.retryFeedback}\n오류를 고치고 원문 문장을 그대로 다시 복사하세요.`,
            ] : []),
        ].join('\n\n');
        return this.client.parse({
            schema: sktPromotionOpenAISchema,
            schemaName: 'skt_promotion_fallback_extraction',
            instructions,
            input: prompt,
            reasoningEffort: resolveOpenAIReasoningEffort(
                process.env.PROMOTION_SKT_AI_REASONING_EFFORT,
                'medium',
            ),
            maxOutputTokens: 8_000,
        });
    }
}

export class SktPromotionAiParser {
    private calls = 0;
    private readonly cache = new Map<string, SktPromotionAiCachedResult[]>();

    constructor(
        private readonly provider?: SktPromotionAiProvider,
        private readonly maxCalls = 15,
        cachedResults: SktPromotionAiCachedResult[] = [],
        private readonly maxSourceChars = 24_000,
    ) {
        cachedResults.forEach(result => {
            const values = this.cache.get(result.inputHash) ?? [];
            values.push(result);
            this.cache.set(result.inputHash, values);
        });
    }

    async parse(input: SktPromotionAiInput): Promise<SktPromotionAiParseResult> {
        const inputHash = sktPromotionAiInputHash(input);
        const cached = this.cache.get(inputHash)?.slice().sort((left, right) => (
            left.variantIndex - right.variantIndex
        ));
        if (cached && cached.length === input.variants.length &&
            cached.every((entry, index) => (
                entry.variantIndex === index && entry.variantCount === input.variants.length
            ))) {
            return {
                promotions: cached.map(entry => entry.promotion),
                attempted: false,
                cacheHit: true,
            };
        }
        if (!this.provider) {
            return {
                promotions: [],
                attempted: false,
                cacheHit: false,
                diagnostic: 'OPENAI_API_KEY가 없어 SKT 미해석 혜택을 구조화하지 못했습니다.',
            };
        }
        if (this.calls >= this.maxCalls) {
            return {
                promotions: [],
                attempted: false,
                cacheHit: false,
                diagnostic: `SKT AI 호출 상한 ${this.maxCalls}건에 도달했습니다.`,
            };
        }
        const providerInput = {
            ...input,
            detailText: input.detailText.slice(0, this.maxSourceChars),
        };
        let diagnostic = 'SKT AI 구조화 실패';
        let attempts = 0;
        while (attempts < 2 && this.calls < this.maxCalls) {
            this.calls += 1;
            attempts += 1;
            try {
                const value = await this.provider.extract({
                    ...providerInput,
                    ...(attempts > 1 && { retryFeedback: diagnostic }),
                });
                const promotions = validateAndBuild(
                    value,
                    providerInput,
                    this.provider,
                    inputHash,
                );
                this.cache.set(inputHash, promotions.map((promotion, variantIndex) => ({
                    inputHash,
                    provider: this.provider!.id,
                    ...(this.provider!.model && { model: this.provider!.model }),
                    variantIndex,
                    variantCount: promotions.length,
                    promotion,
                })));
                return { promotions, attempted: true, cacheHit: false };
            } catch (error) {
                diagnostic = error instanceof Error
                    ? error.message.replace(/\s+/g, ' ').trim().slice(0, 500)
                    : 'SKT AI 구조화 실패';
            }
        }
        return {
            promotions: [],
            attempted: true,
            cacheHit: false,
            diagnostic,
        };
    }
}

const configuredInteger = (value: string | undefined, fallback: number, max: number) => {
    const configured = Number(value ?? fallback);
    return Number.isSafeInteger(configured) && configured >= 0 && configured <= max
        ? configured
        : fallback;
};

export function createSktPromotionAiParser(
    cachedResults: SktPromotionAiCachedResult[] = [],
) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const provider = apiKey ? new OpenAISktPromotionProvider({
        apiKey,
        model: process.env.PROMOTION_SKT_AI_MODEL ||
            process.env.PROMOTION_AI_MODEL ||
            process.env.OPENAI_MODEL,
    }) : undefined;
    return new SktPromotionAiParser(
        provider,
        configuredInteger(process.env.PROMOTION_SKT_AI_MAX_CALLS, 15, 100),
        cachedResults,
        configuredInteger(process.env.PROMOTION_SKT_AI_MAX_SOURCE_CHARS, 24_000, 120_000),
    );
}
