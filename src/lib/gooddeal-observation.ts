import { createHash } from 'node:crypto';
import { HttpError } from '@/lib/http-error';
import type { PromotionSourceDocumentMetadata } from '@/types';
import {
    normalizeOfficialBrandName,
    resolveOfficialBrand,
    type ParsedPromotion,
} from './promotion-parsers';
import type { CollectedPromotionSourceDocument } from './promotion-source-bundle';

/**
 * KakaoPay GoodDeal rates read on the owner's phone by the observer app
 * (`experiments/kakaopay-gooddeal-observer`). See the app observation rules in
 * `docs/promotion-source-policy.md`.
 */
export const GOODDEAL_SOURCE_ID = 'kakaopay-gooddeal';
export const GOODDEAL_PROVIDER_ID = 'kakaopay-gooddeal';
export const GOODDEAL_HOME_URL = 'https://good-deal-web.kakaopay.com/home/all';

// Observer parser versions whose list rule was checked on the device. v1 mixed in the carousel.
const KNOWN_PARSER_VERSIONS = new Set([2]);
const MAX_OBSERVATION_AGE_MS = 24 * 60 * 60 * 1_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const FIRST_ITEM_COUNT = { min: 50, max: 300 };
const ITEM_COUNT_TOLERANCE = 0.1;
const MIN_BRAND_RETENTION = 0.95;
const RATE_RANGE = { min: 1, max: 50 };
const MAX_ITEMS = 500;
const MAX_BRAND_LENGTH = 60;
const MAX_STRUCTURE_LINES = 50;
const MAX_STRUCTURE_LINE_LENGTH = 300;
const PERSONAL_MARKERS = ['님', '최근 결제'];
// The observer's structure lines are ASCII apart from the badge word it may print.
const STRUCTURE_LINE = /^[\x20-\x7e]*$/;

export interface GoodDealObservation {
    observedAt: Date;
    kakaopayVersion: string | null;
    parserVersion: number;
    items: Array<{ brand: string; rate: number }>;
    structure: string[];
}

