import { HttpError } from './api-server';
import type {
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
    const minPerformance = optionalNonNegativeInteger(
        value.minPerformance,
        '최소 실적',
        MAX_MONEY_AMOUNT
    );
    const manualCheckRequired = value.manualCheckRequired;
    const requiredNote = value.requiredNote;

    if (manualCheckRequired !== undefined && typeof manualCheckRequired !== 'boolean') {
        invalid('수동 확인 조건 값이 올바르지 않습니다.');
    }
    if (requiredNote !== undefined && typeof requiredNote !== 'string') {
        invalid('확인 메모 형식이 올바르지 않습니다.');
    }

    return {
        ...(minSpend !== undefined && { minSpend }),
        ...(minPerformance !== undefined && { minPerformance }),
        ...(manualCheckRequired !== undefined && { manualCheckRequired }),
        ...(requiredNote && { requiredNote: requiredNote.slice(0, 500) }),
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
    return {
        type: type as RuleAction['type'],
        value: amount,
        ...(maxDiscount !== undefined && { maxDiscount }),
    };
}

export function limitConfigValue(input: Input): LimitConfig {
    const value = input.limitConfig === undefined ? {} : objectValue(input.limitConfig, '혜택 한도');
    const dailyCount = optionalNonNegativeInteger(
        value.dailyCount,
        '일 사용 횟수',
        MAX_COUNT_LIMIT
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
        ...(monthlyCount !== undefined && { monthlyCount }),
        ...(yearlyCount !== undefined && { yearlyCount }),
        ...(monthlyAmount !== undefined && { monthlyAmount }),
    };
}
