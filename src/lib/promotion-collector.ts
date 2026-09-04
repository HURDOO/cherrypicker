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
import { toPromotionOffer } from './db-mappers';
import { summarizePromotionCollectionRun } from './promotion-collection-run';
import { decodePromotionHtml } from './html-decoding';
import { normalizePromotionDraft } from './promotion-input';
import {
    classifyParsedPromotions,
    createPromotionSemanticClassifier,
} from './promotion-semantic-classifier';
import type { PromotionCandidateAudit, PromotionSemanticAnalysis } from '@/types';
import {
    parseLguplusBenefits,
    parseNaverPayPromotions,
    parseParisMembershipHtml,
    parseSktMembershipHtml,
    parseTousLesJoursHtml,
    htmlToText,
    type ParsedPromotion,
} from './promotion-parsers';
import {
    parseTUniverseSources,
    type ParsedSubscriptionProduct,
} from './t-universe-parser';
import { createPromotionCandidateAudit } from './promotion-candidate-audit';
import {
    persistPromotionSourceBundle,
    type CollectedPromotionSourceDocument,
    type PersistedPromotionSourceBundle,
} from './promotion-source-bundle';
import {
    addPromotionRemovalObservation,
    canAutomaticallyConfirmPromotionRemoval,
    createPromotionRemovalObservation,
    isPromotionRemovalCandidate,
    PROMOTION_CANDIDATE_RESOLUTION,
    PROMOTION_REMOVAL_AUTO_POLICY,
    removalCandidateMatchesObservedPromotion,
    shouldRejectPendingCandidateMissingFromSource,
    withPromotionCandidateResolution,
} from './promotion-removal-policy';
import { confirmPromotionRemoval } from './promotion-removal-server';
import {
    canAutomaticallyPublishPromotionCandidate,
    shouldPreserveReviewedPromotionCandidate,
} from './promotion-review-policy';

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
    removalVerificationAt?: string;
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

const PROMOTION_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;
const PROMOTION_BUNDLE_MAX_BYTES = 32 * 1024 * 1024;

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

const collectJsonText = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
    if (Array.isArray(value)) return value.flatMap(collectJsonText);
    if (!value || typeof value !== 'object') return [];
    return Object.values(value).flatMap(collectJsonText);
};

async function responseBytes(response: Response) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > PROMOTION_DOCUMENT_MAX_BYTES) {
        throw new Error('프로모션 공식 원문이 문서별 허용 크기를 초과했습니다.');
    }
    return bytes;
}

const responseMetadata = (
    response: Response,
    requestedUrl: string,
    contentType: string,
) => ({
    ...(contentType && { contentType }),
    ...(response.headers.get('etag') && { etag: response.headers.get('etag')! }),
    ...(response.headers.get('last-modified') && {
        lastModified: response.headers.get('last-modified')!,
    }),
    ...(response.url && response.url !== requestedUrl && { finalUrl: response.url }),
});

async function fetchHtml(url: string) {
    const response = await fetchResponse(url, 'text/html,application/xhtml+xml');
    const bytes = await responseBytes(response);
    const mediaType = response.headers.get('content-type') ?? 'text/html';
    const rawContent = decodePromotionHtml(bytes, mediaType);
    return {
        value: rawContent,
        document: {
            sourceUrl: url,
            mediaType,
            rawContent,
            extractedText: htmlToText(rawContent),
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            responseMetadata: responseMetadata(response, url, mediaType),
        } satisfies CollectedPromotionSourceDocument,
    };
}

async function fetchJson<T>(url: string): Promise<{
    value: T;
    document: CollectedPromotionSourceDocument;
}> {
    const response = await fetchResponse(url, 'application/json');
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('json')) {
        throw new Error(`JSON 대신 ${contentType || '알 수 없는 형식'} 응답`);
    }
    const bytes = await responseBytes(response);
    const rawContent = new TextDecoder().decode(bytes);
    const value = JSON.parse(rawContent) as T;
    return {
        value,
        document: {
            sourceUrl: url,
            mediaType: contentType,
            rawContent,
            extractedText: collectJsonText(value).join('\n').slice(0, 2_000_000),
            contentHash: createHash('sha256').update(bytes).digest('hex'),
            responseMetadata: responseMetadata(response, url, contentType),
        },
    };
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
    const collected = await fetchJson<Parameters<typeof parseLguplusBenefits>[0]>(
        `${LGUPLUS_API_URL}?${params}`
    );
    return {
        promotions: parseLguplusBenefits(collected.value, LGUPLUS_PAGE_URL),
        products: [],
        documents: [collected.document],
    };
}