export interface GoodDealGateInput {
    now: Date;
    /** Brands of the last observation that passed the gate, if any. */
    previousBrands?: string[];
    /** Latest observation time already stored, passed or not. */
    latestObservedAt?: Date;
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const badRequest = (message: string) => new HttpError(400, message);

/** Validates an upload from the observer app. Only successful observations are accepted. */
export function parseGoodDealUpload(body: Record<string, unknown>): GoodDealObservation {
    if (body.status !== 'ok') throw badRequest('성공한 관측만 올릴 수 있습니다.');
    if (typeof body.observedAt !== 'string') throw badRequest('관측 시각이 필요합니다.');
    const observedAt = new Date(body.observedAt);
    if (Number.isNaN(observedAt.getTime())) throw badRequest('관측 시각이 올바르지 않습니다.');
    if (!Number.isSafeInteger(body.parserVersion)) throw badRequest('파서 버전이 필요합니다.');
    if (body.kakaopayVersion !== null && typeof body.kakaopayVersion !== 'string') {
        throw badRequest('카카오페이 버전이 올바르지 않습니다.');
    }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_ITEMS) {
        throw badRequest('할인 항목 목록이 올바르지 않습니다.');
    }
    const items = body.items.map(item => {
        if (!isRecord(item) || typeof item.brand !== 'string' || typeof item.rate !== 'number') {
            throw badRequest('할인 항목 형식이 올바르지 않습니다.');
        }
        const brand = item.brand.trim();
        if (!brand || brand.length > MAX_BRAND_LENGTH || !Number.isFinite(item.rate)) {
            throw badRequest('할인 항목 형식이 올바르지 않습니다.');
        }
        // The phone drops these; seeing one means the upload is not what the app should send.
        if (PERSONAL_MARKERS.some(marker => brand.includes(marker))) {
            throw badRequest('개인 표시가 있는 항목은 받을 수 없습니다.');
        }
        return { brand, rate: item.rate };
    });
    const structure = body.structure ?? [];
    if (
        !Array.isArray(structure) ||
        structure.length > MAX_STRUCTURE_LINES ||
        structure.some(line => (
            typeof line !== 'string' ||
            line.length > MAX_STRUCTURE_LINE_LENGTH ||
            !STRUCTURE_LINE.test(line.replaceAll('혜택', ''))
        ))
    ) {
        throw badRequest('구조 요약이 올바르지 않습니다.');
    }
    return {
        observedAt,
        kakaopayVersion: body.kakaopayVersion as string | null,
        parserVersion: body.parserVersion as number,
        items,
        structure: structure as string[],
    };
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Reasons the observation must not change the catalog; empty when it may be applied. */
export function checkGoodDealGate(observation: GoodDealObservation, input: GoodDealGateInput) {
    const reasons: string[] = [];
    const observedAt = observation.observedAt.getTime();
    const now = input.now.getTime();
    if (!KNOWN_PARSER_VERSIONS.has(observation.parserVersion)) {
        reasons.push(`알 수 없는 파서 버전입니다: v${observation.parserVersion}`);
    }
    if (observedAt > now + MAX_CLOCK_SKEW_MS) reasons.push('관측 시각이 미래입니다.');
    if (now - observedAt > MAX_OBSERVATION_AGE_MS) reasons.push('관측한 지 24시간이 지났습니다.');
    if (input.latestObservedAt && observedAt <= input.latestObservedAt.getTime()) {
        reasons.push('이미 받은 관측보다 오래된 기록입니다.');
    }

    const names = observation.items.map(item => normalizeOfficialBrandName(item.brand));
    const duplicates = [...new Set(observation.items
        .filter((_, index) => names.indexOf(names[index]) !== index)
        .map(item => item.brand))];
    if (duplicates.length > 0) reasons.push(`같은 브랜드가 두 번 있습니다: ${duplicates.join(', ')}`);
    const outOfRange = observation.items.filter(item => (
        item.rate < RATE_RANGE.min || item.rate > RATE_RANGE.max
    ));
    if (outOfRange.length > 0) {
        reasons.push(`할인율이 ${RATE_RANGE.min}~${RATE_RANGE.max}% 밖입니다: ${outOfRange
            .map(item => `${item.brand} ${item.rate}%`).join(', ')}`);
    }

    const count = observation.items.length;
    const previous = input.previousBrands;
    if (!previous || previous.length === 0) {
        if (count < FIRST_ITEM_COUNT.min || count > FIRST_ITEM_COUNT.max) {
            reasons.push(`첫 반영 항목 수가 ${FIRST_ITEM_COUNT.min}~${FIRST_ITEM_COUNT.max}개 밖입니다: ${count}개`);
        }
        return reasons;
    }
    if (Math.abs(count - previous.length) > previous.length * ITEM_COUNT_TOLERANCE) {
        reasons.push(`항목 수가 직전 반영본(${previous.length}개)과 ${percent(ITEM_COUNT_TOLERANCE)} 넘게 다릅니다: ${count}개`);
    }
    const observed = new Set(names);
    const previousNames = [...new Set(previous.map(normalizeOfficialBrandName))];
    const retention = previousNames.filter(name => observed.has(name)).length / previousNames.length;
    if (retention < MIN_BRAND_RETENTION) {
        reasons.push(`직전 반영 브랜드 중 ${percent(retention)}만 남았습니다.`);
    }
    return reasons;
}

const evidenceText = (item: { brand: string; rate: number }) => `${item.brand} ${item.rate}% 할인`;

/** The stored evidence: the upload as received, with one `브랜드 N% 할인` line per item. */
export function goodDealSourceDocument(
    observation: GoodDealObservation,
    gateReasons: string[],
): CollectedPromotionSourceDocument {
    const rawContent = JSON.stringify({
        observedAt: observation.observedAt.toISOString(),
        kakaopayVersion: observation.kakaopayVersion,
        parserVersion: observation.parserVersion,
        items: observation.items,
        structure: observation.structure,
    });
    const responseMetadata: PromotionSourceDocumentMetadata = {
        contentType: 'application/json',
        appObservation: {
            app: 'com.kakaopay.app',
            appVersion: observation.kakaopayVersion,
            parserVersion: observation.parserVersion,
            observedAt: observation.observedAt.toISOString(),
            itemCount: observation.items.length,
            gate: { passed: gateReasons.length === 0, reasons: gateReasons },
        },
    };
    return {
        sourceUrl: GOODDEAL_HOME_URL,
        mediaType: 'application/json',
        rawContent,
        extractedText: observation.items.map(evidenceText).join('\n'),
        contentHash: createHash('sha256').update(rawContent).digest('hex'),
        responseMetadata,
    };
}

/** Brands of a stored GoodDeal document, for comparing the next upload against it. */
export function goodDealDocumentBrands(rawContent: string): string[] {
    try {
        const value: unknown = JSON.parse(rawContent);
        if (!isRecord(value) || !Array.isArray(value.items)) return [];
        return value.items.flatMap(item => (
            isRecord(item) && typeof item.brand === 'string' ? [item.brand] : []
        ));
    } catch {
        return [];
    }
}

export const goodDealSourceKey = (brand: string) => `gooddeal:${normalizeOfficialBrandName(brand)}`;

/**
 * One information-only offer per brand. Daily limits and periods are only on the brand detail
 * screen, which the observer does not open, so the rate never enters a computed total.
 */
export function goodDealPromotions(observation: GoodDealObservation): ParsedPromotion[] {
    return observation.items.map(item => {
        const resolved = resolveOfficialBrand(item.brand)!;
        const sourceKey = goodDealSourceKey(item.brand);
        return {
            sourceKey,
            evidence: evidenceText(item),
            autoPublish: true,
            warnings: [],
            semanticScopeLocked: true,
            ...(resolved.discoveredBrand && { discoveredBrand: resolved.discoveredBrand }),
            offer: {
                providerId: GOODDEAL_PROVIDER_ID,
                layer: 'PAY',
                title: evidenceText(item),
                description: '카카오페이 굿딜 홈에서 관측한 할인율입니다. 상품권의 하루 한도와 기간은 확인하지 않았습니다.',
                brandIds: [resolved.id],
                categoryIds: [],
                // GoodDeal vouchers are barcodes shown at the counter.
                channels: ['OFFLINE'],
                action: { type: 'PERCENT', value: item.rate },
                condition: {
                    amountBasis: 'REMAINING_AMOUNT',
                    applicabilityScope: 'STORE_WIDE',
                    calculationMode: 'INFORMATION_ONLY',
                    requiredNote: '굿딜 상품권의 하루 한도와 기간을 확인하지 않아 금액 계산에서 제외합니다.',
                },
                compatibility: {
                    requiredPayProviderIds: [GOODDEAL_PROVIDER_ID],
                    exclusiveGroup: sourceKey,
                },
                limitConfig: {},
                certainty: 'CONDITIONAL',
                sourceUrl: GOODDEAL_HOME_URL,
            },
        };
    });
}
