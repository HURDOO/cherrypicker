import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
    brands,
    promotionCandidates,
    promotionCollectionRuns,
    promotionOffers,
    subscriptionProducts,
    transactionBenefits,
} from '@/db/schema';
import { summarizePromotionCollectionRun } from './promotion-collection-run';
import { decodePromotionHtml } from './html-decoding';
import { normalizePromotionDraft } from './promotion-input';
import {
    classifyParsedPromotions,
    createPromotionSemanticClassifier,
} from './promotion-semantic-classifier';
import type { PromotionSemanticAnalysis } from '@/types';
import {
    parseLguplusBenefits,
    parseNaverPayPromotions,
    parseParisMembershipHtml,
    parseSktMembershipHtml,
    parseTousLesJoursHtml,
    type ParsedPromotion,
} from './promotion-parsers';
import {
    parseTUniverseSources,
    type ParsedSubscriptionProduct,
} from './t-universe-parser';

type PromotionSource = {
    id: string;
    url: string;
    label: string;
    kind: 'skt-html' | 'lguplus-api' | 'naverpay-api' |
        'paris-skt-html' | 'paris-kt-html' | 'tlj-html' |
        't-universe-composite' | 'unsupported';
    unsupportedMessage?: string;
    legacyUrls?: string[];
};

export type PromotionCollectionResult = {
    sourceId: string;
    sourceUrl: string;
    label: string;
    status: 'created' | 'unchanged' | 'failed' | 'skipped';
    discovered: number;
    published: number;
    reviewRequired: number;
    unchanged: number;
    expired: number;
    products?: number;
    message?: string;
};

const SKT_URL = 'https://sktmembership.tworld.co.kr/mps/pc-bff/benefitbrand/list-tab1.do';
const LGUPLUS_PAGE_URL = 'https://www.lguplus.com/benefit-membership';
const LGUPLUS_API_URL = 'https://www.lguplus.com/uhdc/fo/prdv/mebfjnco/v1/jnco';
const NAVERPAY_PAGE_URL = 'https://pay.naver.com/benefit/payment/list';
const NAVERPAY_API_BASE = 'https://pay.naver.com/web-api/pub';
const PARIS_KT_URL = 'https://www.paris.co.kr/affiliate-card/kt-%EB%A9%A4%EB%B2%84%EC%8B%AD/';
const PARIS_SKT_URL = 'https://www.paris.co.kr/affiliate-card/t-%EB%A9%A4%EB%B2%84%EC%8B%AD/';
const TLJ_URL = 'https://www.tlj.co.kr/membership/partner.asp';
const T_UNIVERSE_BIG_GUIDE_URL =
    'https://shop.tworld.co.kr/magazine/plan/twoojoo-benefits-guide.html';
const T_UNIVERSE_DAILY_PASS_URL = 'https://news.sktelecom.com/226659';
const T_UNIVERSE_OLIVE_STARBUCKS_URL = 'https://news.sktelecom.com/214562';

