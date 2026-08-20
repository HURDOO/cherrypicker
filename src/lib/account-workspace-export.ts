import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    FundingType,
    PlatformType,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';

export const ACCOUNT_WORKSPACE_EXPORT_SCHEMA_VERSION = 1 as const;

type WithoutOwner<T> = Omit<T, 'userId'>;

export interface AccountWorkspaceRecordMetadata {
    id: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface AccountWorkspaceExport {
    schemaVersion: typeof ACCOUNT_WORKSPACE_EXPORT_SCHEMA_VERSION;
    sourceWorkspaceId: string;
    exportedAt: string;
    categories: Array<WithoutOwner<Category>>;
    brands: Array<WithoutOwner<Brand>>;
    cards: Array<WithoutOwner<Card>>;
    rules: Array<WithoutOwner<BenefitRule>>;
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    benefitProfile: UserBenefitProfile;
    recordMetadata: Record<string, AccountWorkspaceRecordMetadata>;
}

export interface AccountWorkspaceSummary {
    categories: number;
    brands: number;
    cards: number;
    rules: number;
    performances: number;
    history: number;
    deletedRecords: number;
    hasProfile: boolean;
    totalRecords: number;
}

export interface AccountWorkspaceState {
    workspace: AccountWorkspaceExport;
    summary: AccountWorkspaceSummary;
    revision: number;
    source: 'snapshot' | 'legacy';
    contentHash?: string;
    updatedAt?: string;
}

interface AccountWorkspaceExportSource {
    sourceWorkspaceId: string;
    exportedAt?: Date | string;
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    benefitProfile: UserBenefitProfile;
    profileUpdatedAt?: Date | string;
    performanceUpdatedAt?: Record<string, Date | string>;
}

const MAX_MONEY_AMOUNT = 1_000_000_000_000;
const PERSONAL_COLLECTION_LIMITS = {
    categories: 50,
    brands: 200,
    cards: 50,
    rules: 500,
    performances: 1_200,
    history: 10_000,
} as const;
const FUNDING_TYPES: FundingType[] = [
    'CARD',
    'MONEY',
    'POINTS',
    'GIFT_CERTIFICATE',
];
const PLATFORM_TYPES: PlatformType[] = ['ALL', 'ONLINE', 'OFFLINE', 'OFFICIAL_SITE'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toIsoString = (value: Date | string, label: string) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new Error(`${label} 시각이 올바르지 않습니다.`);
    return date.toISOString();
};

const requiredText = (value: unknown, label: string, maxLength = 500) => {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new Error(`${label} 값이 올바르지 않습니다.`);
    }
    return value;
};

const optionalText = (value: unknown, label: string, maxLength = 500) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || value.length > maxLength) {
        throw new Error(`${label} 값이 올바르지 않습니다.`);
    }
    return value;
};

const safeInteger = (
    value: unknown,
    label: string,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) => {
    if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
        throw new Error(`${label} 값이 올바르지 않습니다.`);
    }
    return Number(value);
};

const stringList = (value: unknown, label: string, limit = 500) => {
    if (!Array.isArray(value) || value.length > limit) {
        throw new Error(`${label} 목록이 올바르지 않습니다.`);
    }
    const items = value.map(item => requiredText(item, label, 200));
    if (new Set(items).size !== items.length) {
        throw new Error(`${label} 목록에 중복 값이 있습니다.`);
    }
    return items;
};

const objectValue = (value: unknown, label: string) => {
    if (!isRecord(value)) throw new Error(`${label} 값이 올바르지 않습니다.`);
    return value;
};

const withoutOwner = <T extends { userId?: string }>(row: T): WithoutOwner<T> => {
    const result = { ...row };
    delete result.userId;
    return result;
};

const metadataKey = (collection: string, id: string | number) => `${collection}:${id}`;
const performanceKey = (performance: UserCardPerformance) =>
    `${performance.cardId}:${performance.performanceMonth}`;

export const hasMeaningfulBenefitProfile = (profile: UserBenefitProfile) => (
    profile.telecomMemberships.length > 0 ||
    profile.subscriptions.length > 0 ||
    profile.enabledPayProviderIds.length > 0 ||
    !profile.moneyEnabled ||
    !profile.pointsEnabled ||
    profile.pointValue !== 1
);