type NaverCategory = { name: string; code: string };
type NaverPage = {
    elements: Parameters<typeof parseNaverPayPromotions>[0];
    pagination: { page: number; totalPages: number };
};

async function collectNaverPaySource() {
    const categoryResponse = await fetchJson<NaverCategory[]>(
        `${NAVERPAY_API_BASE}/benefit/payment/first-category`
    );
    const categories = categoryResponse.value;
    const offers: ParsedPromotion[] = [];
    const documents = [categoryResponse.document];

    for (const category of categories) {
        let page = 1;
        let totalPages = 1;
        do {
            const params = new URLSearchParams({
                firstCategory: category.code,
                page: String(page),
            });
            const response = await fetchJson<NaverPage>(
                `${NAVERPAY_API_BASE}/benefit/payment/accumulation-promotions?${params}`
            );
            const result = response.value;
            documents.push(response.document);
            offers.push(...parseNaverPayPromotions(
                result.elements,
                category.code,
                NAVERPAY_PAGE_URL,
            ));
            totalPages = Math.min(result.pagination.totalPages, 20);
            page += 1;
        } while (page <= totalPages);
    }

    return { promotions: offers, products: [], documents };
}

type ParsedSource = {
    promotions: ParsedPromotion[];
    products: ParsedSubscriptionProduct[];
    documents: CollectedPromotionSourceDocument[];
};

async function parseSource(source: PromotionSource): Promise<ParsedSource> {
    if (source.kind === 'lguplus-api') {
        return collectLguplusSource();
    }
    if (source.kind === 'naverpay-api') {
        return collectNaverPaySource();
    }
    if (source.kind === 'unsupported') {
        return { promotions: [], products: [], documents: [] };
    }
    if (source.kind === 't-universe-composite') {
        const [bigGuide, dailyPass, oliveStarbucks] = await Promise.all([
            fetchHtml(T_UNIVERSE_BIG_GUIDE_URL),
            fetchHtml(T_UNIVERSE_DAILY_PASS_URL),
            fetchHtml(T_UNIVERSE_OLIVE_STARBUCKS_URL),
        ]);
        const parsed = parseTUniverseSources({
            bigGuideHtml: bigGuide.value,
            bigGuideUrl: T_UNIVERSE_BIG_GUIDE_URL,
            dailyPassHtml: dailyPass.value,
            dailyPassUrl: T_UNIVERSE_DAILY_PASS_URL,
            oliveStarbucksHtml: oliveStarbucks.value,
            oliveStarbucksUrl: T_UNIVERSE_OLIVE_STARBUCKS_URL,
        });
        return {
            promotions: parsed.promotions,
            products: parsed.products,
            documents: [bigGuide.document, dailyPass.document, oliveStarbucks.document],
        };
    }

    const html = await fetchHtml(source.url);
    if (source.kind === 'skt-html') {
        return {
            promotions: parseSktMembershipHtml(html.value, source.url),
            products: [],
            documents: [html.document],
        };
    }
    if (source.kind === 'paris-skt-html') {
        return {
            promotions: parseParisMembershipHtml(html.value, 'skt', source.url),
            products: [],
            documents: [html.document],
        };
    }
    if (source.kind === 'paris-kt-html') {
        return {
            promotions: parseParisMembershipHtml(html.value, 'kt', source.url),
            products: [],
            documents: [html.document],
        };
    }
    return {
        promotions: parseTousLesJoursHtml(html.value, source.url),
        products: [],
        documents: [html.document],
    };
}

const hashValue = (value: unknown) => createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');