export const promotionSources: PromotionSource[] = [
    {
        id: 't-universe-products',
        url: T_UNIVERSE_BIG_GUIDE_URL,
        label: 'T우주 상품·제휴 혜택',
        kind: 't-universe-composite',
        legacyUrls: [T_UNIVERSE_DAILY_PASS_URL, T_UNIVERSE_OLIVE_STARBUCKS_URL],
    },
    {
        id: 'paris-kt',
        url: PARIS_KT_URL,
        label: '파리바게뜨 KT멤버십',
        kind: 'paris-kt-html',
    },
    {
        id: 'paris-skt',
        url: PARIS_SKT_URL,
        label: '파리바게뜨 T멤버십',
        kind: 'paris-skt-html',
    },
    {
        id: 'tlj-membership',
        url: TLJ_URL,
        label: '뚜레쥬르 통신 3사 혜택',
        kind: 'tlj-html',
    },
    {
        id: 'skt-membership',
        url: SKT_URL,
        label: 'T멤버십 제휴 브랜드',
        kind: 'skt-html',
    },
    {
        id: 'lguplus-membership',
        url: LGUPLUS_PAGE_URL,
        label: 'U+멤버십 제휴사',
        kind: 'lguplus-api',
        legacyUrls: [LGUPLUS_PAGE_URL],
    },
    {
        id: 'naverpay-benefits',
        url: NAVERPAY_PAGE_URL,
        label: 'Npay 결제 혜택',
        kind: 'naverpay-api',
        legacyUrls: [NAVERPAY_PAGE_URL],
    },
    {
        id: 'kt-membership',
        url: 'https://membership.kt.com/discount/partner/PartnerList.do',
        label: 'KT멤버십 전체 제휴 브랜드',
        kind: 'unsupported',
        unsupportedMessage: '서버 직접 요청이 연결 시간 초과되어 파리바게뜨·뚜레쥬르 공식 교차 출처만 자동화합니다.',
    },
    {
        id: 'kakaopay-benefits',
        url: 'https://story.kakaopay.com/130-kakaopay-benefit/',
        label: '카카오페이 혜택',
        kind: 'unsupported',
        unsupportedMessage: '공개 페이지는 2023년 앱 소개글이며 현재 행사 목록이 아니어서 자동 게시하지 않습니다.',
    },
    {
        id: 'kakaopay-gooddeal',
        url: 'https://story.kakaopay.com/318-kakaopay-benefit/',
        label: '카카오페이 굿딜',
        kind: 'unsupported',
        unsupportedMessage: '공개 글에는 현재 브랜드별 상품권 가격이 없어 앱/API 출처가 확보될 때까지 자동 게시하지 않습니다.',
    },
];

const requestHeaders = {
    'user-agent': 'CherrypickerBenefits/2.0 (+structured-official-source-collector)',
    accept: 'text/html,application/xhtml+xml,application/json',
};