export function createAccountWorkspaceExport(
    source: AccountWorkspaceExportSource
): AccountWorkspaceExport {
    const exportedAt = toIsoString(source.exportedAt ?? new Date(), '계정 export');
    const recordMetadata: Record<string, AccountWorkspaceRecordMetadata> = {};
    const addMetadata = (key: string, timestamp: string) => {
        recordMetadata[key] = {
            id: `${source.sourceWorkspaceId}:${key}`,
            createdAt: timestamp,
            updatedAt: timestamp,
        };
    };

    addMetadata(
        'profile',
        source.profileUpdatedAt
            ? toIsoString(source.profileUpdatedAt, '혜택 프로필')
            : exportedAt
    );
    source.categories.forEach(row => addMetadata(metadataKey('categories', row.id), exportedAt));
    source.brands.forEach(row => addMetadata(metadataKey('brands', row.id), exportedAt));
    source.cards.forEach(row => addMetadata(metadataKey('cards', row.id), exportedAt));
    source.rules.forEach(row => addMetadata(metadataKey('rules', row.id), exportedAt));
    source.performances.forEach(row => {
        const key = performanceKey(row);
        const updatedAt = source.performanceUpdatedAt?.[key];
        addMetadata(
            metadataKey('performances', key),
            updatedAt ? toIsoString(updatedAt, '카드 실적') : exportedAt
        );
    });
    source.history.forEach(row => addMetadata(
        metadataKey('history', row.id),
        toIsoString(row.date, '결제 기록')
    ));

    return parseAccountWorkspaceExport({
        schemaVersion: ACCOUNT_WORKSPACE_EXPORT_SCHEMA_VERSION,
        sourceWorkspaceId: source.sourceWorkspaceId,
        exportedAt,
        categories: source.categories.map(withoutOwner),
        brands: source.brands.map(withoutOwner),
        cards: source.cards.map(withoutOwner),
        rules: source.rules.map(withoutOwner),
        performances: structuredClone(source.performances),
        history: structuredClone(source.history),
        benefitProfile: structuredClone(source.benefitProfile),
        recordMetadata,
    });
}

const assertUniqueIds = (label: string, rows: Array<{ id: string | number }>) => {
    const ids = new Set<string | number>();
    rows.forEach(row => {
        if (ids.has(row.id)) throw new Error(`계정 workspace의 ${label} ID가 중복되었습니다.`);
        ids.add(row.id);
    });
};

const parseCategory = (value: unknown): WithoutOwner<Category> => {
    const row = objectValue(value, '카테고리');
    if ('userId' in row) throw new Error('계정 workspace에 서버 소유자 정보가 포함되어 있습니다.');
    return {
        id: requiredText(row.id, '카테고리 ID', 200),
        name: requiredText(row.name, '카테고리 이름', 200),
        ...(row.order !== undefined && {
            order: safeInteger(row.order, '카테고리 순서', 0, 100_000),
        }),
    };
};

const parseBrand = (value: unknown): WithoutOwner<Brand> => {
    const row = objectValue(value, '브랜드');
    if ('userId' in row) throw new Error('계정 workspace에 서버 소유자 정보가 포함되어 있습니다.');
    const iconName = optionalText(row.iconName, '브랜드 아이콘', 100);
    return {
        id: requiredText(row.id, '브랜드 ID', 200),
        name: requiredText(row.name, '브랜드 이름', 200),
        categoryId: requiredText(row.categoryId, '브랜드 카테고리 ID', 200),
        ...(iconName && { iconName }),
        ...(row.order !== undefined && {
            order: safeInteger(row.order, '브랜드 순서', 0, 100_000),
        }),
    };
};