const promotionForDiff = (value: Record<string, unknown>) => Object.fromEntries(
    Object.entries(value).filter(([key]) => ![
        'id',
        'status',
        'sourceHash',
        'collectedAt',
        'reviewedAt',
        'publishedAt',
        'updatedAt',
    ].includes(key))
);

export const autoPromotionId = (providerId: string, sourceKey: string) =>
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
        if (!replacement) return;
        db.update(transactionBenefits)
            .set({ promotionId: replacementId })
            .where(eq(transactionBenefits.promotionId, id))
            .run();
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

function queueMissingAutoPromotions(
    successfulSourceIds: Set<string>,
    observedAutoPromotionIds: Set<string>,
    sourceBundles: Map<string, PersistedPromotionSourceBundle>,
    now: Date,
) {
    const resultBySource = new Map<string, {
        queued: number;
        autoExpired: number;
        removalVerificationAt?: string;
    }>();
    const incrementResult = (
        sourceId: string,
        field: 'queued' | 'autoExpired',
    ) => {
        const current = resultBySource.get(sourceId) ?? { queued: 0, autoExpired: 0 };
        resultBySource.set(sourceId, { ...current, [field]: current[field] + 1 });
    };
    const scheduleVerification = (
        sourceId: string,
        observation: ReturnType<typeof createPromotionRemovalObservation>,
    ) => {
        const current = resultBySource.get(sourceId) ?? { queued: 0, autoExpired: 0 };
        const dueAt = new Date(
            new Date(observation.firstObservedAt).getTime() +
            PROMOTION_REMOVAL_AUTO_POLICY.minimumObservationWindowMs
        ).toISOString();
        resultBySource.set(sourceId, {
            ...current,
            removalVerificationAt: !current.removalVerificationAt ||
                dueAt < current.removalVerificationAt
                ? dueAt
                : current.removalVerificationAt,
        });
    };
    const coveredProviders = new Set(
        Object.entries(providerSourceCoverage)
            .filter(([, sourceIds]) => sourceIds.every(id => successfulSourceIds.has(id)))
            .map(([providerId]) => providerId)
    );
    if (coveredProviders.size === 0) return resultBySource;

    db.select().from(promotionOffers).all()
        .filter(offer =>
            offer.id.startsWith('promotion-auto-') &&
            offer.status !== 'EXPIRED' &&
            coveredProviders.has(offer.providerId) &&
            !observedAutoPromotionIds.has(offer.id)
        )
        .forEach(offer => {
            const previousCandidates = db.select().from(promotionCandidates)
                .where(eq(promotionCandidates.providerId, offer.providerId))
                .orderBy(desc(promotionCandidates.discoveredAt))
                .all();
            const previous = previousCandidates.find(candidate => (
                candidate.linkedPromotionId === offer.id
            ));
            const previousSourceId = previous?.diff.collectionSourceId;
            const collectionSourceId = typeof previousSourceId === 'string'
                ? previousSourceId
                : providerExpiryReportSource[offer.providerId];
            const sourceBundle = sourceBundles.get(collectionSourceId);
            const source = promotionSources.find(item => item.id === collectionSourceId);
            if (!sourceBundle || !source) return;
            const requiredSourceIds = providerSourceCoverage[offer.providerId] ?? [];
            const coverageSourceBundleHashes = Object.fromEntries(requiredSourceIds.flatMap(
                sourceId => {
                    const bundle = sourceBundles.get(sourceId);
                    return bundle ? [[sourceId, bundle.sourceBundleHash]] : [];
                }
            ));
            if (Object.keys(coverageSourceBundleHashes).length !== requiredSourceIds.length) return;
            const sourceKey = typeof previous?.diff.sourceKey === 'string'
                ? previous.diff.sourceKey
                : offer.id;
            const baseSourceHash = hashValue({
                kind: 'missing-published-promotion',
                promotionId: offer.id,
                sourceBundleHash: sourceBundle.sourceBundleHash,
            });
            const observationInput = {
                observedAt: now,
                sourceBundleHash: sourceBundle.sourceBundleHash,
                coverageSourceBundleHashes,
            };
            const pendingRemovalCandidate = previousCandidates.find(candidate => (
                candidate.status === 'PENDING' &&
                candidate.linkedPromotionId === offer.id &&
                candidate.diff.removedFromSource === true
            ));
            if (pendingRemovalCandidate) {
                const removalObservation = addPromotionRemovalObservation(
                    pendingRemovalCandidate,
                    observationInput,
                );
                db.update(promotionCandidates)
                    .set({
                        sourceBundleHash: sourceBundle.sourceBundleHash,
                        diff: {
                            ...pendingRemovalCandidate.diff,
                            removalObservation,
                        },
                    })
                    .where(eq(promotionCandidates.id, pendingRemovalCandidate.id))
                    .run();
                if (canAutomaticallyConfirmPromotionRemoval(removalObservation)) {
                    confirmPromotionRemoval(pendingRemovalCandidate.id, null, {
                        now,
                        automaticObservation: removalObservation,
                    });
                    incrementResult(collectionSourceId, 'autoExpired');
                } else {
                    scheduleVerification(collectionSourceId, removalObservation);
                }
                return;
            }
            const existing = db.select({ id: promotionCandidates.id })
                .from(promotionCandidates)
                .where(and(
                    eq(promotionCandidates.providerId, offer.providerId),
                    eq(promotionCandidates.sourceUrl, source.url),
                    eq(promotionCandidates.sourceHash, baseSourceHash),
                ))
                .get();
            const sourceHash = existing
                ? hashValue({
                    kind: 'missing-published-promotion',
                    promotionId: offer.id,
                    sourceBundleHash: sourceBundle.sourceBundleHash,
                    episodeStartedAt: now.toISOString(),
                })
                : baseSourceHash;
            const blockingError =
                `기존 게시 혜택이 최신 공식 source bundle에서 사라졌습니다: ${offer.title}`;
            const audit: PromotionCandidateAudit = {
                version: 1,
                summary: {
                    changedFields: 1,
                    highRiskChanges: 1,
                    coveredFields: 0,
                    missingFields: 0,
                },
                changes: [{
                    path: 'promotion',
                    kind: 'REMOVED',
                    risk: 'HIGH',
                    before: promotionForDiff(
                        toPromotionOffer(offer) as unknown as Record<string, unknown>
                    ),
                }],
                coverage: [],
                blockingErrors: [blockingError],
            };

            const removalObservation = createPromotionRemovalObservation(observationInput);
            db.transaction(() => {
                db.insert(promotionCandidates).values({
                    id: randomUUID(),
                    providerId: offer.providerId,
                    sourceUrl: source.url,
                    sourceHash,
                    sourceTitle: `${offer.title} 삭제 감지`,
                    rawContent: blockingError,
                    parsedOffer: promotionForDiff(
                        toPromotionOffer(offer) as unknown as Record<string, unknown>
                    ),
                    diff: {
                        collectionSourceId,
                        sourceKey,
                        structured: true,
                        removedFromSource: true,
                        changed: true,
                        fieldChanges: audit.changes,
                        auditSummary: audit.summary,
                        blockingErrors: audit.blockingErrors,
                        removalObservation,
                    },
                    sourceBundleHash: sourceBundle.sourceBundleHash,
                    audit,
                    status: 'PENDING',
                    linkedPromotionId: offer.id,
                    discoveredAt: now,
                }).run();
            });
            incrementResult(collectionSourceId, 'queued');
            scheduleVerification(collectionSourceId, removalObservation);
        });

    return resultBySource;
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
    promotionId: string,
    now: Date,
) {
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

function persistParsedPromotion(
    parsed: ParsedPromotion,
    now: Date,
    collectionSourceId: string,
    sourceBundle: PersistedPromotionSourceBundle,
) {
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
    const normalizedOffer = normalizePromotionDraft(parsed.offer);
    const parsedOffer = {
        ...normalizedOffer,
        startsAt: normalizedOffer.startsAt?.toISOString(),
        endsAt: normalizedOffer.endsAt?.toISOString(),
        collectedAt: now.toISOString(),
    } as Record<string, unknown>;
    const sourceHash = hashValue({
        sourceKey: parsed.sourceKey,
        offer: promotionForDiff(parsedOffer),
        evidence: parsed.evidence,
        semanticAnalysis: parsed.semanticAnalysis,
    });
    parsedOffer.sourceHash = sourceHash;
    const promotionId = autoPromotionId(parsed.offer.providerId, parsed.sourceKey);
    const previousCandidates = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, parsed.offer.providerId),
            eq(promotionCandidates.sourceUrl, parsed.offer.sourceUrl),
        ))
        .orderBy(desc(promotionCandidates.discoveredAt))
        .all();
    const pendingRemovalCandidates = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, parsed.offer.providerId),
            eq(promotionCandidates.status, 'PENDING'),
        ))
        .all();
    pendingRemovalCandidates
        .filter(candidate => removalCandidateMatchesObservedPromotion(candidate, {
            providerId: parsed.offer.providerId,
            promotionId,
            sourceKey: parsed.sourceKey,
            collectionSourceId,
        }))
        .forEach(candidate => {
            db.update(promotionCandidates)
                .set({
                    status: 'REJECTED',
                    diff: withPromotionCandidateResolution(
                        candidate.diff,
                        PROMOTION_CANDIDATE_RESOLUTION.REAPPEARED_IN_SOURCE,
                        {
                            resolvedAt: now,
                            sourceBundleHash: sourceBundle.sourceBundleHash,
                        },
                    ),
                    reviewedAt: now,
                })
                .where(eq(promotionCandidates.id, candidate.id))
                .run();
        });
    const previous = previousCandidates.find(candidate => (
        candidate.diff?.sourceKey === parsed.sourceKey &&
        !isPromotionRemovalCandidate(candidate)
    )) ?? previousCandidates.find(candidate => candidate.diff?.sourceKey === parsed.sourceKey);
    const stableOffer = db.select().from(promotionOffers)
        .where(eq(promotionOffers.id, promotionId))
        .get();
    const linkedOffer = !stableOffer && previous?.linkedPromotionId
        ? db.select().from(promotionOffers)
            .where(eq(promotionOffers.id, previous.linkedPromotionId))
            .get()
        : undefined;
    const existingOffer = stableOffer ?? linkedOffer;
    const baseline = existingOffer
        ? promotionForDiff(toPromotionOffer(existingOffer) as unknown as Record<string, unknown>)
        : previous
            ? promotionForDiff(previous.parsedOffer)
            : undefined;
    const audit = createPromotionCandidateAudit({
        candidate: promotionForDiff(parsedOffer),
        baseline,
        evidenceTexts: [
            ...(parsed.semanticAnalysis?.evidenceQuotes ?? []),
            parsed.evidence,
        ],
        documents: sourceBundle.documents.map(document => ({
            id: document.id,
            sourceUrl: document.sourceUrl,
            extractedText: document.extractedText,
        })),
    });
    const canAutoPublish = canAutomaticallyPublishPromotionCandidate({
        parserApproved: parsed.autoPublish,
        audit,
    });
    const existing = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, parsed.offer.providerId),
            eq(promotionCandidates.sourceUrl, parsed.offer.sourceUrl),
            eq(promotionCandidates.sourceHash, sourceHash),
        ))
        .get();

    if (existing) {
        const sourceBundleChanged = existing.sourceBundleHash !== sourceBundle.sourceBundleHash;
        const preserveReviewedApproval = shouldPreserveReviewedPromotionCandidate({
            candidateStatus: existing.status,
            reviewerId: existing.reviewerId,
            audit,
            linkedOfferStatus: existingOffer?.status,
            sourceHashMatches: existing.sourceHash === sourceHash,
        });
        const requiresReview = !canAutoPublish && !preserveReviewedApproval && (
            audit.blockingErrors.length > 0 ||
            !existing.reviewerId ||
            sourceBundleChanged
        );
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
                    sourceTitle: parsed.offer.title,
                    rawContent: parsed.evidence.slice(0, 120_000),
                    parsedOffer,
                    diff: {
                        ...existing.diff,
                        collectionSourceId,
                        autoPublished: canAutoPublish,
                        changed: audit.changes.length > 0,
                        fieldChanges: audit.changes,
                        auditSummary: audit.summary,
                        blockingErrors: audit.blockingErrors,
                    },
                    sourceBundleHash: sourceBundle.sourceBundleHash,
                    audit,
                    ...(requiresReview && {
                        status: 'PENDING' as const,
                        reviewerId: null,
                        reviewedAt: null,
                    }),
                    ...(canAutoPublish && existingOffer?.sourceHash === sourceHash && {
                        status: 'APPROVED' as const,
                        linkedPromotionId: promotionId,
                        reviewedAt: now,
                    }),
                })
                .where(eq(promotionCandidates.id, existing.id))
                .run();
        });
        if (canAutoPublish && (
            !existingOffer ||
            existingOffer.sourceHash !== sourceHash ||
            existingOffer.status === 'EXPIRED'
        )) {
            db.transaction(() => {
                upsertAutoPromotion(
                    parsed,
                    parsedOffer,
                    sourceHash,
                    existing.id,
                    existingOffer?.id ?? promotionId,
                    now,
                );
            });
            return { inserted: false, published: true, reviewRequired: false };
        }
        return {
            inserted: false,
            published: false,
            reviewRequired: requiresReview,
        };
    }

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
            sourceBundleHash: sourceBundle.sourceBundleHash,
            audit,
            diff: {
                collectionSourceId,
                sourceKey: parsed.sourceKey,
                structured: true,
                autoPublished: canAutoPublish,
                previousHash: previous?.sourceHash ?? null,
                changed: audit.changes.length > 0,
                fieldChanges: audit.changes,
                auditSummary: audit.summary,
                blockingErrors: audit.blockingErrors,
                linkedPromotionId: existingOffer?.id ?? previous?.linkedPromotionId ?? null,
                warnings: parsed.warnings,
                ...(parsed.semanticAnalysis && {
                    semanticAnalysis: parsed.semanticAnalysis,
                }),
            },
            status: canAutoPublish ? 'APPROVED' : 'PENDING',
            linkedPromotionId: existingOffer?.id ?? previous?.linkedPromotionId ?? null,
            discoveredAt: now,
            reviewedAt: canAutoPublish ? now : null,
        }).run();

        if (canAutoPublish) {
            upsertAutoPromotion(
                parsed,
                parsedOffer,
                sourceHash,
                candidateId,
                existingOffer?.id ?? promotionId,
                now,
            );
        }
    });

    return {
        inserted: true,
        published: canAutoPublish,
        reviewRequired: !canAutoPublish,
    };
}

