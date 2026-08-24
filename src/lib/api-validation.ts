import { HttpError } from './api-server';
import type {
    CardNetwork,
    LimitConfig,
    LimitTableItem,
    PlatformType,
    RuleAction,
    RuleCondition,
} from '@/types';

type Input = Record<string, unknown>;

const MAX_MONEY_AMOUNT = 1_000_000_000_000;
const MAX_COUNT_LIMIT = 1_000_000;

function invalid(message: string): never {
    throw new HttpError(400, message);
}

export function requiredString(
    input: Input,
    key: string,
    label: string,
    maxLength = 200
) {
    const value = input[key];

    if (typeof value !== 'string' || !value.trim()) {
        invalid(`${label}을(를) 입력해주세요.`);
    }

    const normalized = value.trim();
    if (normalized.length > maxLength) {
        invalid(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
    }

    return normalized;
}

export function optionalString(
    input: Input,
    key: string,
    label: string,
    maxLength = 500
) {
    const value = input[key];
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') invalid(`${label} 형식이 올바르지 않습니다.`);

    const normalized = value.trim();
    if (normalized.length > maxLength) {
        invalid(`${label}은(는) ${maxLength}자 이하여야 합니다.`);
    }
    return normalized || undefined;
}

export function requiredInteger(
    input: Input,
    key: string,
    label: string,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const value = input[key];
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        invalid(`${label} 값이 올바르지 않습니다.`);
    }
    return value as number;
}

function optionalNonNegativeInteger(
    value: unknown,
    label: string,
    maximum = Number.MAX_SAFE_INTEGER
) {
    if (value === undefined || value === null || value === '') return undefined;
    if (
        !Number.isSafeInteger(value)
        || (value as number) < 0
        || (value as number) > maximum
    ) {
        invalid(`${label} 값이 올바르지 않습니다.`);
    }
    return value as number;
}

export function optionalInteger(
    input: Input,
    key: string,
    label: string,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const value = input[key];
    if (value === undefined || value === null || value === '') return undefined;
    if (
        !Number.isSafeInteger(value)
        || (value as number) < minimum
        || (value as number) > maximum
    ) {
        invalid(`${label} 값이 올바르지 않습니다.`);
    }
    return value as number;
}

function objectValue(value: unknown, label: string): Input {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        invalid(`${label} 형식이 올바르지 않습니다.`);
    }
    return value as Input;
}

export function stringArray(input: Input, key: string, label: string) {
    const value = input[key];
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > 500) {
        invalid(`${label} 형식이 올바르지 않습니다.`);
    }

    const result = value.map((item) => {
        if (typeof item !== 'string' || !item.trim() || item.length > 200) {
            invalid(`${label} 형식이 올바르지 않습니다.`);
        }
        return item;
    });

    return [...new Set(result)];
}