const parseCard = (value: unknown): WithoutOwner<Card> => {
    const row = objectValue(value, '카드');
    if ('userId' in row) throw new Error('계정 workspace에 서버 소유자 정보가 포함되어 있습니다.');
    if (!Array.isArray(row.limitTable) || row.limitTable.length > 50) {
        throw new Error('계정 workspace의 카드 실적 구간이 올바르지 않습니다.');
    }
    return {
        id: requiredText(row.id, '카드 ID', 200),
        name: requiredText(row.name, '카드 이름', 200),
        company: requiredText(row.company, '카드사', 200),
        color: requiredText(row.color, '카드 색상', 300),
        limitTable: row.limitTable.map(item => {
            const tier = objectValue(item, '카드 실적 구간');
            return {
                threshold: safeInteger(tier.threshold, '카드 실적 기준', 0, MAX_MONEY_AMOUNT),
                limit: safeInteger(tier.limit, '카드 혜택 한도', 0, MAX_MONEY_AMOUNT),
            };
        }),
    };
};

const parseRule = (value: unknown): WithoutOwner<BenefitRule> => {
    const row = objectValue(value, '혜택 규칙');
    if ('userId' in row) throw new Error('계정 workspace에 서버 소유자 정보가 포함되어 있습니다.');
    const category = optionalText(row.category, '혜택 카테고리 ID', 200);
    const platformType = row.platformType ?? 'ALL';
    if (!PLATFORM_TYPES.includes(platformType as PlatformType)) {
        throw new Error('혜택 결제 채널 값이 올바르지 않습니다.');
    }
    const sharedGroupId = optionalText(row.sharedGroupId, '혜택 공유 한도 ID', 200);
    if (row.usesCardLimit !== undefined && typeof row.usesCardLimit !== 'boolean') {
        throw new Error('혜택 카드 한도 사용 값이 올바르지 않습니다.');
    }
    const condition = objectValue(row.condition, '혜택 조건');
    const action = objectValue(row.action, '혜택 계산식');
    const limitConfig = objectValue(row.limitConfig, '혜택 한도');
    if (!['PERCENT', 'FLAT', 'FIXED_PRICE'].includes(String(action.type))) {
        throw new Error('혜택 계산 방식이 올바르지 않습니다.');
    }
    if (
        typeof action.value !== 'number' ||
        !Number.isFinite(action.value) ||
        action.value < 0 ||
        (action.type === 'PERCENT' && action.value > 100)
    ) {
        throw new Error('혜택 계산 값이 올바르지 않습니다.');
    }
    if (
        condition.manualCheckRequired !== undefined &&
        typeof condition.manualCheckRequired !== 'boolean'
    ) {
        throw new Error('혜택 수동 확인 조건이 올바르지 않습니다.');
    }
    const requiredNote = optionalText(condition.requiredNote, '혜택 확인 메모', 500);
    const minSpend = condition.minSpend === undefined
        ? undefined
        : safeInteger(condition.minSpend, '최소 결제 금액', 0, MAX_MONEY_AMOUNT);
    const minPerformance = condition.minPerformance === undefined
        ? undefined
        : safeInteger(condition.minPerformance, '최소 실적', 0, MAX_MONEY_AMOUNT);
    const maxDiscount = action.maxDiscount === undefined
        ? undefined
        : safeInteger(action.maxDiscount, '건별 최대 할인', 0, MAX_MONEY_AMOUNT);
    const parseLimit = (key: string, label: string, maximum: number) => (
        limitConfig[key] === undefined
            ? undefined
            : safeInteger(limitConfig[key], label, 0, maximum)
    );
    const dailyCount = parseLimit('dailyCount', '일 사용 횟수', 1_000_000);
    const dailyAmount = parseLimit('dailyAmount', '일 할인 한도', MAX_MONEY_AMOUNT);
    const monthlyCount = parseLimit('monthlyCount', '월 사용 횟수', 1_000_000);
    const yearlyCount = parseLimit('yearlyCount', '연 사용 횟수', 1_000_000);
    const monthlyAmount = parseLimit('monthlyAmount', '월 할인 한도', MAX_MONEY_AMOUNT);

    return {
        id: requiredText(row.id, '혜택 ID', 200),
        cardId: requiredText(row.cardId, '혜택 카드 ID', 200),
        ...(category && { category }),
        includedBrands: stringList(row.includedBrands ?? [], '포함 브랜드'),
        excludedBrands: stringList(row.excludedBrands ?? [], '제외 브랜드'),
        platformType: platformType as PlatformType,
        ...(sharedGroupId && { sharedGroupId }),
        ...(row.usesCardLimit !== undefined && { usesCardLimit: row.usesCardLimit }),
        description: requiredText(row.description, '혜택 설명', 500),
        detail: typeof row.detail === 'string' && row.detail.length <= 5_000
            ? row.detail
            : (() => { throw new Error('혜택 상세 값이 올바르지 않습니다.'); })(),
        condition: {
            ...(minSpend !== undefined && { minSpend }),
            ...(minPerformance !== undefined && { minPerformance }),
            ...(condition.manualCheckRequired !== undefined && {
                manualCheckRequired: condition.manualCheckRequired,
            }),
            ...(requiredNote && { requiredNote }),
        },
        action: {
            type: action.type as BenefitRule['action']['type'],
            value: action.value,
            ...(maxDiscount !== undefined && { maxDiscount }),
        },
        limitConfig: {
            ...(dailyCount !== undefined && { dailyCount }),
            ...(dailyAmount !== undefined && { dailyAmount }),
            ...(monthlyCount !== undefined && { monthlyCount }),
            ...(yearlyCount !== undefined && { yearlyCount }),
            ...(monthlyAmount !== undefined && { monthlyAmount }),
        },
    };
};