function rejectMissingPendingCandidates(
    source: PromotionSource,
    parsed: ParsedPromotion[],
    sourceBundleHash: string,
    now: Date,
) {
    const observed = new Set(parsed.map(item => `${item.offer.providerId}:${item.sourceKey}`));
    const sourceUrls = new Set([source.url, ...(source.legacyUrls ?? [])]);

    db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.status, 'PENDING'))
        .all()
        .filter(candidate => {
            if (candidate.diff.removedFromSource === true) return false;
            const collectionSourceId = candidate.diff.collectionSourceId;
            if (typeof collectionSourceId === 'string') return collectionSourceId === source.id;
            if (candidate.diff.structured !== true) return false;
            if (source.id === 'naverpay-benefits' && candidate.providerId === 'naverpay') return true;
            return sourceUrls.has(candidate.sourceUrl);
        })
        .filter(candidate => shouldRejectPendingCandidateMissingFromSource(
            candidate,
            observed,
        ))
        .forEach(candidate => {
            db.update(promotionCandidates)
                .set({
                    status: 'REJECTED',
                    diff: withPromotionCandidateResolution(
                        candidate.diff,
                        PROMOTION_CANDIDATE_RESOLUTION.MISSING_FROM_LATEST_SOURCE,
                        { resolvedAt: now, sourceBundleHash },
                    ),
                    reviewedAt: now,
                })
                .where(eq(promotionCandidates.id, candidate.id))
                .run();
        });
}

