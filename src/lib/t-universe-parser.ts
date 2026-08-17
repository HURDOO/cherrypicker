import { createHash } from 'node:crypto';
import type { LimitConfig, PromotionChannel } from '@/types';
import { htmlToText, type ParsedPromotion } from './promotion-parsers';

export const T_UNIVERSE_PROVIDER_ID = 't-universe';

export type ParsedSubscriptionProduct = {
    providerId: string;
    name: string;
    aliases: string[];
    benefitSummary: string;
    sourceUrl: string;
    sourceKey: string;
    evidence: string;
};

export type ParsedTUniverseCollection = {
    products: ParsedSubscriptionProduct[];
    promotions: ParsedPromotion[];
};

type DiscountDetail = {
    brandId: string;
    brandName: string;
    evidence: string;
    sourceUrl: string;
    percentage: number;
    maxBenefit?: number;
    limitConfig: LimitConfig;
    channels: PromotionChannel[];
    itemSummary?: string;
};

const unique = <T,>(values: T[]) => [...new Set(values)];
const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();
const normalizeProductName = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·&＋+/_-]+/g, '');

const sourceKeyForProduct = (name: string) => `product-${createHash('sha256')
    .update(normalizeProductName(name))
    .digest('hex')
    .slice(0, 24)}`;

export function createTUniverseProductAliases(name: string) {
    const aliases = [
        name.replace(/^T\s+우주/, 'T우주'),
        name.replace(/^T\s+우주패스/, 'T우주패스'),
    ];
    const big = name.match(/^T\s*우주\s*Big\s*([3-6])$/i);
    if (big) {
        const number = big[1];
        aliases.push(
            `T우주 Big ${number}`,
            `T 우주 Big${number}`,
            `T우주 Big${number}`,
            `Big ${number}`,
            `Big${number}`,
        );
    }
    if (normalizeProductName(name) === normalizeProductName('T 우주패스 편의점&카페')) {
        aliases.push(
            'T우주패스 편의점&카페',
            'T 우주패스 편의점 카페',
            'T우주패스 편의점 카페',
            '우주패스 편의점&카페',
            '편의점&카페',
            '편의점 카페',
        );
    }
    if (normalizeProductName(name) === normalizeProductName('CU 할인')) {
        aliases.push(
            'CU 할인 멤버십',
            'T 우주패스 플러스 CU 할인',
            'T우주패스 플러스 CU 할인',
            'T 우주 CU 할인',
            'T우주 CU 할인',
        );
    }
    if (normalizeProductName(name) === normalizeProductName('T 우주패스 쇼핑 11번가')) {
        aliases.push('T우주패스 쇼핑 11번가', '우주패스 쇼핑 11번가', '쇼핑 11번가');
    }
    if (normalizeProductName(name) ===
        normalizeProductName('T 우주패스 올리브영&스타벅스&이마트24')) {
        aliases.push(
            'T우주패스 올리브영&스타벅스&이마트24',
            '올리브영&스타벅스&이마트24',
            '올리브영 스타벅스 이마트24',
        );
    }
    return unique(aliases.map(cleanText).filter(alias => alias && alias !== name));
}

const makeProduct = (
    name: string,
    benefitSummary: string,
    sourceUrl: string,
    evidence: string,
): ParsedSubscriptionProduct => ({
    providerId: T_UNIVERSE_PROVIDER_ID,
    name,
    aliases: createTUniverseProductAliases(name),
    benefitSummary: cleanText(benefitSummary).slice(0, 2_000),
    sourceUrl,
    sourceKey: sourceKeyForProduct(name),
    evidence: cleanText(evidence).slice(0, 8_000),
});

const extractParagraphs = (html: string) => {
    const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
        .map(match => cleanText(htmlToText(match[1])))
        .filter(Boolean);
    return paragraphs.length > 0
        ? paragraphs
        : htmlToText(html).split('\n').map(cleanText).filter(Boolean);
};

function parseBigProducts(html: string, sourceUrl: string) {
    const products = new Map<string, ParsedSubscriptionProduct>();
    for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
            .map(match => cleanText(htmlToText(match[1])));
        if (cells.length < 4) continue;
        const nameMatch = cells[1].match(/^T\s*우주\s*Big\s*([3-6])$/i);
        if (!nameMatch) continue;
        const name = `T 우주 Big ${nameMatch[1]}`;
        const product = makeProduct(name, cells[3], sourceUrl, cells.join(' | '));
        const existing = products.get(normalizeProductName(name));
        if (!existing || existing.benefitSummary.length < product.benefitSummary.length) {
            products.set(normalizeProductName(name), product);
        }
    }
    return [...products.values()];
}