const parsePerformance = (value: unknown): UserCardPerformance => {
    const row = objectValue(value, '카드 실적');
    const performanceMonth = requiredText(row.performanceMonth, '카드 실적 월', 7);
    const targetAmount = row.targetAmount === undefined
        ? undefined
        : safeInteger(row.targetAmount, '카드 실적 목표', 1, MAX_MONEY_AMOUNT);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(performanceMonth)) {
        throw new Error('카드 실적 월 형식이 올바르지 않습니다.');
    }
    return {
        cardId: requiredText(row.cardId, '카드 실적 카드 ID', 200),
        performanceMonth,
        amount: safeInteger(row.amount, '카드 실적 금액', 0, MAX_MONEY_AMOUNT),
        ...(targetAmount !== undefined && { targetAmount }),
    };
};

const parseHistory = (value: unknown): TransactionHistory => {
    const row = objectValue(value, '결제 기록');
    if (typeof row.id !== 'string' && !Number.isSafeInteger(row.id)) {
        throw new Error('결제 기록 ID가 올바르지 않습니다.');
    }
    const date = toIsoString(requiredText(row.date, '결제 기록 시각', 100), '결제 기록');
    const cardId = optionalText(row.cardId, '결제 기록 카드 ID', 200);
    const ruleId = optionalText(row.ruleId, '결제 기록 혜택 ID', 200);
    const payProviderId = optionalText(row.payProviderId, '결제 제공자 ID', 200);
    const fundingType = row.fundingType === undefined ? undefined : String(row.fundingType);
    if (fundingType && !FUNDING_TYPES.includes(fundingType as FundingType)) {
        throw new Error('결제 기록 자금 유형이 올바르지 않습니다.');
    }
    const combinationId = optionalText(row.combinationId, '추천 조합 ID', 200);
    const combinationSnapshot = row.combinationSnapshot === undefined
        ? undefined
        : objectValue(row.combinationSnapshot, '추천 조합 snapshot');

    return {
        id: row.id as string | number,
        date,
        brandId: requiredText(row.brandId, '결제 기록 브랜드 ID', 200),
        ...(cardId && { cardId }),
        ...(ruleId && { ruleId }),
        amount: safeInteger(row.amount, '결제 금액', 0, MAX_MONEY_AMOUNT),
        discountAmount: safeInteger(row.discountAmount, '할인 금액', 0, MAX_MONEY_AMOUNT),
        ...(row.eligibleItemAmount !== undefined && {
            eligibleItemAmount: safeInteger(
                row.eligibleItemAmount,
                '혜택 대상 상품 금액',
                0,
                MAX_MONEY_AMOUNT
            ),
        }),
        ...(payProviderId && { payProviderId }),
        ...(fundingType && { fundingType: fundingType as FundingType }),
        ...(combinationId && { combinationId }),
        ...(row.confirmedValue !== undefined && {
            confirmedValue: safeInteger(row.confirmedValue, '확정 혜택', 0, MAX_MONEY_AMOUNT),
        }),
        ...(row.conditionalValue !== undefined && {
            conditionalValue: safeInteger(row.conditionalValue, '조건부 혜택', 0, MAX_MONEY_AMOUNT),
        }),
        ...(row.estimatedValue !== undefined && {
            estimatedValue: safeInteger(row.estimatedValue, '예상 혜택', 0, MAX_MONEY_AMOUNT),
        }),
        ...(row.payableAmount !== undefined && {
            payableAmount: safeInteger(row.payableAmount, '실결제 금액', 0, MAX_MONEY_AMOUNT),
        }),
        ...(row.laterReward !== undefined && {
            laterReward: safeInteger(row.laterReward, '사후 혜택', 0, MAX_MONEY_AMOUNT),
        }),
        ...(row.performanceContributionAmount !== undefined && {
            performanceContributionAmount: safeInteger(
                row.performanceContributionAmount,
                '실적 반영 예상액',
                0,
                MAX_MONEY_AMOUNT,
            ),
        }),
        ...(combinationSnapshot && { combinationSnapshot: structuredClone(combinationSnapshot) }),
    };
};

