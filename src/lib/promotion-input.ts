import { HttpError } from './api-server';
import type { promotionOffers } from '@/db/schema';
import type {
    BenefitCertainty,
    BenefitLayer,
    FundingType,
    LimitConfig,
    PromotionAction,
    PromotionChannel,
    PromotionCompatibility,
    PromotionCondition,
    PromotionOffer,
} from '@/types';

type Input = Record<string, unknown>;

const layers: BenefitLayer[] = ['DISCOUNT', 'PAY', 'PAYMENT_METHOD', 'POST_REWARD'];
const certainties: BenefitCertainty[] = ['CONFIRMED', 'CONDITIONAL', 'ESTIMATED'];
const channels: PromotionChannel[] = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'];
const fundingTypes: FundingType[] = ['CARD', 'MONEY', 'POINTS', 'GIFT_CERTIFICATE'];
const actionTypes = [
    'PERCENT',
    'FLAT',
    'FIXED_PRICE',
    'POINTS',
    'CASHBACK',
    'GIFT_CERTIFICATE',
] as const;
const amountBases = [
    'ORIGINAL_AMOUNT',
    'REMAINING_AMOUNT',
    'ELIGIBLE_ITEM_AMOUNT',
    'FINAL_APPROVED_AMOUNT',
] as const;

const record = (value: unknown, label: string): Input => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
    }
    return value as Input;
};

const string = (value: unknown, label: string, maxLength = 500) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, `${label}을(를) 입력해주세요.`);
    }
    return value.trim().slice(0, maxLength);
};

const stringList = (value: unknown, label: string, max = 500) => {
    if (!Array.isArray(value) || value.length > max ||
        value.some(item => typeof item !== 'string')) {
        throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
    }
    return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
};

const optionalNumber = (value: unknown, label: string, max = 1_000_000_000_000) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
        throw new HttpError(400, `${label} 값이 올바르지 않습니다.`);
    }
    return Math.floor(value);
};

const boolean = (value: unknown, fallback = false) =>
    value === undefined ? fallback : Boolean(value);

const optionalDate = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === '') return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, `${label} 형식이 올바르지 않습니다.`);
    }
    return date;
};

export type NormalizedPromotionDraft = Omit<
    typeof promotionOffers.$inferInsert,
    'id' | 'status' | 'createdAt' | 'updatedAt' | 'reviewedAt' | 'publishedAt'
>;