function parseDailyPassProducts(html: string, sourceUrl: string) {
    const paragraphs = extractParagraphs(html);
    const convenience = paragraphs.find(paragraph =>
        paragraph.includes('T 우주패스 편의점&카페') && paragraph.includes('세븐일레븐')
    );
    const shopping = paragraphs.find(paragraph =>
        paragraph.includes('T 우주패스 쇼핑 11번가') && paragraph.includes('5천 원 쿠폰')
    );
    const cu = paragraphs.find(paragraph =>
        paragraph.includes('CU 할인') && paragraph.includes('CU편의점')
    );
    if (!convenience || !shopping || !cu) {
        throw new Error('T우주 패스 상품명 또는 상세 한도 문구를 찾지 못했습니다.');
    }

    const convenienceStart = convenience.indexOf('세븐일레븐');
    const shoppingStart = shopping.indexOf('11번가 5천 원 쿠폰');
    const cuStart = cu.indexOf('CU편의점');
    return [
        makeProduct(
            'T 우주패스 편의점&카페',
            convenience.slice(convenienceStart),
            sourceUrl,
            convenience,
        ),
        makeProduct(
            'T 우주패스 쇼핑 11번가',
            shopping.slice(shoppingStart),
            sourceUrl,
            shopping,
        ),
        makeProduct('CU 할인', cu.slice(cuStart), sourceUrl, cu),
    ];
}

function parseOliveStarbucksProduct(html: string, sourceUrl: string) {
    const paragraphs = extractParagraphs(html);
    const intro = paragraphs.find(paragraph =>
        paragraph.includes('T 우주패스 올리브영&스타벅스&이마트24') &&
        paragraph.includes('월 9,900원')
    );
    const benefits = paragraphs.filter(paragraph =>
        paragraph.startsWith('또한, 올리브영') ||
        /^(?:올리브영|스타벅스|이마트\s*24)(?:은|는)/.test(paragraph)
    );
    const starbucks = benefits.find(paragraph => paragraph.startsWith('스타벅스는'));
    const emart24 = benefits.find(paragraph => /^이마트\s*24는/.test(paragraph));
    if (!intro || !starbucks || !emart24) {
        throw new Error('T우주 올리브영·스타벅스·이마트24 상세 한도 문구를 찾지 못했습니다.');
    }
    return makeProduct(
        'T 우주패스 올리브영&스타벅스&이마트24',
        benefits.join(' '),
        sourceUrl,
        [intro, ...benefits].join('\n'),
    );
}

const parseKoreanAmount = (value: string) => {
    const normalized = value.replace(/,/g, '').replace(/\s+/g, '').replace(/원/g, '');
    const man = normalized.match(/(\d+(?:\.\d+)?)만/);
    const thousand = normalized.match(/(\d+(?:\.\d+)?)천/);
    if (man || thousand) {
        return Math.round(
            Number(man?.[1] ?? 0) * 10_000 + Number(thousand?.[1] ?? 0) * 1_000
        );
    }
    const number = normalized.match(/\d+(?:\.\d+)?/);
    return number ? Math.round(Number(number[0])) : undefined;
};

const parsePercentage = (text: string) => {
    const perAmount = text.match(
        /([\d,.]+\s*(?:만|천)?\s*원?)\s*당\s*([\d,.]+\s*(?:만|천)?\s*원?)(?:을|를)?\s*(?:씩\s*)?할인/
    );
    if (perAmount) {
        const basis = parseKoreanAmount(perAmount[1]);
        const discount = parseKoreanAmount(perAmount[2]);
        if (basis && discount) return Math.round((discount / basis) * 10_000) / 100;
    }
    const percentage = text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:를\s*)?할인/);
    return percentage ? Number(percentage[1]) : undefined;
};

function parseDiscountDetail(
    brandId: string,
    brandName: string,
    evidence: string,
    sourceUrl: string,
    options: { channels?: PromotionChannel[]; itemSummary?: string } = {},
): DiscountDetail {
    const percentage = parsePercentage(evidence);
    if (!percentage) throw new Error(`${brandName} 할인율을 파싱하지 못했습니다.`);
    const maxBenefitText = evidence.match(
        /(?:1일\s*\d+\s*회|1회)\s*최대\s*([\d,.]+\s*(?:만|천)?\s*원)/
    )?.[1];
    const dailyAmountText = evidence.match(
        /(?:할인\s*금액은\s*)?일\s*([\d,.]+\s*(?:만|천)?\s*원)(?:\s*[,，]|\s*한도)/
    )?.[1];
    const monthlyAmountText = evidence.match(
        /월\s*(?:최대\s*)?([\d,.]+\s*(?:만|천)?\s*원)(?:까지|\s*한도)/
    )?.[1];
    const dailyCount = evidence.match(/1일\s*(\d+)\s*회/);
    const maxBenefit = maxBenefitText ? parseKoreanAmount(maxBenefitText) : undefined;
    const dailyAmount = dailyAmountText ? parseKoreanAmount(dailyAmountText) : undefined;
    const monthlyAmount = monthlyAmountText ? parseKoreanAmount(monthlyAmountText) : undefined;
    return {
        brandId,
        brandName,
        evidence: cleanText(evidence),
        sourceUrl,
        percentage,
        ...(maxBenefit !== undefined && { maxBenefit }),
        limitConfig: {
            ...(dailyCount && { dailyCount: Number(dailyCount[1]) }),
            ...(dailyAmount !== undefined && { dailyAmount }),
            ...(monthlyAmount !== undefined && { monthlyAmount }),
        },
        channels: options.channels ?? ['OFFLINE'],
        ...(options.itemSummary && { itemSummary: options.itemSummary }),
    };
}