const parseBenefitProfile = (value: unknown): UserBenefitProfile => {
    const profile = objectValue(value, '혜택 프로필');
    if (!Array.isArray(profile.telecomMemberships) || profile.telecomMemberships.length > 3) {
        throw new Error('혜택 프로필 통신사 멤버십이 올바르지 않습니다.');
    }
    if (!Array.isArray(profile.subscriptions) || profile.subscriptions.length > 50) {
        throw new Error('혜택 프로필 구독 상품이 올바르지 않습니다.');
    }
    if (
        typeof profile.moneyEnabled !== 'boolean' ||
        typeof profile.pointsEnabled !== 'boolean'
    ) {
        throw new Error('혜택 프로필 사용 설정이 올바르지 않습니다.');
    }
    return {
        telecomMemberships: profile.telecomMemberships.map(item => {
            const row = objectValue(item, '통신사 멤버십');
            const tier = optionalText(row.tier, '통신사 멤버십 등급', 100);
            return {
                providerId: requiredText(row.providerId, '통신사 제공자 ID', 200),
                ...(tier && { tier }),
            };
        }),
        subscriptions: profile.subscriptions.map(item => {
            const row = objectValue(item, '구독 상품');
            return {
                providerId: requiredText(row.providerId, '구독 제공자 ID', 200),
                productName: requiredText(row.productName, '구독 상품명', 100),
            };
        }),
        enabledPayProviderIds: stringList(
            profile.enabledPayProviderIds,
            '사용 페이',
            100
        ),
        moneyEnabled: profile.moneyEnabled,
        pointsEnabled: profile.pointsEnabled,
        pointValue: safeInteger(profile.pointValue, '포인트 가치', 0, 100),
    };
};