export async function collectPromotionCandidates(
    options: { now?: Date } = {},
) {
    const currentTime = () => options.now ? new Date(options.now) : new Date();
    const startedAt = currentTime();
    const results: PromotionCollectionResult[] = [];
    const claimedAutoPromotionIds = new Set<string>();
    const observedAutoPromotionIds = new Set<string>();
    const successfulSourceIds = new Set<string>();
    const sourceBundles = new Map<string, PersistedPromotionSourceBundle>();
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
            rejectLegacyPlaceholders(source, currentTime());
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
            const sourceBytes = sourceData.documents.reduce(
                (sum, document) => sum + Buffer.byteLength(document.rawContent, 'utf8'),
                0,
            );
            if (sourceBytes > PROMOTION_BUNDLE_MAX_BYTES) {
                throw new Error('프로모션 source bundle이 허용 크기를 초과했습니다.');
            }
            const now = currentTime();
            const sourceBundle = persistPromotionSourceBundle(
                source.id,
                sourceData.documents,
                now,
            );
            sourceBundles.set(source.id, sourceBundle);
            const parsed = await classifyParsedPromotions(
                sourceData.promotions,
                semanticClassifier,
            );
            if (parsed.length === 0) {
                throw new Error('구조화 가능한 혜택을 찾지 못했습니다. 출처 형식 또는 브랜드 매핑을 확인해주세요.');
            }
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
                observedAutoPromotionIds.add(promotionId);
                if (claimedAutoPromotionIds.has(promotionId)) {
                    db.select().from(promotionCandidates)
                        .where(and(
                            eq(promotionCandidates.providerId, offer.offer.providerId),
                            eq(promotionCandidates.status, 'PENDING'),
                        ))
                        .all()
                        .filter(candidate => (
                            candidate.diff.collectionSourceId === source.id &&
                            candidate.diff.sourceKey === offer.sourceKey
                        ))
                        .forEach(candidate => {
                            db.update(promotionCandidates)
                                .set({ status: 'REJECTED', reviewedAt: now })
                                .where(eq(promotionCandidates.id, candidate.id))
                                .run();
                        });
                    unchanged += 1;
                    return;
                }
                const persisted = persistParsedPromotion(
                    offer,
                    now,
                    source.id,
                    sourceBundle,
                );
                claimedAutoPromotionIds.add(promotionId);
                if (persisted.inserted) discovered += 1;
                else unchanged += 1;
                if (persisted.published) published += 1;
                if (persisted.reviewRequired) reviewRequired += 1;
            });

            successfulSourceIds.add(source.id);
            rejectMissingPendingCandidates(
                source,
                parsed,
                sourceBundle.sourceBundleHash,
                now,
            );
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

    const removalResultsBySource = queueMissingAutoPromotions(
        successfulSourceIds,
        observedAutoPromotionIds,
        sourceBundles,
        currentTime(),
    );
    removalResultsBySource.forEach(({
        queued,
        autoExpired,
        removalVerificationAt,
    }, sourceId) => {
        const result = results.find(item => item.sourceId === sourceId);
        if (!result) return;
        result.reviewRequired += queued;
        result.expired += autoExpired;
        result.removalVerificationAt = removalVerificationAt;
        if (result.status === 'unchanged' && (queued > 0 || autoExpired > 0)) {
            result.status = 'created';
        }
        result.message = [
            result.message,
            queued > 0 ? `삭제 의심 ${queued}건 검수 대기` : undefined,
            autoExpired > 0 ? `삭제 확정 ${autoExpired}건 자동 만료` : undefined,
            removalVerificationAt
                ? `삭제 여부 ${new Date(removalVerificationAt).toLocaleString('ko-KR')} 자동 재확인`
                : undefined,
        ].filter(Boolean).join(' · ');
    });

    const finishedAt = currentTime();
    const summary = summarizePromotionCollectionRun(results);
    db.insert(promotionCollectionRuns).values({
        id: randomUUID(),
        ...summary,
        startedAt,
        finishedAt,
    }).run();

    return results;
}