function parseDetailedDiscounts(
    dailyPassHtml: string,
    dailyPassUrl: string,
    oliveHtml: string,
    oliveUrl: string,
) {
    const dailyParagraphs = extractParagraphs(dailyPassHtml);
    const convenience = dailyParagraphs.find(paragraph =>
        paragraph.includes('T 우주패스 편의점&카페') && paragraph.includes('세븐일레븐')
    );
    const cu = dailyParagraphs.find(paragraph =>
        paragraph.includes('CU 할인') && paragraph.includes('CU편의점')
    );
    const oliveParagraphs = extractParagraphs(oliveHtml);
    const starbucks = oliveParagraphs.find(paragraph => paragraph.startsWith('스타벅스는'));
    const emart24 = oliveParagraphs.find(paragraph => /^이마트\s*24는/.test(paragraph));
    if (!convenience || !cu || !starbucks || !emart24) {
        throw new Error('T우주 제휴처별 할인율 또는 한도 문구를 찾지 못했습니다.');
    }
    const twosomeIndex = convenience.indexOf('투썸플레이스');
    if (twosomeIndex < 0) throw new Error('투썸플레이스 상세 문구를 찾지 못했습니다.');
    const sevenEleven = convenience.slice(convenience.indexOf('세븐일레븐'), twosomeIndex);
    const twosome = convenience.slice(twosomeIndex);

    return [
        parseDiscountDetail('cu', 'CU', cu, dailyPassUrl),
        parseDiscountDetail('seveneleven', '세븐일레븐', sevenEleven, dailyPassUrl),
        parseDiscountDetail('twosome', '투썸플레이스', twosome, dailyPassUrl),
        parseDiscountDetail('starbucks', '스타벅스', starbucks, oliveUrl, {
            channels: ['ONLINE'],
            itemSummary: '사이렌오더 제조 음료',
        }),
        parseDiscountDetail('emart24', '이마트24', emart24, oliveUrl),
    ];
}

const brandPatterns: Record<string, RegExp> = {
    cu: /\bCU\b|CU편의점/i,
    seveneleven: /세븐일레븐/,
    twosome: /투썸플레이스/,
    starbucks: /스타벅스/,
    emart24: /이마트\s*24/,
    paris_baguette: /파리바게뜨|파리바게트/,
};

const matchNamesForBrand = (products: ParsedSubscriptionProduct[], brandId: string) => {
    const pattern = brandPatterns[brandId];
    if (!pattern) return [];
    return unique(products
        .filter(product => pattern.test(product.benefitSummary))
        .flatMap(product => [product.name, ...product.aliases]));
};