export function parseAccountWorkspaceExport(value: unknown): AccountWorkspaceExport {
    if (!isRecord(value)) throw new Error('계정 workspace가 객체가 아닙니다.');
    if (value.schemaVersion !== ACCOUNT_WORKSPACE_EXPORT_SCHEMA_VERSION) {
        throw new Error('지원하지 않는 계정 workspace schema 버전입니다.');
    }
    const sourceWorkspaceId = requiredText(
        value.sourceWorkspaceId,
        '계정 workspace 원본 ID',
        200
    );
    const exportedAt = toIsoString(
        requiredText(value.exportedAt, '계정 export 시각', 100),
        '계정 export'
    );
    const collections = Object.entries(PERSONAL_COLLECTION_LIMITS).map(([key, limit]) => {
        const rows = value[key];
        if (!Array.isArray(rows) || rows.length > limit) {
            throw new Error(`계정 workspace의 ${key} 목록이 올바르지 않습니다.`);
        }
        return [key, rows] as const;
    });
    const raw = Object.fromEntries(collections) as Record<
        keyof typeof PERSONAL_COLLECTION_LIMITS,
        unknown[]
    >;
    const categories = raw.categories.map(parseCategory);
    const brands = raw.brands.map(parseBrand);
    const cards = raw.cards.map(parseCard);
    const rules = raw.rules.map(parseRule);
    const performances = raw.performances.map(parsePerformance);
    const history = raw.history.map(parseHistory);
    assertUniqueIds('카테고리', categories);
    assertUniqueIds('브랜드', brands);
    assertUniqueIds('카드', cards);
    assertUniqueIds('혜택', rules);
    assertUniqueIds('결제 기록', history);
    assertUniqueIds(
        '카드 실적',
        performances.map(performance => ({ id: performanceKey(performance) }))
    );

    if (!isRecord(value.recordMetadata)) {
        throw new Error('계정 workspace metadata가 올바르지 않습니다.');
    }
    const metadataEntries = Object.entries(value.recordMetadata);
    if (metadataEntries.length > 12_000) {
        throw new Error('계정 workspace metadata가 너무 많습니다.');
    }
    const recordMetadata = Object.fromEntries(metadataEntries.map(([key, metadata]) => {
        if (!key || key.length > 500 || !isRecord(metadata)) {
            throw new Error(`계정 workspace metadata ${key}가 올바르지 않습니다.`);
        }
        const deletedAt = metadata.deletedAt === undefined
            ? undefined
            : toIsoString(
                requiredText(metadata.deletedAt, `${key} 삭제 시각`, 100),
                `${key} 삭제`
            );
        return [key, {
            id: requiredText(metadata.id, `${key} metadata ID`, 500),
            createdAt: toIsoString(
                requiredText(metadata.createdAt, `${key} 생성 시각`, 100),
                `${key} 생성`
            ),
            updatedAt: toIsoString(
                requiredText(metadata.updatedAt, `${key} 수정 시각`, 100),
                `${key} 수정`
            ),
            ...(deletedAt && { deletedAt }),
        } satisfies AccountWorkspaceRecordMetadata];
    }));

    return {
        schemaVersion: ACCOUNT_WORKSPACE_EXPORT_SCHEMA_VERSION,
        sourceWorkspaceId,
        exportedAt,
        categories,
        brands,
        cards,
        rules,
        performances,
        history,
        benefitProfile: parseBenefitProfile(value.benefitProfile),
        recordMetadata,
    };
}

export function summarizeAccountWorkspace(
    workspace: AccountWorkspaceExport
): AccountWorkspaceSummary {
    const deletedRecords = Object.values(workspace.recordMetadata)
        .filter(metadata => Boolean(metadata.deletedAt)).length;
    const summary = {
        categories: workspace.categories.length,
        brands: workspace.brands.length,
        cards: workspace.cards.length,
        rules: workspace.rules.length,
        performances: workspace.performances.length,
        history: workspace.history.length,
        deletedRecords,
        hasProfile: hasMeaningfulBenefitProfile(workspace.benefitProfile),
    };

    return {
        ...summary,
        totalRecords:
            summary.categories +
            summary.brands +
            summary.cards +
            summary.rules +
            summary.performances +
            summary.history +
            summary.deletedRecords +
            (summary.hasProfile ? 1 : 0),
    };
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
    }
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => (
        `${JSON.stringify(key)}:${stableStringify(item)}`
    )).join(',')}}`;
}

export function accountWorkspaceContentEquals(
    left: AccountWorkspaceExport,
    right: AccountWorkspaceExport,
    options: { ignoreSourceWorkspaceId?: boolean } = {}
) {
    const leftValue = options.ignoreSourceWorkspaceId
        ? { ...left, sourceWorkspaceId: '' }
        : left;
    const rightValue = options.ignoreSourceWorkspaceId
        ? { ...right, sourceWorkspaceId: '' }
        : right;
    return stableStringify(leftValue) === stableStringify(rightValue);
}

export function serializeAccountWorkspace(workspace: AccountWorkspaceExport) {
    return stableStringify(parseAccountWorkspaceExport(workspace));
}