export function booleanValue(input: Input, key: string, fallback: boolean) {
    const value = input[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') invalid(`${key} 값이 올바르지 않습니다.`);
    return value;
}

export function platformValue(input: Input): PlatformType {
    const value = input.platformType ?? 'ALL';
    if (!['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'].includes(String(value))) {
        invalid('결제 채널 값이 올바르지 않습니다.');
    }
    return value as PlatformType;
}

export function cardNetworkValue(input: Input): CardNetwork | undefined {
    const value = input.network;
    if (value === undefined || value === null || value === '') return undefined;
    if (!['DOMESTIC', 'MASTERCARD', 'VISA', 'AMEX', 'UNIONPAY', 'OTHER']
        .includes(String(value))) {
        invalid('카드 브랜드 값이 올바르지 않습니다.');
    }
    return value as CardNetwork;
}

export function limitTableValue(input: Input): LimitTableItem[] {
    const value = input.limitTable;
    if (!Array.isArray(value) || value.length > 50) {
        invalid('실적 구간 형식이 올바르지 않습니다.');
    }

    return value.map((item) => {
        const row = objectValue(item, '실적 구간');
        return {
            threshold: requiredInteger(row, 'threshold', '실적 기준', 0, MAX_MONEY_AMOUNT),
            limit: requiredInteger(row, 'limit', '할인 한도', 0, MAX_MONEY_AMOUNT),
        };
    });
}

export function ruleConditionValue(input: Input): RuleCondition {
    const value = input.condition === undefined ? {} : objectValue(input.condition, '혜택 조건');
    const minSpend = optionalNonNegativeInteger(
        value.minSpend,
        '최소 결제 금액',
        MAX_MONEY_AMOUNT
    );
    const maxSpend = optionalNonNegativeInteger(
        value.maxSpend,
        '최대 결제 금액',
        MAX_MONEY_AMOUNT
    );
    const maxSpendExclusive = optionalNonNegativeInteger(
        value.maxSpendExclusive,
        '미만 결제 금액',
        MAX_MONEY_AMOUNT
    );
    const minPerformance = optionalNonNegativeInteger(
        value.minPerformance,
        '최소 실적',
        MAX_MONEY_AMOUNT
    );
    const dateValue = (raw: unknown, label: string) => {
        if (raw === undefined || raw === null || raw === '') return undefined;
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            invalid(`${label} 값이 올바르지 않습니다.`);
        }
        const parsed = new Date(`${raw}T00:00:00Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
            invalid(`${label} 값이 올바르지 않습니다.`);
        }
        return raw;
    };
    const startsAt = dateValue(value.startsAt, '혜택 시작일');
    const endsAt = dateValue(value.endsAt, '혜택 종료일');
    if (startsAt && endsAt && startsAt > endsAt) {
        invalid('혜택 시작일은 종료일보다 늦을 수 없습니다.');
    }
    const manualCheckRequired = value.manualCheckRequired;
    const confirmationRequired = value.confirmationRequired;
    const requiredNote = value.requiredNote;
    const itemSpecific = value.itemSpecific;
    const eligibleItemSummary = value.eligibleItemSummary;
    const requiredCardNetwork = value.requiredCardNetwork;
    const performanceWaiver = value.performanceWaiver;
    const stackableWithRuleIds = value.stackableWithRuleIds;
    const applicationOrder = optionalNonNegativeInteger(
        value.applicationOrder,
        '혜택 적용 순서',
        1_000,
    );

    if (manualCheckRequired !== undefined && typeof manualCheckRequired !== 'boolean') {
        invalid('수동 확인 조건 값이 올바르지 않습니다.');
    }
    if (confirmationRequired !== undefined && typeof confirmationRequired !== 'boolean') {
        invalid('사용자 확인 조건 값이 올바르지 않습니다.');
    }
    if (requiredNote !== undefined && typeof requiredNote !== 'string') {
        invalid('확인 메모 형식이 올바르지 않습니다.');
    }
    if (itemSpecific !== undefined && typeof itemSpecific !== 'boolean') {
        invalid('특정 상품 조건 값이 올바르지 않습니다.');
    }
    if (eligibleItemSummary !== undefined && typeof eligibleItemSummary !== 'string') {
        invalid('혜택 대상 상품 설명이 올바르지 않습니다.');
    }
    if (itemSpecific === true && !String(eligibleItemSummary ?? '').trim()) {
        invalid('특정 상품 혜택에는 대상 상품 설명이 필요합니다.');
    }
    if (minSpend !== undefined && maxSpend !== undefined && minSpend > maxSpend) {
        invalid('최소 결제 금액은 최대 결제 금액보다 클 수 없습니다.');
    }
    if (minSpend !== undefined && maxSpendExclusive !== undefined &&
        minSpend >= maxSpendExclusive) {
        invalid('최소 결제 금액은 미만 결제 금액보다 작아야 합니다.');
    }
    if (requiredCardNetwork !== undefined && ![
        'DOMESTIC',
        'MASTERCARD',
        'VISA',
        'AMEX',
        'UNIONPAY',
        'OTHER',
    ].includes(String(requiredCardNetwork))) {
        invalid('필수 카드 브랜드 값이 올바르지 않습니다.');
    }
    if (performanceWaiver !== undefined && performanceWaiver !== 'NEW_CARD_REGISTRATION_WINDOW') {
        invalid('실적 면제 조건 값이 올바르지 않습니다.');
    }
    if (stackableWithRuleIds !== undefined && (
        !Array.isArray(stackableWithRuleIds) ||
        stackableWithRuleIds.some(item => typeof item !== 'string' || !item.trim())
    )) {
        invalid('중복 적용 혜택 목록이 올바르지 않습니다.');
    }

    return {
        ...(minSpend !== undefined && { minSpend }),
        ...(maxSpend !== undefined && { maxSpend }),
        ...(maxSpendExclusive !== undefined && { maxSpendExclusive }),
        ...(minPerformance !== undefined && { minPerformance }),
        ...(startsAt && { startsAt }),
        ...(endsAt && { endsAt }),
        ...(requiredCardNetwork !== undefined && {
            requiredCardNetwork: requiredCardNetwork as RuleCondition['requiredCardNetwork'],
        }),
        ...(performanceWaiver !== undefined && {
            performanceWaiver: performanceWaiver as RuleCondition['performanceWaiver'],
        }),
        ...(confirmationRequired !== undefined && { confirmationRequired }),
        ...(stackableWithRuleIds !== undefined && {
            stackableWithRuleIds: [...new Set(stackableWithRuleIds as string[])],
        }),
        ...(applicationOrder !== undefined && { applicationOrder }),
        ...(manualCheckRequired !== undefined && { manualCheckRequired }),
        ...(requiredNote && { requiredNote: requiredNote.slice(0, 500) }),
        ...(itemSpecific !== undefined && { itemSpecific }),
        ...(eligibleItemSummary && {
            eligibleItemSummary: eligibleItemSummary.slice(0, 500),
        }),
    };
}

export function ruleActionValue(input: Input): RuleAction {
    const value = objectValue(input.action, '혜택 계산식');
    const type = value.type;
    const amount = value.value;

    if (!['PERCENT', 'FLAT', 'FIXED_PRICE'].includes(String(type))) {
        invalid('혜택 계산 방식이 올바르지 않습니다.');
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        invalid('혜택 값이 올바르지 않습니다.');
    }

    if (type === 'PERCENT' && amount > 100) {
        invalid('할인율은 100% 이하여야 합니다.');
    }

    if (
        type !== 'PERCENT'
        && (!Number.isSafeInteger(amount) || amount > MAX_MONEY_AMOUNT)
    ) {
        invalid('정액 혜택 값이 올바르지 않습니다.');
    }

    const maxDiscount = optionalNonNegativeInteger(
        value.maxDiscount,
        '건별 최대 할인',
        MAX_MONEY_AMOUNT
    );
    const amountBasis = value.amountBasis;
    if (amountBasis !== undefined && !['ORIGINAL_AMOUNT', 'REMAINING_AMOUNT']
        .includes(String(amountBasis))) {
        invalid('혜택 계산 기준 값이 올바르지 않습니다.');
    }
    return {
        type: type as RuleAction['type'],
        value: amount,
        ...(maxDiscount !== undefined && { maxDiscount }),
        ...(amountBasis !== undefined && {
            amountBasis: amountBasis as RuleAction['amountBasis'],
        }),
    };
}

export function limitConfigValue(input: Input): LimitConfig {
    const value = input.limitConfig === undefined ? {} : objectValue(input.limitConfig, '혜택 한도');
    const dailyCount = optionalNonNegativeInteger(
        value.dailyCount,
        '일 사용 횟수',
        MAX_COUNT_LIMIT
    );
    const dailyAmount = optionalNonNegativeInteger(
        value.dailyAmount,
        '일 할인 한도',
        MAX_MONEY_AMOUNT
    );
    const monthlyCount = optionalNonNegativeInteger(
        value.monthlyCount,
        '월 사용 횟수',
        MAX_COUNT_LIMIT
    );
    const yearlyCount = optionalNonNegativeInteger(
        value.yearlyCount,
        '연 사용 횟수',
        MAX_COUNT_LIMIT
    );
    const monthlyAmount = optionalNonNegativeInteger(
        value.monthlyAmount,
        '월 할인 한도',
        MAX_MONEY_AMOUNT
    );

    return {
        ...(dailyCount !== undefined && { dailyCount }),
        ...(dailyAmount !== undefined && { dailyAmount }),
        ...(monthlyCount !== undefined && { monthlyCount }),
        ...(yearlyCount !== undefined && { yearlyCount }),
        ...(monthlyAmount !== undefined && { monthlyAmount }),
    };
}
