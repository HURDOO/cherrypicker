import { and, asc, eq, isNull, max } from 'drizzle-orm';
import { db } from '@/db';
import { brands, categories } from '@/db/schema';
import { toBrand } from './db-mappers';
import { SystemCardOnboardingError } from './system-card-onboarding';

const BRAND_ID_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;
const ICON_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
const MAX_BATCH_SIZE = 20;

export type SystemBrandDraftInput = {
    id: string;
    name: string;
    categoryId: string;
    iconName?: string;
};

const requiredText = (
    input: Record<string, unknown>,
    key: string,
    label: string,
    maximumLength: number,
) => {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) {
        throw new SystemCardOnboardingError(400, `${label}을(를) 입력해주세요.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maximumLength) {
        throw new SystemCardOnboardingError(
            400,
            `${label}은(는) ${maximumLength}자 이하여야 합니다.`,
        );
    }
    return trimmed;
};

const parseSystemBrandDraftInput = (input: Record<string, unknown>): SystemBrandDraftInput => {
    const id = requiredText(input, 'id', '결제처 ID', 64).toLocaleLowerCase('en-US');
    if (!BRAND_ID_PATTERN.test(id)) {
        throw new SystemCardOnboardingError(
            400,
            '결제처 ID는 영문 소문자로 시작하고 영문 소문자·숫자·밑줄만 사용할 수 있습니다.',
        );
    }
    const iconName = typeof input.iconName === 'string' && input.iconName.trim()
        ? input.iconName.trim()
        : undefined;
    if (iconName && !ICON_NAME_PATTERN.test(iconName)) {
        throw new SystemCardOnboardingError(400, '아이콘 이름이 올바르지 않습니다.');
    }
    return {
        id,
        name: requiredText(input, 'name', '결제처 이름', 120),
        categoryId: requiredText(input, 'categoryId', '카테고리 ID', 64),
        ...(iconName && { iconName }),
    };
};

export function parseSystemBrandDraftBatchInput(input: Record<string, unknown>) {
    const values = Array.isArray(input.brands) ? input.brands : [input];
    if (values.length < 1 || values.length > MAX_BATCH_SIZE ||
        values.some(value => !value || typeof value !== 'object' || Array.isArray(value))) {
        throw new SystemCardOnboardingError(
            400,
            `공개 결제처는 한 번에 1개 이상 ${MAX_BATCH_SIZE}개 이하로 등록해주세요.`,
        );
    }
    return values.map(value => parseSystemBrandDraftInput(value as Record<string, unknown>));
}

const normalizedName = (value: string) => value.normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, ' ')
    .trim();

export function createSystemBrandDraftBatch(inputs: SystemBrandDraftInput[]) {
    const inputIds = new Set<string>();
    const inputNames = new Set<string>();
    inputs.forEach(input => {
        if (inputIds.has(input.id)) {
            throw new SystemCardOnboardingError(409, `결제처 ID ${input.id}가 중복되었습니다.`);
        }
        inputIds.add(input.id);
        const nameKey = `${input.categoryId}\u0000${normalizedName(input.name)}`;
        if (inputNames.has(nameKey)) {
            throw new SystemCardOnboardingError(409, `결제처 이름 ${input.name}이 중복되었습니다.`);
        }
        inputNames.add(nameKey);
    });

    const systemCategories = new Set(db.select({ id: categories.id })
        .from(categories)
        .where(isNull(categories.userId))
        .all()
        .map(row => row.id));
    inputs.forEach(input => {
        if (!systemCategories.has(input.categoryId)) {
            throw new SystemCardOnboardingError(
                400,
                `공개 카테고리 ${input.categoryId}가 존재하지 않습니다.`,
            );
        }
    });

    const existing = db.select({
        id: brands.id,
        name: brands.name,
        categoryId: brands.categoryId,
    }).from(brands).where(isNull(brands.userId)).all();
    inputs.forEach(input => {
        if (existing.some(row => row.id === input.id)) {
            throw new SystemCardOnboardingError(409, `결제처 ID ${input.id}가 이미 존재합니다.`);
        }
        if (existing.some(row => row.categoryId === input.categoryId &&
            normalizedName(row.name) === normalizedName(input.name))) {
            throw new SystemCardOnboardingError(
                409,
                `같은 카테고리에 결제처 ${input.name}이 이미 존재합니다.`,
            );
        }
    });

    const nextSortOrder = new Map<string, number>();
    inputs.forEach(input => {
        if (nextSortOrder.has(input.categoryId)) return;
        const last = db.select({ value: max(brands.sortOrder) })
            .from(brands)
            .where(and(
                eq(brands.categoryId, input.categoryId),
                isNull(brands.userId),
            ))
            .get();
        nextSortOrder.set(input.categoryId, (last?.value ?? -1) + 1);
    });
    const rows = db.transaction(tx => inputs.map(input => {
        const sortOrder = nextSortOrder.get(input.categoryId) ?? 0;
        nextSortOrder.set(input.categoryId, sortOrder + 1);
        return tx.insert(brands).values({
            ...input,
            iconName: input.iconName ?? 'ShoppingBag',
            userId: null,
            sortOrder,
        }).returning().get();
    }));
    return rows.map(toBrand);
}

export function getSystemBrandRegistryData() {
    return {
        categories: db.select({ id: categories.id, name: categories.name })
            .from(categories)
            .where(isNull(categories.userId))
            .orderBy(asc(categories.sortOrder), asc(categories.name))
            .all(),
        brands: db.select().from(brands)
            .where(isNull(brands.userId))
            .orderBy(asc(brands.categoryId), asc(brands.sortOrder), asc(brands.name))
            .all()
            .map(toBrand),
    };
}