async function fetchResponse(url: string, accept = requestHeaders.accept) {
    const response = await fetch(url, {
        headers: {
            ...requestHeaders,
            accept,
            referer: url,
            'x-href': url,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
}

async function fetchHtml(url: string) {
    const response = await fetchResponse(url, 'text/html,application/xhtml+xml');
    return decodePromotionHtml(
        new Uint8Array(await response.arrayBuffer()),
        response.headers.get('content-type'),
    );
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchResponse(url, 'application/json');
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
        throw new Error(`JSON 대신 ${contentType || '알 수 없는 형식'} 응답`);
    }
    return response.json() as Promise<T>;
}

async function collectLguplusSource() {
    const params = new URLSearchParams({
        urcMbspDivsCd: '01',
        urcMbspBnftDivsCd: '02',
        urcMbspCatgNo: '',
        pageNo: '1',
        rowSize: '500',
        _paging: 'true',
    });
    const rows = await fetchJson<Parameters<typeof parseLguplusBenefits>[0]>(
        `${LGUPLUS_API_URL}?${params}`
    );
    return parseLguplusBenefits(rows, LGUPLUS_PAGE_URL);
}

type NaverCategory = { name: string; code: string };
type NaverPage = {
    elements: Parameters<typeof parseNaverPayPromotions>[0];
    pagination: { page: number; totalPages: number };
};

async function collectNaverPaySource() {
    const categories = await fetchJson<NaverCategory[]>(
        `${NAVERPAY_API_BASE}/benefit/payment/first-category`
    );
    const offers: ParsedPromotion[] = [];

    for (const category of categories) {
        let page = 1;
        let totalPages = 1;
        do {
            const params = new URLSearchParams({
                firstCategory: category.code,
                page: String(page),
            });
            const result = await fetchJson<NaverPage>(
                `${NAVERPAY_API_BASE}/benefit/payment/accumulation-promotions?${params}`
            );
            offers.push(...parseNaverPayPromotions(
                result.elements,
                category.code,
                NAVERPAY_PAGE_URL,
            ));
            totalPages = Math.min(result.pagination.totalPages, 20);
            page += 1;
        } while (page <= totalPages);
    }

    return offers;
}

type ParsedSource = {
    promotions: ParsedPromotion[];
    products: ParsedSubscriptionProduct[];
};

async function parseSource(source: PromotionSource): Promise<ParsedSource> {
    if (source.kind === 'lguplus-api') {
        return { promotions: await collectLguplusSource(), products: [] };
    }
    if (source.kind === 'naverpay-api') {
        return { promotions: await collectNaverPaySource(), products: [] };
    }
    if (source.kind === 'unsupported') return { promotions: [], products: [] };
    if (source.kind === 't-universe-composite') {
        const [bigGuideHtml, dailyPassHtml, oliveStarbucksHtml] = await Promise.all([
            fetchHtml(T_UNIVERSE_BIG_GUIDE_URL),
            fetchHtml(T_UNIVERSE_DAILY_PASS_URL),
            fetchHtml(T_UNIVERSE_OLIVE_STARBUCKS_URL),
        ]);
        const parsed = parseTUniverseSources({
            bigGuideHtml,
            bigGuideUrl: T_UNIVERSE_BIG_GUIDE_URL,
            dailyPassHtml,
            dailyPassUrl: T_UNIVERSE_DAILY_PASS_URL,
            oliveStarbucksHtml,
            oliveStarbucksUrl: T_UNIVERSE_OLIVE_STARBUCKS_URL,
        });
        return { promotions: parsed.promotions, products: parsed.products };
    }

    const html = await fetchHtml(source.url);
    if (source.kind === 'skt-html') {
        return { promotions: parseSktMembershipHtml(html, source.url), products: [] };
    }
    if (source.kind === 'paris-skt-html') {
        return { promotions: parseParisMembershipHtml(html, 'skt', source.url), products: [] };
    }
    if (source.kind === 'paris-kt-html') {
        return { promotions: parseParisMembershipHtml(html, 'kt', source.url), products: [] };
    }
    return { promotions: parseTousLesJoursHtml(html, source.url), products: [] };
}

const hashValue = (value: unknown) => createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');

const autoPromotionId = (providerId: string, sourceKey: string) =>
    `promotion-auto-${createHash('sha256')
        .update(`${providerId}:${sourceKey}`)
        .digest('hex')
        .slice(0, 32)}`;

const subscriptionProductId = (providerId: string, sourceKey: string) =>
    `subscription-product-${createHash('sha256')
        .update(`${providerId}:${sourceKey}`)
        .digest('hex')
        .slice(0, 32)}`;

const providerSourceCoverage: Record<string, string[]> = {
    skt: ['paris-skt', 'tlj-membership', 'skt-membership'],
    kt: ['paris-kt', 'tlj-membership'],
    lguplus: ['tlj-membership', 'lguplus-membership'],
    naverpay: ['naverpay-benefits'],
    't-universe': ['t-universe-products'],
};

const providerExpiryReportSource: Record<string, string> = {
    skt: 'skt-membership',
    kt: 'tlj-membership',
    lguplus: 'lguplus-membership',
    naverpay: 'naverpay-benefits',
    't-universe': 't-universe-products',
};

const legacyTUniversePromotions = new Map([
    ['t-universe-cu-20-percent', 't-universe-discount:cu:20'],
    ['t-universe-seveneleven-30-percent', 't-universe-discount:seveneleven:30'],
    ['t-universe-twosome-30-percent', 't-universe-discount:twosome:30'],
    ['t-universe-starbucks-20-percent', 't-universe-discount:starbucks:20'],
    [
        't-universe-paris-baguette-30-percent-info',
        't-universe-discount:paris_baguette:30:information',
    ],
]);

function expireLegacyTUniversePromotions(now: Date) {
    let expired = 0;
    legacyTUniversePromotions.forEach((sourceKey, id) => {
        const offer = db.select({ status: promotionOffers.status })
            .from(promotionOffers)
            .where(eq(promotionOffers.id, id))
            .get();
        if (!offer) return;
        const replacementId = autoPromotionId('t-universe', sourceKey);
        const replacement = db.select({ id: promotionOffers.id })
            .from(promotionOffers)
            .where(eq(promotionOffers.id, replacementId))
            .get();
        if (replacement) {
            db.update(transactionBenefits)
                .set({ promotionId: replacementId })
                .where(eq(transactionBenefits.promotionId, id))
                .run();
        }
        if (offer.status === 'EXPIRED') return;
        db.update(promotionOffers)
            .set({ status: 'EXPIRED', updatedAt: now })
            .where(eq(promotionOffers.id, id))
            .run();
        expired += 1;
    });
    return expired;
}

function persistSubscriptionProductCatalog(
    products: ParsedSubscriptionProduct[],
    now: Date,
) {
    const providerIds = [...new Set(products.map(product => product.providerId))];
    const observedIds = new Set<string>();
    db.transaction(() => {
        products.forEach(product => {
            const id = subscriptionProductId(product.providerId, product.sourceKey);
            observedIds.add(id);
            const sourceHash = hashValue({
                name: product.name,
                aliases: product.aliases,
                benefitSummary: product.benefitSummary,
                evidence: product.evidence,
            });
            const values = {
                providerId: product.providerId,
                name: product.name,
                aliases: product.aliases,
                benefitSummary: product.benefitSummary,
                sourceUrl: product.sourceUrl,
                sourceKey: product.sourceKey,
                sourceHash,
                isActive: true,
                collectedAt: now,
                updatedAt: now,
            };
            db.insert(subscriptionProducts)
                .values({ id, ...values })
                .onConflictDoUpdate({
                    target: subscriptionProducts.id,
                    set: values,
                })
                .run();
        });
        providerIds.forEach(providerId => {
            db.select({
                id: subscriptionProducts.id,
                isActive: subscriptionProducts.isActive,
            })
                .from(subscriptionProducts)
                .where(eq(subscriptionProducts.providerId, providerId))
                .all()
                .filter(product => product.isActive && !observedIds.has(product.id))
                .forEach(product => {
                    db.update(subscriptionProducts)
                        .set({ isActive: false, updatedAt: now })
                        .where(eq(subscriptionProducts.id, product.id))
                        .run();
                });
        });
    });
}

function expireMissingAutoPromotions(
    successfulSourceIds: Set<string>,
    observedAutoPromotionIds: Set<string>,
    now: Date,
) {
    const expiredByProvider = new Map<string, number>();
    const coveredProviders = new Set(
        Object.entries(providerSourceCoverage)
            .filter(([, sourceIds]) => sourceIds.every(id => successfulSourceIds.has(id)))
            .map(([providerId]) => providerId)
    );
    if (coveredProviders.size === 0) return expiredByProvider;

    db.select().from(promotionOffers).all()
        .filter(offer =>
            offer.id.startsWith('promotion-auto-') &&
            offer.status !== 'EXPIRED' &&
            coveredProviders.has(offer.providerId) &&
            !observedAutoPromotionIds.has(offer.id)
        )
        .forEach(offer => {
            db.update(promotionOffers)
                .set({ status: 'EXPIRED', updatedAt: now })
                .where(eq(promotionOffers.id, offer.id))
                .run();
            expiredByProvider.set(
                offer.providerId,
                (expiredByProvider.get(offer.providerId) ?? 0) + 1,
            );
        });

    return expiredByProvider;
}

const isLegacyPlaceholder = (candidate: typeof promotionCandidates.$inferSelect) => {
    const action = candidate.parsedOffer.action;
    const diff = candidate.diff;
    return (!diff || diff.structured !== true) &&
        Boolean(action && typeof action === 'object' &&
            (action as Record<string, unknown>).value === 0);
};

function rejectLegacyPlaceholders(source: PromotionSource, now: Date) {
    const legacyUrls = new Set([source.url, ...(source.legacyUrls ?? [])]);
    const candidates = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.status, 'PENDING'))
        .all()
        .filter(candidate => legacyUrls.has(candidate.sourceUrl) && isLegacyPlaceholder(candidate));
    candidates.forEach(candidate => {
        db.update(promotionCandidates)
            .set({ status: 'REJECTED', reviewedAt: now })
            .where(eq(promotionCandidates.id, candidate.id))
            .run();
    });
}

