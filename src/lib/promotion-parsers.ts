import { createHash } from 'node:crypto';
import type {
    BenefitCertainty,
    BenefitLayer,
    FundingType,
    LimitConfig,
    PromotionAction,
    PromotionChannel,
    PromotionCompatibility,
    PromotionCondition,
    PromotionRequiredInput,
    PromotionSemanticAnalysis,
    TelecomMembershipMode,
} from '@/types';

export type CollectedPromotionOffer = {
    providerId: string;
    usageGroupId?: string;
    layer: BenefitLayer;
    title: string;
    description: string;
    brandIds: string[];
    categoryIds: string[];
    channels: PromotionChannel[];
    startsAt?: string;
    endsAt?: string;
    action: PromotionAction;
    condition: PromotionCondition;
    compatibility: PromotionCompatibility;
    limitConfig: LimitConfig;
    certainty: BenefitCertainty;
    sourceUrl: string;
};

export type ParsedPromotion = {
    sourceKey: string;
    offer: CollectedPromotionOffer;
    evidence: string;
    autoPublish: boolean;
    warnings: string[];
    semanticScopeLocked?: boolean;
    semanticAnalysis?: PromotionSemanticAnalysis;
    discoveredBrand?: CollectedBrand;
    fieldEvidence?: Record<string, string[]>;
    expectedFields?: Array<{ path: string; evidence: string }>;
    requiredEvidenceSourceUrl?: string;
    aiFallback?: {
        inputHash: string;
        provider: string;
        model?: string;
        officialBrandId: string;
        variantIndex: number;
        variantCount: number;
    };
};

export type CollectedBrand = {
    id: string;
    name: string;
    categoryId: string;
    iconName: string;
};

type ParsedAction = {
    action: PromotionAction;
    reward: boolean;
    ambiguous: boolean;
};

type TelecomOfferOptions = {
    providerId: string;
    brandId: string;
    brandName: string;
    tiers: string[];
    membershipMode?: TelecomMembershipMode;
    usageGroupId?: string;
    description: string;
    evidence?: string;
    sourceUrl: string;
    channels?: PromotionChannel[];
    action: PromotionAction;
    autoPublish: boolean;
    warnings?: string[];
    maxBenefit?: number;
    minSpend?: number;
    limitConfig?: LimitConfig;
    manualCheckRequired?: boolean;
    reviewOnly?: boolean;
    requiredNote?: string;
    itemSpecific?: boolean;
    applicabilityScope?: PromotionCondition['applicabilityScope'];
    calculationMode?: PromotionCondition['calculationMode'];
    eligibleItemSummary?: string;
    requiredInputs?: PromotionRequiredInput[];
    semanticScopeLocked?: boolean;
    fieldEvidence?: Record<string, string[]>;
    expectedFields?: Array<{ path: string; evidence: string }>;
    requiredEvidenceSourceUrl?: string;
    discoveredBrand?: CollectedBrand;
};

type TrustedScopeOptions = {
    scope: 'PRODUCT_SET' | 'CUSTOMER_TARGETED' | 'STORE_WIDE';
    eligibleItemSummary?: string;
    requiredInputs?: PromotionCondition['requiredInputs'];
    requiredNote: string;
};

const decodeEntities = (text: string) => text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));

export const htmlToText = (html: string) => decodeEntities(
    html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<!--([\s\S]*?)-->/g, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(?:p|li|dd|dt|div|h[1-6])\s*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim()
);

const normalizeBrand = (name: string) => name
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '');

const brandAliases = new Map<string, string>();

const addBrandAliases = (id: string, ...names: string[]) => {
    names.forEach(name => brandAliases.set(normalizeBrand(name), id));
};

addBrandAliases('starbucks', '스타벅스');
addBrandAliases('twosome', '투썸플레이스', '투썸');
addBrandAliases('mega', '메가MGC커피', '메가커피');
addBrandAliases('compose', '컴포즈커피');
addBrandAliases('paiks', '빽다방');
addBrandAliases('ediya', '이디야', '이디야커피');
addBrandAliases('coffeebean', '커피빈');
addBrandAliases('paulbassett', '폴 바셋', '폴바셋');
addBrandAliases('baskin_robbins', '배스킨라빈스');
addBrandAliases('paris_baguette', '파리바게뜨', '파리바게트');
addBrandAliases('tous_les_jours', '뚜레쥬르');
addBrandAliases('dunkin', '던킨');
addBrandAliases('gongcha', '공차');
addBrandAliases('kfc', 'KFC');
addBrandAliases('lotteria', '롯데리아');
addBrandAliases('mcdonalds', '맥도날드');
addBrandAliases('burgerking', '버거킹');
addBrandAliases('momstouch', '맘스터치');
addBrandAliases('subway', '써브웨이', '서브웨이');
addBrandAliases('outback', '아웃백', '아웃백 스테이크하우스');
addBrandAliases('vips', 'VIPS', '빕스');
addBrandAliases('domino', '도미노피자');
addBrandAliases('pizzahut', '피자헛');
addBrandAliases('papa_johns', '파파존스', '파파존스피자');
addBrandAliases('baemin', '배달의민족');
addBrandAliases('yogiyo', '요기요');
addBrandAliases('ddaenggyo', '땡겨요');
addBrandAliases('coupangeats', '쿠팡이츠');
addBrandAliases('gs25', 'GS25');
addBrandAliases('cu', 'CU');
addBrandAliases('emart24', '이마트24');
addBrandAliases('seveneleven', '세븐일레븐');
addBrandAliases('emart', '이마트');
addBrandAliases('homeplus', '홈플러스');
addBrandAliases('lotte_mart', '롯데마트');
addBrandAliases('krispy_kreme', '크리스피크림', '크리스피크림 도넛');
addBrandAliases('oliveyoung', '올리브영');
addBrandAliases('daiso', '다이소');
addBrandAliases('cgv', 'CGV');
addBrandAliases('lotte_world', '롯데월드', '롯데월드 어드벤처');
addBrandAliases('seoul_land', '서울랜드');
addBrandAliases('caribbean', '캐리비안베이');
addBrandAliases('elevenst', '11번가');
addBrandAliases('cj_onstyle', 'CJ온스타일');
addBrandAliases('app_store', 'App Store', '앱스토어');
addBrandAliases('yes24', 'YES24', '예스24', '예스24 티켓');
addBrandAliases('lotte_cinema', '롯데시네마');
addBrandAliases('everland', '에버랜드');
addBrandAliases('kakaot', '카카오T', '카카오 T');

export const findSystemBrandId = (name: string) => brandAliases.get(normalizeBrand(name));