function toPromotion(
    detail: DiscountDetail,
    products: ParsedSubscriptionProduct[],
): ParsedPromotion {
    const requiredProducts = matchNamesForBrand(products, detail.brandId);
    if (requiredProducts.length === 0) {
        throw new Error(`${detail.brandName} 혜택에 연결할 T우주 상품을 찾지 못했습니다.`);
    }
    const itemSpecific = Boolean(detail.itemSummary);
    const productEvidence = products
        .filter(product => brandPatterns[detail.brandId]?.test(product.benefitSummary))
        .map(product => product.evidence);
    return {
        sourceKey: `t-universe-discount:${detail.brandId}:${detail.percentage}`,
        offer: {
            providerId: T_UNIVERSE_PROVIDER_ID,
            layer: 'DISCOUNT',
            title: `${detail.brandName} ${detail.percentage}% 할인`,
            description: detail.evidence,
            brandIds: [detail.brandId],
            categoryIds: [],
            channels: detail.channels,
            action: {
                type: 'PERCENT',
                value: detail.percentage,
                valueSemantics: 'EXACT',
                ...(detail.maxBenefit !== undefined && { maxBenefit: detail.maxBenefit }),
            },
            condition: {
                amountBasis: itemSpecific ? 'ELIGIBLE_ITEM_AMOUNT' : 'ORIGINAL_AMOUNT',
                applicabilityScope: itemSpecific ? 'PRODUCT_SET' : 'STORE_WIDE',
                calculationMode: 'CALCULABLE',
                headlineEligible: !itemSpecific,
                ...(detail.itemSummary && { eligibleItemSummary: detail.itemSummary }),
                requiredInputs: unique([
                    ...(itemSpecific ? ['ELIGIBLE_ITEM_AMOUNT' as const] : []),
                    'SUBSCRIPTION_PRODUCT' as const,
                ]),
                requiredSubscriptionProducts: requiredProducts,
                itemSpecific,
            },
            compatibility: {
                exclusiveGroup: `telecom:skt:${detail.brandId}`,
                allowStackWithSameLayer: false,
                blocksCardBenefit: false,
            },
            limitConfig: detail.limitConfig,
            certainty: 'CONFIRMED',
            sourceUrl: detail.sourceUrl,
        },
        evidence: unique([detail.evidence, ...productEvidence]).join('\n'),
        autoPublish: true,
        warnings: [],
    };
}

function parseParisInformationOffer(
    products: ParsedSubscriptionProduct[],
    bigGuideUrl: string,
): ParsedPromotion {
    const eligibleProducts = products.filter(product =>
        brandPatterns.paris_baguette.test(product.benefitSummary)
    );
    if (eligibleProducts.length === 0) {
        throw new Error('파리바게뜨 혜택에 연결할 T우주 Big 상품을 찾지 못했습니다.');
    }
    const evidence = eligibleProducts.map(product => product.evidence).join('\n');
    return {
        sourceKey: 't-universe-discount:paris_baguette:30:information',
        offer: {
            providerId: T_UNIVERSE_PROVIDER_ID,
            layer: 'DISCOUNT',
            title: '파리바게뜨 30% 할인',
            description: '파리바게뜨 구매 금액 1,000원당 300원 할인',
            brandIds: ['paris_baguette'],
            categoryIds: [],
            channels: ['OFFLINE'],
            action: { type: 'PERCENT', value: 30, valueSemantics: 'EXACT' },
            condition: {
                amountBasis: 'ORIGINAL_AMOUNT',
                applicabilityScope: 'STORE_WIDE',
                calculationMode: 'INFORMATION_ONLY',
                headlineEligible: false,
                requiredInputs: ['SUBSCRIPTION_PRODUCT'],
                requiredSubscriptionProducts: unique(eligibleProducts.flatMap(product => [
                    product.name,
                    ...product.aliases,
                ])),
                requiredNote: '공식 요약표에 건별·일·월 한도가 없어 계산에서는 제외됩니다.',
            },
            compatibility: {
                exclusiveGroup: 'telecom:skt:paris_baguette',
                allowStackWithSameLayer: false,
                blocksCardBenefit: false,
            },
            limitConfig: {},
            certainty: 'CONDITIONAL',
            sourceUrl: bigGuideUrl,
        },
        evidence,
        autoPublish: true,
        warnings: ['세부 한도 미확인: 정보만 게시'],
    };
}

export function parseTUniverseSources(input: {
    bigGuideHtml: string;
    bigGuideUrl: string;
    dailyPassHtml: string;
    dailyPassUrl: string;
    oliveStarbucksHtml: string;
    oliveStarbucksUrl: string;
}): ParsedTUniverseCollection {
    const products = [
        ...parseBigProducts(input.bigGuideHtml, input.bigGuideUrl),
        ...parseDailyPassProducts(input.dailyPassHtml, input.dailyPassUrl),
        parseOliveStarbucksProduct(input.oliveStarbucksHtml, input.oliveStarbucksUrl),
    ];
    const productMap = new Map<string, ParsedSubscriptionProduct>();
    products.forEach(product => productMap.set(normalizeProductName(product.name), product));
    const uniqueProducts = [...productMap.values()];
    if (uniqueProducts.filter(product => /^T 우주 Big [3-6]$/.test(product.name)).length !== 4) {
        throw new Error('T우주 Big 3~6 상품 구성을 모두 파싱하지 못했습니다.');
    }

    const details = parseDetailedDiscounts(
        input.dailyPassHtml,
        input.dailyPassUrl,
        input.oliveStarbucksHtml,
        input.oliveStarbucksUrl,
    );
    const promotions = [
        ...details.map(detail => toPromotion(detail, uniqueProducts)),
        parseParisInformationOffer(uniqueProducts, input.bigGuideUrl),
    ];
    return { products: uniqueProducts, promotions };
}