function upsertAutoPromotion(
    parsed: ParsedPromotion,
    parsedOffer: Record<string, unknown>,
    sourceHash: string,
    candidateId: string,
    now: Date,
) {
    const promotionId = autoPromotionId(parsed.offer.providerId, parsed.sourceKey);
    const existingOffer = db.select().from(promotionOffers)
        .where(eq(promotionOffers.id, promotionId))
        .get();
    const normalized = normalizePromotionDraft(parsedOffer);
    const status = existingOffer?.status === 'PAUSED' ? 'PAUSED' as const : 'PUBLISHED' as const;
    const values = {
        ...normalized,
        sourceHash,
        collectedAt: now,
        reviewedAt: now,
        publishedAt: existingOffer?.publishedAt ?? now,
        updatedAt: now,
        status,
    };

    db.insert(promotionOffers)
        .values({ id: promotionId, ...values })
        .onConflictDoUpdate({
            target: promotionOffers.id,
            set: values,
        })
        .run();
    db.update(promotionCandidates)
        .set({
            status: 'APPROVED',
            linkedPromotionId: promotionId,
            reviewedAt: now,
        })
        .where(eq(promotionCandidates.id, candidateId))
        .run();
}

function persistParsedPromotion(parsed: ParsedPromotion, now: Date, collectionSourceId: string) {
    if (parsed.discoveredBrand) {
        db.insert(brands)
            .values({
                id: parsed.discoveredBrand.id,
                name: parsed.discoveredBrand.name,
                categoryId: parsed.discoveredBrand.categoryId,
                iconName: parsed.discoveredBrand.iconName,
            })
            .onConflictDoNothing()
            .run();
    }
    const sourceHash = hashValue({
        sourceKey: parsed.sourceKey,
        offer: parsed.offer,
        evidence: parsed.evidence,
        semanticAnalysis: parsed.semanticAnalysis,
    });
    const parsedOffer = {
        ...parsed.offer,
        sourceHash,
        collectedAt: now.toISOString(),
    } as Record<string, unknown>;
    const existing = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, parsed.offer.providerId),
            eq(promotionCandidates.sourceUrl, parsed.offer.sourceUrl),
            eq(promotionCandidates.sourceHash, sourceHash),
        ))
        .get();
    const promotionId = autoPromotionId(parsed.offer.providerId, parsed.sourceKey);
    const existingOffer = parsed.autoPublish
        ? db.select().from(promotionOffers).where(eq(promotionOffers.id, promotionId)).get()
        : undefined;

    if (existing) {
        const supersededPending = db.select().from(promotionCandidates)
            .where(and(
                eq(promotionCandidates.providerId, parsed.offer.providerId),
                eq(promotionCandidates.status, 'PENDING'),
            ))
            .all()
            .filter(candidate =>
                candidate.id !== existing.id && candidate.diff?.sourceKey === parsed.sourceKey
            );
        db.transaction(() => {
            supersededPending.forEach(candidate => {
                db.update(promotionCandidates)
                    .set({ status: 'REJECTED', reviewedAt: now })
                    .where(eq(promotionCandidates.id, candidate.id))
                    .run();
            });
            db.update(promotionCandidates)
                .set({
                    diff: { ...existing.diff, collectionSourceId },
                    ...(!parsed.autoPublish && !existing.reviewerId && {
                        status: 'PENDING' as const,
                        reviewedAt: null,
                    }),
                    ...(parsed.autoPublish && existingOffer?.sourceHash === sourceHash && {
                        status: 'APPROVED' as const,
                        linkedPromotionId: promotionId,
                        reviewedAt: now,
                    }),
                })
                .where(eq(promotionCandidates.id, existing.id))
                .run();
        });
        if (parsed.autoPublish && (!existingOffer || existingOffer.sourceHash !== sourceHash)) {
            db.transaction(() => {
                upsertAutoPromotion(parsed, parsedOffer, sourceHash, existing.id, now);
            });
            return { inserted: false, published: true, reviewRequired: false };
        }
        return { inserted: false, published: false, reviewRequired: false };
    }

    const previousCandidates = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, parsed.offer.providerId),
            eq(promotionCandidates.sourceUrl, parsed.offer.sourceUrl),
        ))
        .orderBy(desc(promotionCandidates.discoveredAt))
        .all();
    const previous = previousCandidates.find(candidate =>
        candidate.diff?.sourceKey === parsed.sourceKey
    );
    const candidateId = randomUUID();

    db.transaction(() => {
        previousCandidates
            .filter(candidate =>
                candidate.status === 'PENDING' && candidate.diff?.sourceKey === parsed.sourceKey
            )
            .forEach(candidate => {
                db.update(promotionCandidates)
                    .set({ status: 'REJECTED', reviewedAt: now })
                    .where(eq(promotionCandidates.id, candidate.id))
                    .run();
            });
        db.insert(promotionCandidates).values({
            id: candidateId,
            providerId: parsed.offer.providerId,
            sourceUrl: parsed.offer.sourceUrl,
            sourceHash,
            sourceTitle: parsed.offer.title,
            rawContent: parsed.evidence.slice(0, 120_000),
            parsedOffer,
            diff: {
                collectionSourceId,
                sourceKey: parsed.sourceKey,
                structured: true,
                autoPublished: parsed.autoPublish,
                previousHash: previous?.sourceHash ?? null,
                changed: Boolean(previous),
                linkedPromotionId: existingOffer?.id ?? previous?.linkedPromotionId ?? null,
                warnings: parsed.warnings,
                ...(parsed.semanticAnalysis && {
                    semanticAnalysis: parsed.semanticAnalysis,
                }),
            },
            status: parsed.autoPublish ? 'APPROVED' : 'PENDING',
            linkedPromotionId: null,
            discoveredAt: now,
            reviewedAt: parsed.autoPublish ? now : null,
        }).run();

        if (parsed.autoPublish) {
            upsertAutoPromotion(parsed, parsedOffer, sourceHash, candidateId, now);
        }
    });

    return {
        inserted: true,
        published: parsed.autoPublish,
        reviewRequired: !parsed.autoPublish,
    };
}