const canonicalBrandName = (name: string) => name
    .replace(/\s*\((?:온라인|오프라인)\)\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();

const categoryIcon: Record<string, string> = {
    cafe: 'Coffee',
    convenience: 'Store',
    food: 'Utensils',
    delivery: 'ShoppingBag',
    life: 'Gift',
    shopping: 'ShoppingBag',
    movie: 'Ticket',
    subscription: 'Tv',
    transport: 'Car',
    etc: 'Store',
};

const inferBrandCategory = (name: string, hint = '') => {
    const text = `${name} ${hint}`;
    if (/커피|카페|베이커리|도넛|아이스크림|디저트|백미당/.test(text)) return 'cafe';
    if (/편의점|마트|프레시|GS25|CU|이마24|세븐일레븐/.test(text)) return 'convenience';
    if (/치킨|피자|버거|레스토랑|식당|외식|요리|갈비|닭갈비|면소|빕수/.test(text)) return 'food';
    if (/배달|요기요|컬리|오아시스마켓|식봄/.test(text)) return 'delivery';
    if (/영화|시네|롯데월드|에버랜드|서울랜드|레고랜드|테마파크|놀이공원|아쿠아|리조트|스파|미술관|박물관|티켓|공연|전시|문화|여가/.test(text)) return 'movie';
    if (/항공|트립|호텔|렌터카|렌트카|카셰어링|여행|면세점/.test(text)) return 'transport';
    if (/뮤직|웹툰|멤버십|오피스|영상|구독/.test(text)) return 'subscription';
    if (/피부|네일|안경|헬스|휘트니스|펫|반려|병원|클리닉|의원|뷰티|화장품|이니스프리|생활/.test(text)) return 'life';
    if (/쇼핑|몰|스토어|샵|백화점|아울렛|전자랜드|하이마트|가구|면세점|식품관/.test(text)) return 'shopping';
    return 'etc';
};

const genericPromotionName = /(이벤트|미션|프로모션|가맹점|기획전|페이백|카드사|카드할인|스탬프|럭키볼|등록 이벤트|포인트 잘 쓰는 법)/;

export const resolveOfficialBrand = (
    rawName: string,
    hint = '',
    allowGeneric = true,
) => {
    const name = canonicalBrandName(rawName);
    const knownId = findSystemBrandId(name);
    if (knownId) return { id: knownId };
    if (!name || (!allowGeneric && genericPromotionName.test(name))) return undefined;
    const categoryId = inferBrandCategory(name, hint);
    const id = `official_${createHash('sha256')
        .update(normalizeBrand(name))
        .digest('hex')
        .slice(0, 16)}`;
    return {
        id,
        discoveredBrand: {
            id,
            name,
            categoryId,
            iconName: categoryIcon[categoryId] ?? categoryIcon.etc,
        },
    };
};

const unique = <T,>(items: T[]) => [...new Set(items)];

const normalizeTier = (tier: string) => {
    const trimmed = tier.trim();
    if (/^[a-z]+$/i.test(trimmed)) return trimmed.toUpperCase();
    if (trimmed === '골드') return 'GOLD';
    if (trimmed === '실버') return 'SILVER';
    if (trimmed === '화이트') return 'WHITE';
    return trimmed;
};

const parseTiersFromText = (text: string) => {
    const tiers: string[] = [];
    const matches: Array<[RegExp, string]> = [
        [/VVIP/i, 'VVIP'],
        [/(?<!V)VIP/i, 'VIP'],
        [/GOLD|골드/i, 'GOLD'],
        [/SILVER|실버/i, 'SILVER'],
        [/WHITE|화이트/i, 'WHITE'],
        [/우수/, '우수'],
        [/일반/, '일반'],
        [/LITE/i, 'LITE'],
    ];
    matches.forEach(([pattern, tier]) => {
        if (pattern.test(text)) tiers.push(tier);
    });
    return tiers;
};

const parseKoreanAmount = (value: string) => {
    const normalized = value.replaceAll(',', '').replaceAll(' ', '');
    const unitMatches = [...normalized.matchAll(/(\d+(?:\.\d+)?)(만|천)/g)];
    if (unitMatches.length > 0 && normalized.endsWith('원')) {
        const amount = unitMatches.reduce((sum, match) =>
            sum + Number(match[1]) * (match[2] === '만' ? 10_000 : 1_000), 0
        );
        return Number.isFinite(amount) ? Math.round(amount) : undefined;
    }
    const match = normalized.match(/^(\d+(?:\.\d+)?)원$/);
    if (!match) return undefined;
    const amount = Number(match[1]);
    return Number.isFinite(amount) ? Math.round(amount) : undefined;
};

const parseAction = (text: string): ParsedAction | undefined => {
    const perThousand = unique([...text.matchAll(
        /(?:1\s*천|1,?000|천)\s*원당\s*([\d,.]+)\s*(?:원|P)/gi
    )].map(match => Number(match[1].replaceAll(',', '')) / 10)
        .filter(value => Number.isFinite(value) && value > 0));
    const percentages = unique([...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
        .map(match => Number(match[1])).filter(value => Number.isFinite(value) && value > 0));
    const rates = perThousand.length > 0 ? perThousand : percentages;
    const reward = /적립|캐시백|포인트/.test(text) && !/할인/.test(text);

    if (rates.length > 0) {
        const unitAmount = perThousand.length > 0 ? 1_000 : undefined;
        return {
            action: {
                type: reward ? 'POINTS' : 'PERCENT',
                value: rates[0],
                ...(unitAmount && { unitAmount }),
                ...(/최대\s*\d+(?:\.\d+)?\s*%/.test(text) && {
                    valueSemantics: 'UP_TO' as const,
                }),
            },
            reward,
            ambiguous: rates.length > 1,
        };
    }

    const flatMatches = [...text.matchAll(
        /((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+(?:\.\d+)?\s*원)\s*(?:즉시\s*)?(할인|적립|캐시백|혜택)/g
    )];
    const amounts = unique(flatMatches
        .map(match => parseKoreanAmount(match[1]))
        .filter((value): value is number => value !== undefined && value > 0));
    if (amounts.length === 0) return undefined;

    return {
        action: {
            type: 'FLAT',
            value: amounts[0],
            ...(/최대\s*[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*(?:즉시\s*)?(?:할인|적립|캐시백|혜택)/.test(text) && {
                valueSemantics: 'UP_TO' as const,
            }),
        },
        reward: flatMatches.some(match => /적립|캐시백/.test(match[2])) && !/할인/.test(text),
        ambiguous: amounts.length > 1 || /할인\s*[·/]\s*적립|적립\s*[·/]\s*할인/.test(text),
    };
};

const parseMinSpend = (text: string) => {
    const match = text.match(/([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*이상/);
    return match ? parseKoreanAmount(match[1]) : undefined;
};

const parseMaxBenefit = (text: string) => {
    const match = text.match(
        /최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)(?:\s*(?:할인|적립|캐시백|혜택|한도|까지))?/
    );
    return match ? parseKoreanAmount(match[1]) : undefined;
};

const splitTierBenefitLine = (line: string) => {
    const marker = /(?:VVIP(?:\s*\/\s*VIP)?|(?<!V)VIP|우수)\s*:/gi;
    const matches = [...line.matchAll(marker)];
    if (matches.length < 2) return [line];
    return matches.map((match, index) => line
        .slice(match.index, matches[index + 1]?.index ?? line.length)
        .trim()
    ).filter(Boolean);
};

const parseLimitConfig = (text: string): LimitConfig => {
    const daily = text.match(/(?:일|하루)\s*(?:최대\s*)?(\d+)\s*회/);
    const monthly = text.match(/월\s*(?:최대\s*)?(\d+)\s*회/);
    const yearly = text.match(/연\s*(?:최대\s*)?(\d+)\s*회/);
    return {
        ...(daily && { dailyCount: Number(daily[1]) }),
        ...(monthly && { monthlyCount: Number(monthly[1]) }),
        ...(yearly && { yearlyCount: Number(yearly[1]) }),
    };
};

const parsePurchaseCap = (text: string) => {
    const patterns = [
        /(?:결제|이용|구매|주문)\s*금액[^\n]{0,30}?최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)/,
        /최대\s*(?:결제|이용|구매|주문)\s*금액[^\n]{0,20}?([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)/,
        /(?:결제|이용|구매|주문)\s*금액\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*한도/,
        /1\s*회\s*최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*한도/,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseKoreanAmount(match[1]);
    }
    return undefined;
};

const parseMonthlyPurchaseCap = (text: string) => {
    const match = text.match(
        /월\s*(?:결제|이용|구매|주문)\s*금액[^\n]{0,30}?최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)/
    );
    return match ? parseKoreanAmount(match[1]) : undefined;
};

const telecomSourceKey = (
    brandId: string,
    tiers: string[],
    variant = 0,
    membershipMode: TelecomMembershipMode = 'DISCOUNT',
) =>
    `brand:${brandId}:${membershipMode.toLocaleLowerCase('en-US')}:${
        tiers.map(normalizeTier).sort().join('-') || 'ALL'}${
        variant ? `:${variant}` : ''
    }`;

const buildTelecomOffer = (options: TelecomOfferOptions): ParsedPromotion => {
    const tiers = unique(options.tiers.map(normalizeTier));
    const manual = Boolean(options.manualCheckRequired) || (
        !options.autoPublish && !options.reviewOnly
    );
    const membershipMode = options.membershipMode ?? (
        options.providerId === 'skt' ? 'DISCOUNT' : undefined
    );
    const action = {
        ...options.action,
        ...(options.maxBenefit && { maxBenefit: options.maxBenefit }),
    };
    const reward = action.type === 'POINTS' || action.type === 'CASHBACK';
    const actionLabel = action.type === 'PERCENT' || action.type === 'POINTS'
        ? `${action.value}% ${reward ? '적립' : '할인'}`
        : `${action.value.toLocaleString('ko-KR')}원 ${reward ? '적립' : '할인'}`;
    const applicabilityScope = options.applicabilityScope ?? (
        options.itemSpecific ? 'PRODUCT_SET' : undefined
    );
    const calculationMode = options.calculationMode ?? (
        manual ? 'CONDITIONAL' : 'CALCULABLE'
    );
    const conditional = manual || calculationMode === 'CONDITIONAL';
    const requiredInputs = unique([
        ...(options.requiredInputs ?? []),
        ...(applicabilityScope === 'PRODUCT_SET'
            ? ['ELIGIBLE_ITEM_AMOUNT' as const]
            : []),
    ]);
    return {
        sourceKey: telecomSourceKey(options.brandId, tiers, 0, membershipMode),
        evidence: options.evidence ?? options.description,
        autoPublish: options.autoPublish,
        warnings: options.warnings ?? [],
        ...(options.semanticScopeLocked && { semanticScopeLocked: true }),
        ...(options.discoveredBrand && { discoveredBrand: options.discoveredBrand }),
        ...(options.fieldEvidence && { fieldEvidence: options.fieldEvidence }),
        ...(options.expectedFields && { expectedFields: options.expectedFields }),
        ...(options.requiredEvidenceSourceUrl && {
            requiredEvidenceSourceUrl: options.requiredEvidenceSourceUrl,
        }),
        offer: {
            providerId: options.providerId,
            ...(options.usageGroupId && { usageGroupId: options.usageGroupId }),
            layer: reward ? 'POST_REWARD' : 'DISCOUNT',
            title: `${options.brandName} ${tiers.join('/')} ${actionLabel}`
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 300),
            description: options.description,
            brandIds: [options.brandId],
            categoryIds: [],
            channels: options.channels ?? ['OFFLINE'],
            action,
            condition: {
                amountBasis: options.itemSpecific ? 'ELIGIBLE_ITEM_AMOUNT' : 'ORIGINAL_AMOUNT',
                ...(applicabilityScope && { applicabilityScope }),
                calculationMode,
                headlineEligible: applicabilityScope === 'STORE_WIDE' &&
                    calculationMode !== 'INFORMATION_ONLY',
                telecomTiers: tiers,
                ...(membershipMode && { telecomModes: [membershipMode] }),
                ...(options.minSpend && { minSpend: options.minSpend }),
                ...(options.eligibleItemSummary && {
                    eligibleItemSummary: options.eligibleItemSummary,
                }),
                ...(requiredInputs.length > 0 && { requiredInputs }),
                manualCheckRequired: Boolean(options.manualCheckRequired),
                confirmationRequired: conditional,
                ...((options.requiredNote || manual) && {
                    requiredNote: options.requiredNote ?? '공식 페이지의 대상·제외 조건 확인',
                }),
                ...(options.itemSpecific && { itemSpecific: true }),
            },
            compatibility: {
                exclusiveGroup: `telecom:${options.providerId}:${options.brandId}`,
            },
            limitConfig: options.limitConfig ?? {},
            certainty: conditional ? 'CONDITIONAL' : 'CONFIRMED',
            sourceUrl: options.sourceUrl,
        },
    };
};

const withTrustedConditionalScope = (
    parsed: ParsedPromotion,
    options: TrustedScopeOptions,
): ParsedPromotion => {
    const itemSpecific = options.scope === 'PRODUCT_SET';
    const requiresCoupon = /쿠폰/.test(parsed.evidence);
    return {
        ...parsed,
        autoPublish: true,
        warnings: parsed.warnings,
        semanticScopeLocked: true,
        offer: {
            ...parsed.offer,
            condition: {
                ...parsed.offer.condition,
                amountBasis: itemSpecific ? 'ELIGIBLE_ITEM_AMOUNT' : 'ORIGINAL_AMOUNT',
                applicabilityScope: options.scope,
                calculationMode: 'CONDITIONAL',
                headlineEligible: false,
                ...(options.eligibleItemSummary && {
                    eligibleItemSummary: options.eligibleItemSummary,
                }),
                requiredInputs: unique([
                    ...(options.requiredInputs ?? ['TARGET_ELIGIBILITY']),
                    ...(requiresCoupon ? ['COUPON' as const] : []),
                ]),
                requiresCoupon,
                confirmationRequired: true,
                manualCheckRequired: false,
                requiredNote: options.requiredNote,
                itemSpecific,
            },
            certainty: 'CONDITIONAL',
        },
    };
};

const tierClasses = (html: string) => {
    const tiers: string[] = [];
    const aliases: Array<[RegExp, string]> = [
        [/badge-circle\s+vip/i, 'VIP'],
        [/badge-circle\s+gold/i, 'GOLD'],
        [/badge-circle\s+silver/i, 'SILVER'],
        [/badge-circle\s+lite/i, 'LITE'],
    ];
    aliases.forEach(([pattern, tier]) => {
        if (pattern.test(html)) tiers.push(tier);
    });
    return tiers;
};

export interface SktMembershipBenefitVariantSource {
    membershipMode: TelecomMembershipMode;
    tiers: string[];
    description: string;
}

export interface SktMembershipBrandSource {
    officialId: string;
    brandName: string;
    listText: string;
    variants: SktMembershipBenefitVariantSource[];
}

export function extractSktMembershipBrandSources(html: string): SktMembershipBrandSource[] {
    const sources: SktMembershipBrandSource[] = [];
    const blockPattern = /<a([^>]*\bclass=['"][^'"]*\bbenefit-box\b[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;

    for (const blockMatch of html.matchAll(blockPattern)) {
        const officialId = blockMatch[1].match(/\bdata-id=['"](\d+)['"]/i)?.[1];
        const brandName = htmlToText(
            blockMatch[2].match(/<span[^>]*class=['"]brand['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ''
        );
        if (!officialId || !brandName) continue;
        const variants: SktMembershipBenefitVariantSource[] = [];
        for (const sectionMatch of blockMatch[2].matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/gi)) {
            const section = sectionMatch[1];
            const label = htmlToText(
                section.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i)?.[1] ?? ''
            );
            const membershipMode = label.includes('할인형')
                ? 'DISCOUNT' as const
                : label.includes('적립형')
                    ? 'POINTS' as const
                    : undefined;
            if (!membershipMode) continue;
            for (const infoMatch of section.matchAll(
                /<div[^>]*class=['"]info['"][^>]*>([\s\S]*?)<\/div>/gi
            )) {
                const description = htmlToText(infoMatch[1]);
                if (!description || /포인트\s*사용/.test(description)) continue;
                variants.push({
                    membershipMode,
                    tiers: tierClasses(infoMatch[1]),
                    description,
                });
            }
        }
        sources.push({
            officialId,
            brandName,
            listText: htmlToText(blockMatch[0]),
            variants,
        });
    }

    return sources;
}

export const extractSktDetailText = (html: string) => {
    const text = htmlToText(html);
    const benefitIndex = text.search(/(?:^|\n)혜택(?:\n|$)/);
    const relatedIndex = text.indexOf('\n비슷한 혜택 브랜드');
    const start = benefitIndex >= 0 ? benefitIndex : 0;
    const end = relatedIndex > start ? relatedIndex : text.length;
    return text.slice(start, end).trim();
};

const detailLines = (text: string) => text
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const amountFromToken = (value: string) => parseKoreanAmount(
    `${value.replace(/[원Pp\s]+$/u, '').trim()}원`
);

const normalizedTiers = (value: string) => value
    .split(/\s*\/\s*/)
    .map(normalizeTier);

const tierAmountFromLine = (line: string, tiers: string[]) => {
    const normalizedOfferTiers = new Set(tiers.map(normalizeTier));
    const tierAmounts = [...line.matchAll(
        /((?:VVIP|VIP|GOLD|SILVER|WHITE|LITE|골드|실버|화이트)(?:\s*\/\s*(?:VVIP|VIP|GOLD|SILVER|WHITE|LITE|골드|실버|화이트))*)[^\d\n]{0,12}([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/giu
    )].map(match => ({
        tiers: normalizedTiers(match[1]),
        amount: amountFromToken(match[2]),
    })).filter((entry): entry is { tiers: string[]; amount: number } => (
        entry.amount !== undefined
    ));
    const matching = tierAmounts.find(entry => entry.tiers.some(tier => (
        normalizedOfferTiers.has(tier)
    )));
    if (matching) return matching.amount;
    if (tierAmounts.length > 0) return undefined;

    const single = line.match(/(?:일|월)?\s*최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/u);
    return single ? amountFromToken(single[1]) : undefined;
};

const benefitCapEvidence = (
    text: string,
    membershipMode: TelecomMembershipMode,
    tiers: string[],
    period?: 'daily' | 'monthly',
) => {
    const benefitPattern = membershipMode === 'POINTS' ? /적립/ : /할인/;
    return detailLines(text).flatMap(line => {
        if (!benefitPattern.test(line) || !/최대/.test(line) || /포인트\s*사용/.test(line)) {
            return [];
        }
        const periodPattern = period === 'daily'
            ? /(?:일|하루)\s*최대/
            : period === 'monthly'
                ? /월\s*최대/
                : undefined;
        const periodMatch = periodPattern?.exec(line);
        if (periodPattern && !periodMatch) return [];
        const relevantText = periodMatch?.index === undefined
            ? line
            : line.slice(periodMatch.index);
        const amount = tierAmountFromLine(relevantText, tiers);
        return amount ? [{ amount, line }] : [];
    })[0];
};

const parentheticalBenefitCap = (description: string) => {
    const match = description.match(
        /(?:할인|적립)\s*\(([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))\)/u
    );
    return match ? amountFromToken(match[1]) : undefined;
};

const relevantDetailEvidence = (text: string) => detailLines(text).filter(line => (
    /횟수|최대|이상|대상|한함|제외|중복|Web|App|웹|앱|온라인|오프라인|매장|키오스크|주문|예매|구매\s*한도/.test(line)
)).slice(0, 30);

const inferSktChannels = (text: string) => {
    const lines = detailLines(text);
    const onlineOnlyPattern = /(?:Web\s*\/\s*App|웹\s*\/\s*앱|온라인\s*채널|11번가\s*App|T\s*멤버십\s*(?:모바일\s*)?앱에서\s*(?:예매|구매)|예약\s*주소[^\n]*접속)/i;
    const offlinePattern = /(?:매장\s*직원|매장에\s*방문|현장\s*(?:구매|할인|매표소)|키오스크|카운터|레스토랑|직원에게[^\n]{0,80}(?:바코드|카드))/i;
    const unavailableOfflinePattern = /(?:매장\s*구매\s*시\s*혜택\s*적용\s*안\s*됨|매장[^\n]{0,20}이용할\s*수\s*없)/i;
    const onlinePattern = /(?:온라인|Web|App|웹|앱)[^\n]{0,40}(?:주문|예매|구매|예약|이용\s*가능)/i;
    const onlineOnlyLine = lines.find(line => onlineOnlyPattern.test(line));
    const offlineLine = lines.find(line => (
        offlinePattern.test(line) && !unavailableOfflinePattern.test(line)
    ));
    const onlineLine = onlineOnlyLine ?? lines.find(line => onlinePattern.test(line));
    const channels: PromotionChannel[] = onlineLine && offlineLine
        ? ['ONLINE', 'OFFLINE']
        : onlineLine
            ? ['OFFICIAL_SITE']
            : offlineLine
                ? ['OFFLINE']
                : [];
    return {
        channels,
        evidence: unique([onlineLine, offlineLine].filter(Boolean) as string[]),
    };
};

const inferSktScope = (description: string, detailText: string) => {
    const lines = detailLines(detailText);
    const targetLine = lines.find(line => (
        /(?:혜택\s*)?대상\s*(?:상품|제품|메뉴)|제조\s*음료에\s*한함|제조\s*커피[^\n]*도넛[^\n]*한하여|시그니처\s*커피[^\n]*대상/.test(line)
    ));
    const exclusionLine = lines.find(line => (
        /(?:상품|제품|메뉴|서비스)[^\n]{0,80}(?:제외|적용\s*불가|이용\s*불가)|(?:제외|특가|행사)\s*(?:상품|제품|메뉴)/.test(line)
    ));
    const describedProduct = /싱글레귤러|시그니처\s*커피|종합이용권|영화\s*관람권|금액권|(?:상품|제품|메뉴)\s*구매\s*시/.test(description);
    const scope = targetLine || exclusionLine || describedProduct
        ? 'PRODUCT_SET' as const
        : 'STORE_WIDE' as const;
    const eligibleItemSummary = targetLine ?? exclusionLine ?? (
        describedProduct ? description : undefined
    );
    return {
        scope,
        eligibleItemSummary,
        evidence: targetLine ?? exclusionLine ?? description,
    };
};

const parseSktLimitConfig = (text: string) => {
    const lines = detailLines(text);
    const specs = [
        ['dailyCount', /(?:일|하루)\s*(?:최대\s*)?(\d+)\s*(?:회|장)/] as const,
        ['monthlyCount', /(?:월|매달)\s*(?:최대\s*)?(\d+)\s*(?:회|장)/] as const,
        ['yearlyCount', /(?:연|매년)\s*(?:최대\s*)?(\d+)\s*(?:회|장)/] as const,
    ];
    const limitConfig: LimitConfig = {};
    const evidence: Record<string, string[]> = {};
    specs.forEach(([field, pattern]) => {
        const matched = lines.flatMap(line => {
            const match = line.match(pattern);
            return match ? [{ line, value: Number(match[1]) }] : [];
        })[0];
        if (!matched || !Number.isSafeInteger(matched.value) || matched.value < 1) return;
        limitConfig[field] = matched.value;
        evidence[`limitConfig.${field}`] = [matched.line];
    });
    return { limitConfig, evidence };
};

const transactionBenefitCapEvidence = (
    text: string,
    membershipMode: TelecomMembershipMode,
    tiers: string[],
) => {
    const benefitPattern = membershipMode === 'POINTS' ? /적립/ : /할인/;
    const capPatterns = [
        /결제\s*건당\s*최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/u,
        /1회\s*이용\s*시\s*최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/u,
        /(?:할인|적립)\s*\([^\n)]{0,50}?최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/u,
        /(?:할인|적립)[^\n]{0,50}?최대\s*([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*(?:원|P))/u,
    ];
    return detailLines(text).flatMap(line => {
        if (!benefitPattern.test(line) || /월\s*최대/.test(line)) return [];
        const tierAmount = tierAmountFromLine(line, tiers);
        if (tierAmount !== undefined && /(?:일|하루)\s*최대/.test(line)) {
            return [{ amount: tierAmount, line }];
        }
        for (const pattern of capPatterns) {
            const match = line.match(pattern);
            const amount = match ? amountFromToken(match[1]) : undefined;
            if (amount !== undefined) return [{ amount, line }];
        }
        return [];
    })[0];
};

const sktExpectedFields = (detailText: string) => {
    const lines = detailLines(detailText);
    const expected: Array<{ path: string; evidence: string }> = [];
    const add = (path: string, pattern: RegExp) => {
        const evidence = lines.find(line => pattern.test(line));
        if (evidence) expected.push({ path, evidence });
    };
    add('limitConfig.dailyCount', /(?:일|하루)\s*(?:최대\s*)?\d+\s*회|1일\s*횟수\s*제한/);
    add('limitConfig.monthlyCount', /월\s*(?:최대\s*)?\d+\s*회/);
    add('limitConfig.yearlyCount', /연\s*(?:최대\s*)?\d+\s*회/);
    add('condition.minSpend', /[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*이상/);
    add('condition.applicabilityScope', /(?:혜택\s*)?대상\s*(?:상품|제품|메뉴)|(?:상품|제품|메뉴)[^\n]{0,50}(?:제외|한함)/);
    const inferredChannel = inferSktChannels(detailText);
    if (inferredChannel.channels.length > 0 && inferredChannel.evidence[0]) {
        expected.push({ path: 'channels', evidence: inferredChannel.evidence[0] });
    }
    return expected;
};

const sktFieldEvidence = (
    description: string,
    options: {
        dailyCapLine?: string;
        monthlyCapLine?: string;
        minSpendLine?: string;
        scopeLine?: string;
        channelLines: string[];
        requiredInputLines: string[];
        limitEvidence: Record<string, string[]>;
        maxBenefitLines: string[];
    },
) => ({
    'action.type': [description],
    'action.value': [description],
    'action.unitAmount': [description],
    'action.maxBenefit': unique(options.maxBenefitLines),
    'condition.telecomTiers': [description],
    'condition.telecomModes': [description],
    'condition.minSpend': [options.minSpendLine ?? description].filter(Boolean) as string[],
    'condition.applicabilityScope': [options.scopeLine].filter(Boolean) as string[],
    'condition.eligibleItemSummary': [options.scopeLine].filter(Boolean) as string[],
    'condition.requiredInputs': unique(options.requiredInputLines),
    channels: unique(options.channelLines),
    'limitConfig.dailyCount': options.limitEvidence['limitConfig.dailyCount'] ?? [],
    'limitConfig.monthlyCount': options.limitEvidence['limitConfig.monthlyCount'] ?? [],
    'limitConfig.yearlyCount': options.limitEvidence['limitConfig.yearlyCount'] ?? [],
    'limitConfig.dailyAmount': [options.dailyCapLine].filter(Boolean) as string[],
    'limitConfig.monthlyAmount': [options.monthlyCapLine].filter(Boolean) as string[],
});

export function parseSktMembershipHtml(
    html: string,
    sourceUrl: string,
    detailHtmlByBrandId: Readonly<Partial<Record<string, string>>> = {},
): ParsedPromotion[] {
    const offers: ParsedPromotion[] = [];
    const blockPattern = /<a([^>]*\bclass=['"][^'"]*\bbenefit-box\b[^'"]*['"][^>]*)>([\s\S]*?)<\/a>/gi;

    for (const blockMatch of html.matchAll(blockPattern)) {
        const attributes = blockMatch[1];
        const block = blockMatch[2];
        const officialBrandId = attributes.match(/\bdata-id=['"](\d+)['"]/i)?.[1];
        const brandName = htmlToText(
            block.match(/<span[^>]*class=['"]brand['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? ''
        );
        const resolvedBrand = resolveOfficialBrand(brandName);
        if (!resolvedBrand) continue;
        const brandId = resolvedBrand.id;
        const detailHtml = detailHtmlByBrandId[officialBrandId ?? ''] ??
            detailHtmlByBrandId[brandId] ?? '';
        const detailText = extractSktDetailText(detailHtml);
        const detailUrl = officialBrandId
            ? new URL(`detail.do?brandId=${officialBrandId}`, sourceUrl).toString()
            : sourceUrl;
        const detailEvidence = relevantDetailEvidence(detailText);
        const baseExpectedFields = sktExpectedFields(detailText);
        const minSpendLine = detailLines(detailText).find(line => (
            /[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*이상/.test(line)
        ));
        const paymentInstrumentRequired = /모바일\s*카드[^\n]{0,80}플라스틱\s*카드|플라스틱\s*카드[^\n]{0,80}모바일\s*카드/i.test(detailText);
        const storeEligibilityRequired = /일부\s*(?:특수\s*)?매장|제외\s*매장|매장[^\n]{0,40}(?:제외|불가)/.test(detailText);
        const detailTextLines = detailLines(detailText);
        const paymentInstrumentLine = detailTextLines.find(line => (
            /모바일\s*카드[^\n]{0,80}플라스틱\s*카드|플라스틱\s*카드[^\n]{0,80}모바일\s*카드/i.test(line)
        ));
        const storeEligibilityLine = detailTextLines.find(line => (
            /일부\s*(?:특수\s*)?매장|제외\s*매장|매장[^\n]{0,40}(?:제외|불가)/.test(line)
        ));

        const sections = [...block.matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/gi)]
            .reduce<Array<{
                section: string;
                membershipMode: TelecomMembershipMode;
            }>>((result, match) => {
                const section = match[1];
                const label = htmlToText(
                    section.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i)?.[1] ?? ''
                );
                if (label.includes('할인형')) {
                    result.push({ section, membershipMode: 'DISCOUNT' });
                }
                if (label.includes('적립형')) {
                    result.push({ section, membershipMode: 'POINTS' });
                }
                return result;
            }, []);

        for (const { section, membershipMode } of sections) {
            const seenTierGroups = new Map<string, number>();
            for (const infoMatch of section.matchAll(
                /<div[^>]*class=['"]info['"][^>]*>([\s\S]*?)<\/div>/gi
            )) {
                const info = infoMatch[1];
                const description = htmlToText(info);
                if (/포인트\s*사용/.test(description)) continue;
                const parsed = parseAction(description);
                if (!parsed) continue;
                if (membershipMode === 'DISCOUNT' && parsed.reward) continue;
                const tiers = tierClasses(info);
                const tierKey = tiers.slice().sort().join('-') || 'ALL';
                const variant = seenTierGroups.get(tierKey) ?? 0;
                seenTierGroups.set(tierKey, variant + 1);
                const combinedBenefitText = `${description}\n${detailText}`;
                const dailyCap = benefitCapEvidence(
                    combinedBenefitText,
                    membershipMode,
                    tiers,
                    'daily',
                );
                const monthlyCap = benefitCapEvidence(
                    combinedBenefitText,
                    membershipMode,
                    tiers,
                    'monthly',
                );
                const transactionCap = transactionBenefitCapEvidence(
                    combinedBenefitText,
                    membershipMode,
                    tiers,
                );
                const fixedCap = parentheticalBenefitCap(description);
                const purchaseCap = parsePurchaseCap(detailText);
                const parsedLimits = parseSktLimitConfig(combinedBenefitText);
                const minSpend = parseMinSpend(detailText) ?? (
                    parsed.action.unitAmount ? parsed.action.unitAmount : undefined
                );
                const itemScope = inferSktScope(description, detailText);
                const mixedBenefit = parsed.ambiguous ||
                    parsed.action.valueSemantics === 'UP_TO' ||
                    /무료|1\s*\+\s*1|동반|짝수\s*월|홀수\s*월|구매한도[^\n]*유의|상시\s*최대|제주[^\n]*내륙/.test(description) ||
                    ['emart', 'cgv', 'elevenst'].includes(brandId);
                const requiredInputs: PromotionRequiredInput[] = unique([
                    ...(itemScope.scope === 'PRODUCT_SET'
                        ? ['ELIGIBLE_ITEM_AMOUNT' as const]
                        : []),
                    ...(paymentInstrumentRequired
                        ? ['PAYMENT_INSTRUMENT' as const]
                        : []),
                    ...(storeEligibilityRequired
                        ? ['STORE_ELIGIBILITY' as const]
                        : []),
                ]);
                const calculationMode = mixedBenefit
                    ? 'INFORMATION_ONLY' as const
                    : requiredInputs.length > 0
                        ? 'CONDITIONAL' as const
                        : 'CALCULABLE' as const;
                const limitConfig: LimitConfig = mixedBenefit ? {} : {
                    ...parsedLimits.limitConfig,
                    ...(dailyCap && { dailyAmount: dailyCap.amount }),
                    ...(monthlyCap && { monthlyAmount: monthlyCap.amount }),
                };
                const sharedFields = [
                    'dailyCount',
                    'dailyAmount',
                    'monthlyCount',
                    'monthlyAmount',
                    'yearlyCount',
                ].filter(key => limitConfig[key as keyof LimitConfig] !== undefined) as
                    NonNullable<LimitConfig['sharedFields']>;
                const effectiveLimitConfig: LimitConfig = sharedFields.length > 0
                    ? { ...limitConfig, sharedFields }
                    : limitConfig;
                const maxBenefit = fixedCap ?? dailyCap?.amount ?? transactionCap?.amount ?? (
                    purchaseCap && parsed.action.type === 'PERCENT'
                        ? Math.floor(purchaseCap * (parsed.action.value / 100))
                        : undefined
                );
                const channelResult = inferSktChannels(detailText);
                const channels = channelResult.channels;
                const scopeLine = itemScope.evidence;
                const requiredInputLines = [
                    ...(itemScope.scope === 'PRODUCT_SET' ? [itemScope.evidence] : []),
                    ...(paymentInstrumentLine ? [paymentInstrumentLine] : []),
                    ...(storeEligibilityLine ? [storeEligibilityLine] : []),
                ];
                const maxBenefitLines = [
                    ...(fixedCap ? [description] : []),
                    ...(dailyCap ? [dailyCap.line] : []),
                    ...(transactionCap ? [transactionCap.line] : []),
                    ...(purchaseCap ? [description] : []),
                ];
                const expectedFields = [
                    ...baseExpectedFields,
                    ...(maxBenefitLines[0] ? [{
                        path: 'action.maxBenefit',
                        evidence: maxBenefitLines[0],
                    }] : []),
                ];
                const fieldEvidence = sktFieldEvidence(description, {
                    dailyCapLine: dailyCap?.line,
                    monthlyCapLine: monthlyCap?.line,
                    minSpendLine,
                    scopeLine,
                    channelLines: channelResult.evidence,
                    requiredInputLines,
                    limitEvidence: parsedLimits.evidence,
                    maxBenefitLines,
                });
                const conditionNote = mixedBenefit
                    ? '복수 혜택·요율은 공식 상세에서 선택해 확인해야 합니다.'
                    : itemScope.scope === 'PRODUCT_SET' && storeEligibilityRequired
                        ? '혜택 대상 상품 금액과 이용 매장을 확인해야 합니다.'
                        : itemScope.scope === 'PRODUCT_SET'
                            ? '혜택 대상 상품 금액을 확인해야 합니다.'
                            : storeEligibilityRequired
                                ? '이용 매장이 공식 혜택 대상인지 확인해야 합니다.'
                                : paymentInstrumentRequired
                                    ? '모바일카드·플라스틱카드 종류를 확인해야 합니다.'
                                    : undefined;
                const result = buildTelecomOffer({
                    providerId: 'skt',
                    brandId,
                    brandName,
                    tiers,
                    membershipMode,
                    usageGroupId: `telecom:skt:brand:${brandId}`,
                    description,
                    evidence: [description, ...detailEvidence].join('\n'),
                    sourceUrl: detailUrl,
                    channels,
                    action: mixedBenefit
                        ? { ...parsed.action, valueSemantics: 'UP_TO' }
                        : parsed.action,
                    ...(maxBenefit && !mixedBenefit && { maxBenefit }),
                    ...(minSpend && !mixedBenefit && { minSpend }),
                    limitConfig: effectiveLimitConfig,
                    discoveredBrand: resolvedBrand.discoveredBrand,
                    autoPublish: false,
                    reviewOnly: true,
                    manualCheckRequired: false,
                    applicabilityScope: itemScope.scope,
                    calculationMode,
                    eligibleItemSummary: itemScope.eligibleItemSummary,
                    requiredInputs,
                    requiredNote: conditionNote,
                    itemSpecific: itemScope.scope === 'PRODUCT_SET',
                    semanticScopeLocked: true,
                    fieldEvidence,
                    expectedFields,
                    ...(detailHtml && { requiredEvidenceSourceUrl: detailUrl }),
                    warnings: [
                        'SKT 상세 혜택은 신규·변경 모두 사람 검수 후 게시',
                        ...(mixedBenefit ? ['복수 혜택·요율은 계산에서 제외'] : []),
                    ],
                });
                result.sourceKey = telecomSourceKey(
                    brandId,
                    tiers,
                    variant,
                    membershipMode,
                );
                offers.push(result);
            }
        }
    }

    return offers;
}

const findRateAfter = (text: string, pattern: RegExp) => {
    const match = text.match(pattern);
    if (!match) return undefined;
    const parsed = parseAction(match[0]);
    return parsed?.action.type === 'PERCENT' ? parsed.action.value : undefined;
};

export function parseParisMembershipHtml(
    html: string,
    providerId: 'skt' | 'kt',
    sourceUrl: string,
): ParsedPromotion[] {
    const text = htmlToText(html);
    const configs = providerId === 'kt'
        ? [
            {
                tiers: ['VVIP', 'VIP', 'GOLD'],
                pattern: /VVIP\s*\/\s*VIP\s*\/\s*GOLD[\s\S]{0,80}?1,?000\s*원당\s*\d+\s*원/iu,
            },
            {
                tiers: ['SILVER', 'WHITE', '일반'],
                pattern: /SILVER\s*\/\s*WHITE\s*일반[\s\S]{0,80}?1,?000\s*원당\s*\d+\s*원/iu,
            },
        ]
        : [
            {
                tiers: ['VIP', 'GOLD'],
                pattern: /모바일카드\s*VIP\s*\/\s*GOLD[\s\S]{0,80}?1,?000\s*원당\s*\d+\s*원/iu,
            },
            {
                tiers: ['SILVER'],
                pattern: /모바일카드\s*SILVER[\s\S]{0,100}?1,?000\s*원당\s*\d+\s*원/iu,
            },
        ];

    return configs.flatMap(config => {
        const sourceExcerpt = text.match(config.pattern)?.[0];
        const rate = sourceExcerpt ? findRateAfter(sourceExcerpt, config.pattern) : undefined;
        if (!rate) return [];
        const maxBenefit = Math.floor(200_000 * (rate / 100));
        return [buildTelecomOffer({
            providerId,
            brandId: 'paris_baguette',
            brandName: '파리바게뜨',
            tiers: config.tiers,
            description: `${config.tiers.join('/')} 1,000원당 ${rate * 10}원 할인 · 1일 1회 · 이용금액 20만원 한도`,
            evidence: sourceExcerpt,
            sourceUrl,
            action: { type: 'PERCENT', value: rate },
            maxBenefit,
            limitConfig: { dailyCount: 1 },
            autoPublish: true,
        })];
    });
}

const tljProvider = (name: string) => {
    if (/^T\s*멤버십$/i.test(name)) return 'skt';
    if (/KT\s*멤버십/i.test(name)) return 'kt';
    if (/LG\s*U\+/i.test(name)) return 'lguplus';
    return undefined;
};

export function parseTousLesJoursHtml(html: string, sourceUrl: string): ParsedPromotion[] {
    const offers: ParsedPromotion[] = [];
    const activeHtml = html.replace(/<!--([\s\S]*?)-->/g, ' ');
    const pattern = /<span[^>]*class=['"]card_name['"][^>]*>([\s\S]*?)<\/span>\s*<span[^>]*class=['"]card_txt['"][^>]*>([\s\S]*?)<\/span>[\s\S]*?<div[^>]*class=['"]card_info2?['"][^>]*>([\s\S]*?)<\/div>/gi;

    for (const match of activeHtml.matchAll(pattern)) {
        const providerId = tljProvider(htmlToText(match[1]));
        if (!providerId) continue;
        const detailHtml = match[2];
        const limitsText = htmlToText(match[3]);
        const dailyLimit = parseLimitConfig(limitsText);
        const purchaseCap = parsePurchaseCap(limitsText);
        const monthlyPurchaseCap = parseMonthlyPurchaseCap(limitsText);
        const lines = detailHtml.split(/<br\s*\/?\s*>/gi)
            .map(line => htmlToText(line))
            .filter(Boolean)
            .filter(line => !/적립형|적립/.test(line));
        const seenTierGroups = new Map<string, number>();

        lines.forEach(line => {
            const description = /할인/.test(line) ? line : `${line} 할인`;
            const parsed = parseAction(description);
            if (!parsed || parsed.reward) return;
            const tiers = parseTiersFromText(description);
            const tierKey = tiers.slice().sort().join('-') || 'ALL';
            const variant = seenTierGroups.get(tierKey) ?? 0;
            seenTierGroups.set(tierKey, variant + 1);
            const result = buildTelecomOffer({
                providerId,
                brandId: 'tous_les_jours',
                brandName: '뚜레쥬르',
                tiers,
                description: `${description} · ${limitsText}`,
                evidence: `${line}\n${limitsText}`,
                sourceUrl,
                action: parsed.action,
                ...(purchaseCap && parsed.action.type === 'PERCENT' && {
                    maxBenefit: Math.floor(purchaseCap * (parsed.action.value / 100)),
                }),
                limitConfig: {
                    ...dailyLimit,
                    ...(monthlyPurchaseCap && parsed.action.type === 'PERCENT' && {
                        monthlyAmount: Math.floor(
                            monthlyPurchaseCap * (parsed.action.value / 100)
                        ),
                    }),
                },
                autoPublish: !parsed.ambiguous,
                manualCheckRequired: parsed.ambiguous,
            });
            result.sourceKey = telecomSourceKey('tous_les_jours', tiers, variant);
            offers.push(result);
        });
    }

    return offers;
}

type LguplusBenefit = {
    urcMbspJncoNo?: number;
    urcMbspJncoNm?: string;
    jncoBnftThumCntn?: string;
    jncoBnftDetlCntn?: string;
    urcBnftTadvMthdCntn?: string;
    jncoTadvGrdDetlDscr?: string;
    urcMbspCatgNm?: string;
};

export function parseLguplusBenefits(
    rows: LguplusBenefit[],
    sourceUrl: string,
): ParsedPromotion[] {
    return rows.flatMap(row => {
        const brandName = row.urcMbspJncoNm?.trim() ?? '';
        const resolvedBrand = resolveOfficialBrand(brandName, row.urcMbspCatgNm);
        if (!resolvedBrand) return [];
        const brandId = resolvedBrand.id;
        const benefitText = htmlToText(row.jncoBnftThumCntn ?? '');
        const detailText = htmlToText(
            `${row.jncoBnftDetlCntn ?? ''}\n${row.urcBnftTadvMthdCntn ?? ''}`
        );
        const defaultTiers = parseTiersFromText(row.jncoTadvGrdDetlDscr ?? '');
        const limits = parseLimitConfig(`${benefitText}\n${detailText}`);
        const purchaseCap = parsePurchaseCap(detailText);
        const lines = benefitText.split('\n').map(line => line.trim()).filter(Boolean);
        const seenTierGroups = new Map<string, number>();

        return lines.flatMap(rawLine => splitTierBenefitLine(rawLine).flatMap(line => {
            const parsed = parseAction(line);
            if (!parsed || parsed.reward) return [];
            const tiers = parseTiersFromText(line);
            const effectiveTiers = tiers.length > 0 ? tiers : defaultTiers;
            const maxBenefit = parseMaxBenefit(line);
            const informational = parsed.action.valueSemantics === 'UP_TO';
            const mixedValueKinds = parsed.action.type === 'PERCENT' &&
                /\d+(?:\.\d+)?\s*%/.test(line) &&
                /(?:[①②③④⑤]|[+&]|및|외)[^\n]{0,50}(?:[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*(?:할인|적립|캐시백|혜택)/.test(line);
            const sharedFlatVariants = /(?:[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)[^()\n]{0,50}(?:\/|,|소인|기존\s*회원|국제선|정기\s*서비스)[^()\n]{0,50}(?:[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*(?:할인|적립|캐시백|혜택)/.test(line);
            const complex = !informational && (parsed.ambiguous || mixedValueKinds ||
                sharedFlatVariants || /증정|택\s*1|1\s*\+\s*1|외\s*정비\s*혜택/.test(line)
            );
            const minSpend = parseMinSpend(`${line}\n${detailText}`);
            const tierKey = effectiveTiers.slice().sort().join('-') || 'ALL';
            const variant = seenTierGroups.get(tierKey) ?? 0;
            seenTierGroups.set(tierKey, variant + 1);
            const sharedDescription = `${line} · ${detailText}`.slice(0, 2000);
            const baseOptions = {
                providerId: 'lguplus',
                brandId,
                brandName,
                tiers: effectiveTiers,
                sourceUrl,
                discoveredBrand: resolvedBrand.discoveredBrand,
                limitConfig: limits,
            };
            const numberedBenefits = [...detailText.matchAll(
                /[①②③④⑤⑥⑦⑧⑨⑩]\s*([^\n]+)/g
            )].map(match => match[1].trim()).filter(Boolean);
            if (numberedBenefits.length >= 2) {
                return numberedBenefits.flatMap((benefit, benefitIndex) => {
                    const benefitAction = parseAction(benefit);
                    if (!benefitAction || benefitAction.reward) return [];
                    const result = buildTelecomOffer({
                        ...baseOptions,
                        description: `${benefit} · ${detailText}`.slice(0, 2000),
                        action: benefitAction.ambiguous
                            ? { ...benefitAction.action, valueSemantics: 'UP_TO' }
                            : benefitAction.action,
                        minSpend: parseMinSpend(benefit),
                        autoPublish: true,
                        itemSpecific: true,
                        warnings: benefitAction.ambiguous
                            ? ['복수 요율: 정확한 계산에서 제외하고 정보로 제공']
                            : [],
                    });
                    result.offer.title = `${brandName} ${benefit}`.slice(0, 300);
                    result.sourceKey = telecomSourceKey(
                        brandId,
                        effectiveTiers,
                        benefitIndex,
                    );
                    return [withTrustedConditionalScope(result, {
                        scope: 'PRODUCT_SET',
                        eligibleItemSummary: benefit,
                        requiredInputs: ['ELIGIBLE_ITEM_AMOUNT', 'TARGET_ELIGIBILITY'],
                        requiredNote: '대상 상품·서비스와 이용 자격을 확인해야 합니다.',
                    })];
                });
            }
            const memberAmounts = line.match(
                /신규\s*회원\s*((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+\s*원)[^\n]{0,30}기존\s*회원\s*((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+\s*원)\s*할인/
            );
            if (memberAmounts) {
                const variants = [
                    { label: '기존회원', amount: parseKoreanAmount(memberAmounts[2]) },
                    { label: '신규회원', amount: parseKoreanAmount(memberAmounts[1]) },
                ];
                return variants.flatMap((item, itemIndex) => {
                    if (!item.amount) return [];
                    const result = buildTelecomOffer({
                        ...baseOptions,
                        description: sharedDescription,
                        action: { type: 'FLAT', value: item.amount },
                        autoPublish: true,
                        itemSpecific: true,
                    });
                    result.offer.title = `${brandName} ${item.label} ${item.amount.toLocaleString('ko-KR')}원 할인`;
                    result.sourceKey = telecomSourceKey(
                        brandId,
                        effectiveTiers,
                        variant + itemIndex,
                    );
                    return [withTrustedConditionalScope(result, {
                        scope: 'PRODUCT_SET',
                        eligibleItemSummary: `${item.label} 대상 자란다 서비스 결제`,
                        requiredInputs: ['ELIGIBLE_ITEM_AMOUNT', 'TARGET_ELIGIBILITY'],
                        requiredNote: `${item.label} 여부와 쿠폰 적용 대상 서비스인지 확인해야 합니다.`,
                    })];
                });
            }
            const deliveryAmounts = line.match(
                /편도\s*((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+\s*원)\s*\/\s*왕복\s*((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+\s*원)\s*할인/
            );
            if (deliveryAmounts) {
                const variants = [
                    { label: '왕복 배송', amount: parseKoreanAmount(deliveryAmounts[2]) },
                    { label: '편도 배송', amount: parseKoreanAmount(deliveryAmounts[1]) },
                ];
                return variants.flatMap((item, itemIndex) => {
                    if (!item.amount) return [];
                    const result = buildTelecomOffer({
                        ...baseOptions,
                        description: sharedDescription,
                        action: { type: 'FLAT', value: item.amount },
                        autoPublish: true,
                        itemSpecific: true,
                    });
                    result.offer.title = `${brandName} 골프백 ${item.label} ${item.amount.toLocaleString('ko-KR')}원 할인`;
                    result.sourceKey = telecomSourceKey(
                        brandId,
                        effectiveTiers,
                        variant + itemIndex,
                    );
                    return [withTrustedConditionalScope(result, {
                        scope: 'PRODUCT_SET',
                        eligibleItemSummary: `골프백 ${item.label} 서비스`,
                        requiredInputs: ['ELIGIBLE_ITEM_AMOUNT', 'TARGET_ELIGIBILITY'],
                        requiredNote: `골프백 ${item.label}와 쿠폰 적용 조건을 확인해야 합니다.`,
                    })];
                });
            }
            const result = buildTelecomOffer({
                ...baseOptions,
                tiers: effectiveTiers,
                description: sharedDescription,
                action: parsed.action,
                ...(parsed.action.type === 'PERCENT' && {
                    ...(maxBenefit && { maxBenefit }),
                    ...(!maxBenefit && purchaseCap && {
                        maxBenefit: Math.floor(purchaseCap * (parsed.action.value / 100)),
                    }),
                }),
                minSpend,
                autoPublish: !complex,
                manualCheckRequired: complex,
                warnings: complex
                    ? ['복수 혜택 계산식은 검수 후 분리 필요']
                    : informational ? ['최대 혜택: 정보용으로 자동 게시'] : [],
            });
            result.sourceKey = telecomSourceKey(brandId, effectiveTiers, variant);
            return [result];
        }));
    });
}

type NaverPayPromotion = {
    promotionSeq?: number;
    promotionName?: string;
    promotionDescription?: string;
    exposeTitle?: string | null;
    acmRate?: number | null;
    acmAmount?: number | null;
    applyBasisAmount?: number | null;
    payMethodType?: string | null;
    detailUrl?: string;
    linkUrl?: string | null;
    promotionStartDateTime?: number;
    promotionEndDateTime?: number;
    cautionText?: string;
    limitAcmCount?: number | null;
    limitAcmAmount?: number | null;
    exceedBudgetYn?: boolean;
};

const parseAllMinSpends = (text: string) => unique([...text.matchAll(
    /([\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원)\s*이상/g
)].map(match => parseKoreanAmount(match[1])).filter(
    (value): value is number => value !== undefined
));

const hasTrustedNaverPayThresholdLink = (linkUrl?: string | null) => {
    if (!linkUrl) return false;
    try {
        const url = new URL(linkUrl);
        return (url.hostname === 'mkt.naver.com' &&
                url.pathname === '/event/mo/npay-tmoney_2608') ||
            (url.hostname === 'm.boribori.co.kr' && url.pathname === '/plan/367012');
    } catch {
        return false;
    }
};

const parseNaverPayFundingTypes = (row: NaverPayPromotion, text: string) => {
    const types: FundingType[] = [];
    const moneyAndPoints = /포인트[·/\s]*(?:와|및|\+)?[·/\s]*머니|머니[·/\s]*(?:와|및|\+)?[·/\s]*포인트/.test(text);
    const cardExcluded = /카드(?:\s*,\s*삼성페이)?\s*결제\s*시[^\n]{0,30}(?:불가|제외|미적용)|카드\s*결제[^\n]{0,20}(?:불가|제외|미적용)/.test(text);
    const cardIncluded = row.payMethodType === 'CARD' ||
        /(?:카드로|카드\s*QR|대상\s*카드|카드\s*대상|삼성카드\s*QR|Npay\s*(?:X|×|\*)\s*삼성페이)|카드[^\n]{0,50}결제\s*시/i.test(text);

    if (moneyAndPoints) {
        types.push('MONEY', 'POINTS');
    } else {
        if (/머니(?:로|\s*(?:QR\s*)?결제|\s*[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*이상\s*결제)|Npay\s*머니\s*우리\s*통장/.test(text)) {
            types.push('MONEY');
        }
        if (/포인트(?:로|\s*(?:QR\s*)?결제|\s*[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*이상\s*결제)/.test(text)) {
            types.push('POINTS');
        }
    }
    if (cardExcluded && types.length === 0) types.push('MONEY', 'POINTS');
    if (cardIncluded && !cardExcluded) types.push('CARD');

    return {
        types: unique(types),
        conflict: row.payMethodType === 'CARD' && cardExcluded,
    };
};

const requiresNaverPayEnrollment = (text: string) =>
    /쿠폰\s*(?:다운로드|받기)|(?:사전|별도)\s*(?:신청|응모)|(?:이벤트\s*)?(?:신청|응모)\s*(?:하기|필수|후|완료)|이벤트\s*참여\s*(?:하기|필수|후)|(?:앱|계정|서비스)\s*연동|자동납부\s*(?:신청|변경)/.test(text);

const naverChannels: Record<string, PromotionChannel[]> = {
    DOMESTIC_INSTORE: ['OFFLINE'],
    ONLINE: ['ONLINE'],
    OVERSEAS_QR: ['OFFLINE'],
    OTHERS: ['ALL'],
};

export function parseNaverPayPromotions(
    rows: NaverPayPromotion[],
    firstCategory: string,
    sourceUrl: string,
): ParsedPromotion[] {
    return rows.flatMap(row => {
        const promotionName = row.promotionName?.trim() ?? '';
        const resolvedBrand = resolveOfficialBrand(promotionName, firstCategory, false);
        const actionText = row.exposeTitle?.trim() ?? '';
        if (!resolvedBrand || !actionText || !row.promotionSeq) return [];
        const brandId = resolvedBrand.id;
        const text = [row.promotionDescription, actionText, row.cautionText]
            .filter(Boolean).join('\n');
        const classificationText = [promotionName, text].filter(Boolean).join('\n');
        const valueSemantics = /최대\s*\d+(?:\.\d+)?\s*%/.test(actionText) ||
            /^최대\s*[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원/.test(actionText)
            ? 'UP_TO' as const
            : undefined;
        const guaranteedCouponAmount = actionText.match(
            /((?:[\d,]+(?:\.\d+)?\s*(?:만|천)\s*)+원|[\d,]+(?:\.\d+)?\s*원)\s*[^\n]{0,30}100\s*%\s*지급/
        );
        const parsed = guaranteedCouponAmount
            ? {
                action: {
                    type: 'FLAT',
                    value: parseKoreanAmount(guaranteedCouponAmount[1])!,
                },
                reward: true,
                ambiguous: false,
            } satisfies ParsedAction
            : row.acmRate
            ? {
                action: {
                    type: /적립/.test(text) ? 'POINTS' : 'PERCENT',
                    value: row.acmRate,
                    ...(valueSemantics && { valueSemantics }),
                },
                reward: /적립/.test(text),
                ambiguous: false,
            } satisfies ParsedAction
            : row.acmAmount
                ? {
                    action: {
                        type: 'FLAT',
                        value: row.acmAmount,
                        ...(valueSemantics && { valueSemantics }),
                    },
                    reward: /적립/.test(text),
                    ambiguous: false,
                } satisfies ParsedAction
                : parseAction(actionText);
        if (!parsed) return [];

        const promotionMinSpend = parseMinSpend(row.promotionDescription ?? '');
        const cautionMinSpends = parseAllMinSpends(row.cautionText ?? '');
        const textMinSpend = parseMinSpend(text);
        const minSpendConflict = row.applyBasisAmount !== undefined &&
            row.applyBasisAmount !== null &&
            textMinSpend !== undefined &&
            row.applyBasisAmount !== textMinSpend;
        const requiresEnrollment = requiresNaverPayEnrollment(classificationText);
        const maxBenefit = row.limitAcmAmount ?? parseMaxBenefit(text);
        const funding = parseNaverPayFundingTypes(row, classificationText);
        const accountOrCardSpecific = /Npay\s*머니\s*우리\s*통장|통장으로[^\n]{0,30}결제|등록된[^\n]{0,40}(?:체크[·\s]*신용)?카드\s*대상|대상\s*카드|(?:삼성|현대|신한|롯데|우리|제주)(?:은행)?\s*(?:제휴)?카드|카드\s*QR/.test(classificationText);
        const chanceBased = /추첨|랜덤|꽝\s*없는|당첨/.test(text);
        const availabilityLimited = /선착순|예산\s*소진/.test(text) ||
            row.exceedBudgetYn === true;
        const cumulative = /누적/.test(text);
        const fulfillmentRequired = /배송\s*(?:및|·|\/)\s*설치\s*완료/.test(text);
        const tieredAmount = /결제금액\s*구간|\d+(?:\.\d+)?\s*(?:만|천)?\s*원?\s*\/\s*\d+(?:\.\d+)?\s*(?:만|천)?\s*원\s*이상/.test(text);
        const mixedBenefit = /할인[^\n]{0,50}(?:&|및|·)[^\n]{0,50}적립|적립[^\n]{0,50}(?:&|및|·)[^\n]{0,50}할인/.test(text);
        const mixedFlatAndPercent = /[\d,]+(?:\.\d+)?\s*(?:만|천)?\s*원\s*\+\s*\d+(?:\.\d+)?\s*%/.test(actionText);
        const auxiliaryComposite = /택스\s*리펀|세금\s*환급|음료\s*제공/.test(text) &&
            parsed.action.type === 'PERCENT';
        const compositeBenefit = parsed.ambiguous || /증정|카드사별/.test(text) ||
            mixedBenefit || (tieredAmount && valueSemantics !== 'UP_TO');
        const informationOnly = valueSemantics === 'UP_TO' || chanceBased ||
            mixedFlatAndPercent || auxiliaryComposite;
        const tieredMaximumThreshold = valueSemantics === 'UP_TO' && tieredAmount;
        const textThresholdSupported = !minSpendConflict || tieredMaximumThreshold ||
            (promotionMinSpend !== undefined && cautionMinSpends.length === 1 &&
                cautionMinSpends[0] === promotionMinSpend) ||
            (promotionMinSpend !== undefined && hasTrustedNaverPayThresholdLink(row.linkUrl)) ||
            (promotionMinSpend === undefined && cautionMinSpends.length === 1);
        const minSpend = minSpendConflict && textThresholdSupported
            ? promotionMinSpend ?? cautionMinSpends[0] ?? textMinSpend
            : row.applyBasisAmount ?? textMinSpend;
        const firstPaymentOnly = /첫\s*(?:충전|결제|구매)/.test(classificationText);
        const userConfirmationRequired = !informationOnly && (
            availabilityLimited || cumulative || fulfillmentRequired ||
            accountOrCardSpecific || requiresEnrollment || firstPaymentOnly
        );
        const blockingReview = (!informationOnly && compositeBenefit) ||
            (minSpendConflict && !textThresholdSupported) || funding.conflict;
        const reward = parsed.reward || /적립|캐시백/.test(actionText);
        const detailUrl = row.detailUrl || row.linkUrl || sourceUrl;
        const restrictedScope =
            /(?:대상|특정|해당|행사)\s*(?:상품|품목|메뉴|제품|모델)|(?:상품|품목|메뉴|제품|모델)\s*(?:한정|전용)/.test(classificationText) ||
            /(?:와인|샴페인|위스키|주류|뷰티|화장품|가전|식품|의류|국내\s*렌(?:트|터)카)/.test(classificationText);
        const compositeInformationScopeLocked = informationOnly &&
            (mixedFlatAndPercent || auxiliaryComposite) &&
            !restrictedScope;
        const storeWideScopeLocked = promotionMinSpend !== undefined &&
            !availabilityLimited && !chanceBased && !firstPaymentOnly &&
            !restrictedScope && !/(?:제외|미적용|불가)/.test(classificationText);
        const semanticScopeLocked = storeWideScopeLocked || compositeInformationScopeLocked;
        const warnings = unique([
            ...(informationOnly && (mixedFlatAndPercent || auxiliaryComposite)
                ? ['복수 혜택: 정확한 계산에서 제외하고 정보로 제공']
                : compositeBenefit ? ['복수 혜택·구간별 계산식은 검수 후 분리 필요'] : []),
            ...(minSpendConflict && textThresholdSupported
                ? ['API 기준금액 대신 공식 사용자 노출 문구를 적용']
                : minSpendConflict ? ['API 기준금액과 표시 문구가 달라 검수 필요'] : []),
            ...(funding.conflict ? ['API 결제수단과 제외 문구가 충돌하여 검수 필요'] : []),
            ...(chanceBased
                ? [minSpendConflict && !textThresholdSupported
                    ? '추첨형 혜택이지만 기준금액 충돌로 검수 필요'
                    : '추첨형 혜택: 정보용으로 자동 게시']
                : []),
            ...(availabilityLimited ? ['선착순·예산 소진 여부를 결제 전에 확인'] : []),
            ...(accountOrCardSpecific ? ['특정 통장·카드 보유 여부를 사용자가 확인'] : []),
        ]);

        return [{
            sourceKey: `promotion:${row.promotionSeq}`,
            evidence: text,
            autoPublish: !blockingReview,
            warnings,
            ...(semanticScopeLocked && { semanticScopeLocked: true }),
            ...(resolvedBrand.discoveredBrand && {
                discoveredBrand: resolvedBrand.discoveredBrand,
            }),
            offer: {
                providerId: 'naverpay',
                layer: reward ? 'POST_REWARD' : 'PAY',
                title: `${promotionName} ${actionText}`.slice(0, 300),
                description: text.slice(0, 2000),
                brandIds: [brandId],
                categoryIds: [],
                channels: naverChannels[firstCategory] ?? ['ALL'],
                ...(row.promotionStartDateTime && {
                    startsAt: new Date(row.promotionStartDateTime).toISOString(),
                }),
                ...(row.promotionEndDateTime && {
                    endsAt: new Date(row.promotionEndDateTime).toISOString(),
                }),
                action: {
                    ...parsed.action,
                    ...(maxBenefit && { maxBenefit }),
                },
                condition: {
                    amountBasis: 'REMAINING_AMOUNT',
                    ...(semanticScopeLocked && { applicabilityScope: 'STORE_WIDE' as const }),
                    calculationMode: informationOnly
                        ? 'INFORMATION_ONLY'
                        : userConfirmationRequired ? 'CONDITIONAL' : 'CALCULABLE',
                    ...(minSpend && { minSpend }),
                    requiresEnrollment,
                    firstPaymentOnly,
                    confirmationRequired: userConfirmationRequired,
                    manualCheckRequired: blockingReview,
                    requiredInputs: unique([
                        ...(accountOrCardSpecific ? ['PAYMENT_INSTRUMENT' as const] : []),
                        ...(compositeInformationScopeLocked
                            ? ['STORE_ELIGIBILITY' as const]
                            : []),
                        ...(availabilityLimited || cumulative || fulfillmentRequired
                            ? ['TARGET_ELIGIBILITY' as const]
                            : []),
                        ...(firstPaymentOnly ? ['TARGET_ELIGIBILITY' as const] : []),
                    ]),
                    ...(informationOnly ? {
                        requiredNote: chanceBased
                            ? '추첨형 혜택이며 최대 할인 계산에서는 제외됩니다.'
                            : mixedFlatAndPercent || auxiliaryComposite
                                ? '여러 혜택과 별도 조건이 함께 있어 정보로만 제공합니다.'
                            : '최대 혜택 정보이며 정확한 할인 계산에서는 제외됩니다.',
                    } : userConfirmationRequired ? {
                        requiredNote: accountOrCardSpecific
                            ? '대상 통장·카드와 행사 조건을 충족하는지 확인해야 합니다.'
                            : '선착순·누적·지급 조건을 충족하는지 확인해야 합니다.',
                    } : blockingReview ? {
                        requiredNote: '복수 혜택 계산식 또는 원문 값 충돌을 확인해야 합니다.',
                    } : {}),
                },
                compatibility: {
                    requiredPayProviderIds: ['naverpay'],
                    allowedFundingTypes: funding.types,
                    exclusiveGroup: `naverpay:${row.promotionSeq}`,
                },
                limitConfig: {
                    ...(row.limitAcmCount && { monthlyCount: row.limitAcmCount }),
                },
                certainty: informationOnly || blockingReview
                    ? 'CONDITIONAL'
                    : 'CONFIRMED',
                sourceUrl: detailUrl,
            },
        }];
    });
}