export function normalizePromotionDraft(value: unknown): NormalizedPromotionDraft {
    const input = record(value, '프로모션');
    const layer = string(input.layer, '혜택 단계') as BenefitLayer;
    const certainty = string(input.certainty, '신뢰도') as BenefitCertainty;
    if (!layers.includes(layer)) throw new HttpError(400, '혜택 단계가 올바르지 않습니다.');
    if (!certainties.includes(certainty)) throw new HttpError(400, '신뢰도가 올바르지 않습니다.');

    const rawChannels = stringList(input.channels ?? ['ALL'], '결제 채널') as PromotionChannel[];
    if (rawChannels.some(channel => !channels.includes(channel))) {
        throw new HttpError(400, '결제 채널이 올바르지 않습니다.');
    }

    const actionInput = record(input.action, '혜택 계산식');
    const actionType = string(actionInput.type, '혜택 계산 방식') as PromotionAction['type'];
    if (!actionTypes.includes(actionType)) {
        throw new HttpError(400, '혜택 계산 방식이 올바르지 않습니다.');
    }
    const action: PromotionAction = {
        type: actionType,
        value: optionalNumber(actionInput.value, '혜택 값') ?? 0,
        ...(optionalNumber(actionInput.maxBenefit, '최대 혜택') !== undefined && {
            maxBenefit: optionalNumber(actionInput.maxBenefit, '최대 혜택'),
        }),
        ...(optionalNumber(actionInput.faceValue, '상품권 액면가') !== undefined && {
            faceValue: optionalNumber(actionInput.faceValue, '상품권 액면가'),
        }),
    };

    const conditionInput = record(input.condition ?? {}, '혜택 조건');
    const amountBasis = String(conditionInput.amountBasis ?? 'REMAINING_AMOUNT');
    if (!amountBases.includes(amountBasis as typeof amountBases[number])) {
        throw new HttpError(400, '금액 기준이 올바르지 않습니다.');
    }
    const condition: PromotionCondition = {
        amountBasis: amountBasis as PromotionCondition['amountBasis'],
        ...(optionalNumber(conditionInput.minSpend, '최소 결제금액') !== undefined && {
            minSpend: optionalNumber(conditionInput.minSpend, '최소 결제금액'),
        }),
        telecomTiers: stringList(conditionInput.telecomTiers ?? [], '통신사 등급', 100),
        requiresCoupon: boolean(conditionInput.requiresCoupon),
        requiresEnrollment: boolean(conditionInput.requiresEnrollment),
        firstPaymentOnly: boolean(conditionInput.firstPaymentOnly),
        manualCheckRequired: boolean(conditionInput.manualCheckRequired),
        ...(conditionInput.requiredNote ? {
            requiredNote: string(conditionInput.requiredNote, '확인 메모', 1000),
        } : {}),
        itemSpecific: boolean(conditionInput.itemSpecific),
    };

    const compatibilityInput = record(input.compatibility ?? {}, '중복 조건');
    const allowedFundingTypes = stringList(
        compatibilityInput.allowedFundingTypes ?? [],
        '결제수단',
        20
    ) as FundingType[];
    if (allowedFundingTypes.some(item => !fundingTypes.includes(item))) {
        throw new HttpError(400, '결제수단 조건이 올바르지 않습니다.');
    }
    const compatibility: PromotionCompatibility = {
        requiredPayProviderIds: stringList(
            compatibilityInput.requiredPayProviderIds ?? [],
            '필수 페이',
            20
        ),
        allowedFundingTypes,
        excludedPromotionIds: stringList(
            compatibilityInput.excludedPromotionIds ?? [],
            '중복 제외 혜택',
            200
        ),
        ...(compatibilityInput.exclusiveGroup ? {
            exclusiveGroup: string(compatibilityInput.exclusiveGroup, '배타 그룹', 200),
        } : {}),
        allowStackWithSameLayer: boolean(compatibilityInput.allowStackWithSameLayer),
        blocksCardBenefit: boolean(compatibilityInput.blocksCardBenefit),
        allowResidualPayment: boolean(compatibilityInput.allowResidualPayment),
    };

    const limitInput = record(input.limitConfig ?? {}, '한도 조건');
    const limitConfig: LimitConfig = {
        ...(optionalNumber(limitInput.dailyCount, '일 횟수', 1_000_000) !== undefined && {
            dailyCount: optionalNumber(limitInput.dailyCount, '일 횟수', 1_000_000),
        }),
        ...(optionalNumber(limitInput.monthlyCount, '월 횟수', 1_000_000) !== undefined && {
            monthlyCount: optionalNumber(limitInput.monthlyCount, '월 횟수', 1_000_000),
        }),
        ...(optionalNumber(limitInput.yearlyCount, '연 횟수', 1_000_000) !== undefined && {
            yearlyCount: optionalNumber(limitInput.yearlyCount, '연 횟수', 1_000_000),
        }),
        ...(optionalNumber(limitInput.monthlyAmount, '월 혜택 한도') !== undefined && {
            monthlyAmount: optionalNumber(limitInput.monthlyAmount, '월 혜택 한도'),
        }),
    };

    const startsAt = optionalDate(input.startsAt, '시작일');
    const endsAt = optionalDate(input.endsAt, '종료일');
    if (startsAt && endsAt && startsAt > endsAt) {
        throw new HttpError(400, '행사 종료일은 시작일보다 빨라서는 안 됩니다.');
    }

    return {
        providerId: string(input.providerId, '제공자', 200),
        layer,
        title: string(input.title, '혜택명', 300),
        description: typeof input.description === 'string'
            ? input.description.trim().slice(0, 2000)
            : '',
        brandIds: stringList(input.brandIds ?? [], '대상 브랜드'),
        categoryIds: stringList(input.categoryIds ?? [], '대상 카테고리'),
        channels: rawChannels,
        startsAt: startsAt ?? null,
        endsAt: endsAt ?? null,
        action,
        condition,
        compatibility,
        limitConfig,
        certainty,
        sourceUrl: string(input.sourceUrl, '출처 URL', 2000),
        sourceHash: typeof input.sourceHash === 'string' ? input.sourceHash : null,
        collectedAt: input.collectedAt ? new Date(String(input.collectedAt)) : null,
    };
}

export function promotionToEditableJson(offer: PromotionOffer) {
    return {
        ...offer,
        startsAt: offer.startsAt?.slice(0, 10) ?? '',
        endsAt: offer.endsAt?.slice(0, 10) ?? '',
    };
}