function rejectMissingPendingCandidates(
    source: PromotionSource,
    parsed: ParsedPromotion[],
    now: Date,
) {
    const observed = new Set(parsed.map(item => `${item.offer.providerId}:${item.sourceKey}`));
    const sourceUrls = new Set([source.url, ...(source.legacyUrls ?? [])]);

    db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.status, 'PENDING'))
        .all()
        .filter(candidate => {
            const collectionSourceId = candidate.diff.collectionSourceId;
            if (typeof collectionSourceId === 'string') return collectionSourceId === source.id;
            if (candidate.diff.structured !== true) return false;
            if (source.id === 'naverpay-benefits' && candidate.providerId === 'naverpay') return true;
            return sourceUrls.has(candidate.sourceUrl);
        })
        .filter(candidate => {
            const sourceKey = candidate.diff.sourceKey;
            return typeof sourceKey !== 'string' ||
                !observed.has(`${candidate.providerId}:${sourceKey}`);
        })
        .forEach(candidate => {
            db.update(promotionCandidates)
                .set({ status: 'REJECTED', reviewedAt: now })
                .where(eq(promotionCandidates.id, candidate.id))
                .run();
        });
}

export async function collectPromotionCandidates() {
    const startedAt = new Date();
    const results: PromotionCollectionResult[] = [];
    const claimedAutoPromotionIds = new Set<string>();
    const observedAutoPromotionIds = new Set<string>();
    const successfulSourceIds = new Set<string>();
    const cachedSemanticAnalyses = db.select({ diff: promotionCandidates.diff })
        .from(promotionCandidates)
        .all()
        .flatMap(row => {
            const analysis = row.diff.semanticAnalysis;
            return analysis && typeof analysis === 'object' && !Array.isArray(analysis)
                ? [analysis as PromotionSemanticAnalysis]
                : [];
        });
    const semanticClassifier = createPromotionSemanticClassifier(cachedSemanticAnalyses);

    for (const source of promotionSources) {
        if (source.kind === 'unsupported') {
            rejectLegacyPlaceholders(source, new Date());
            results.push({
                sourceId: source.id,
                sourceUrl: source.url,
                label: source.label,
                status: 'skipped',
                discovered: 0,
                published: 0,
                reviewRequired: 0,
                unchanged: 0,
                expired: 0,
                message: source.unsupportedMessage,
            });
            continue;
        }

        try {
            const sourceData = await parseSource(source);
            const parsed = await classifyParsedPromotions(
                sourceData.promotions,
                semanticClassifier,
            );
            if (parsed.length === 0) {
                throw new Error('구조화 가능한 혜택을 찾지 못했습니다. 출처 형식 또는 브랜드 매핑을 확인해주세요.');
            }
            const now = new Date();
            rejectLegacyPlaceholders(source, now);
            if (sourceData.products.length > 0) {
                persistSubscriptionProductCatalog(sourceData.products, now);
            }
            let discovered = 0;
            let published = 0;
            let reviewRequired = 0;
            let unchanged = 0;

            parsed.forEach(offer => {
                const promotionId = autoPromotionId(
                    offer.offer.providerId,
                    offer.sourceKey,
                );
                if (offer.autoPublish) observedAutoPromotionIds.add(promotionId);
                if (offer.autoPublish && claimedAutoPromotionIds.has(promotionId)) {
                    unchanged += 1;
                    return;
                }
                const persisted = persistParsedPromotion(offer, now, source.id);
                if (offer.autoPublish) claimedAutoPromotionIds.add(promotionId);
                if (persisted.inserted) discovered += 1;
                else unchanged += 1;
                if (persisted.published) published += 1;
                if (persisted.reviewRequired) reviewRequired += 1;
            });

            successfulSourceIds.add(source.id);
            rejectMissingPendingCandidates(source, parsed, now);
            const legacyExpired = source.id === 't-universe-products'
                ? expireLegacyTUniversePromotions(now)
                : 0;

            results.push({
                sourceId: source.id,
                sourceUrl: source.url,
                label: source.label,
                status: discovered > 0 ? 'created' : 'unchanged',
                discovered,
                published,
                reviewRequired,
                unchanged,
                expired: legacyExpired,
                ...(sourceData.products.length > 0 && {
                    products: sourceData.products.length,
                    message: `구독 상품 ${sourceData.products.length}개 동기화`,
                }),
            });
        } catch (error) {
            results.push({
                sourceId: source.id,
                sourceUrl: source.url,
                label: source.label,
                status: 'failed',
                discovered: 0,
                published: 0,
                reviewRequired: 0,
                unchanged: 0,
                expired: 0,
                message: error instanceof Error ? error.message : '수집 실패',
            });
        }
    }

    const expiredByProvider = expireMissingAutoPromotions(
        successfulSourceIds,
        observedAutoPromotionIds,
        new Date(),
    );
    expiredByProvider.forEach((expired, providerId) => {
        const sourceId = providerExpiryReportSource[providerId];
        const result = results.find(item => item.sourceId === sourceId);
        if (!result) return;
        result.expired += expired;
        if (result.status === 'unchanged') result.status = 'created';
    });

    const finishedAt = new Date();
    const summary = summarizePromotionCollectionRun(results);
    db.insert(promotionCollectionRuns).values({
        id: randomUUID(),
        ...summary,
        startedAt,
        finishedAt,
    }).run();

    return results;
}
