import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import {
    parseAccountWorkspaceExport,
    type AccountWorkspaceExport,
    type AccountWorkspaceRecordMetadata,
} from '@/lib/account-workspace-export';

export type AccountWorkspaceMergeSide = 'local' | 'account';

export type AccountWorkspaceMergeRecordKind =
    | 'profile'
    | 'category'
    | 'brand'
    | 'card'
    | 'rule'
    | 'performance'
    | 'history'
    | 'metadata';

export interface AccountWorkspaceMergeConflict {
    key: string;
    kind: AccountWorkspaceMergeRecordKind;
    label: string;
    defaultChoice: AccountWorkspaceMergeSide;
    local: {
        updatedAt: string;
        deleted: boolean;
    };
    account: {
        updatedAt: string;
        deleted: boolean;
    };
}

export interface AccountWorkspaceMergePlan {
    conflicts: AccountWorkspaceMergeConflict[];
    localOnlyCount: number;
    accountOnlyCount: number;
    identicalCount: number;
    autoResolvedCount: number;
    totalRecordCount: number;
}

export interface AccountWorkspaceMergeResolution {
    workspace: AccountWorkspaceExport;
    cascadedDeletionCount: number;
    adjustedReferenceCount: number;
}

type MergeRecordValue =
    | AccountWorkspaceExport['categories'][number]
    | AccountWorkspaceExport['brands'][number]
    | AccountWorkspaceExport['cards'][number]
    | AccountWorkspaceExport['rules'][number]
    | UserCardPerformance
    | TransactionHistory
    | UserBenefitProfile;

type IndexedMergeRecord = {
    key: string;
    kind: AccountWorkspaceMergeRecordKind;
    label: string;
    metadata: AccountWorkspaceRecordMetadata;
    value?: MergeRecordValue;
};

type MergeRecordPair = {
    key: string;
    local?: IndexedMergeRecord;
    account?: IndexedMergeRecord;
};

const RECORD_PREFIXES: Array<{
    prefix: string;
    kind: AccountWorkspaceMergeRecordKind;
}> = [
    { prefix: 'categories:', kind: 'category' },
    { prefix: 'brands:', kind: 'brand' },
    { prefix: 'cards:', kind: 'card' },
    { prefix: 'rules:', kind: 'rule' },
    { prefix: 'performances:', kind: 'performance' },
    { prefix: 'history:', kind: 'history' },
];

const stableStringify = (value: unknown): string => {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }
    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
    }
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => (
        `${JSON.stringify(key)}:${stableStringify(item)}`
    )).join(',')}}`;
};

const recordKindFromKey = (key: string): AccountWorkspaceMergeRecordKind => {
    if (key === 'profile') return 'profile';
    return RECORD_PREFIXES.find(item => key.startsWith(item.prefix))?.kind ?? 'metadata';
};

const recordLabel = (kind: AccountWorkspaceMergeRecordKind, value: unknown, key: string) => {
    if (kind === 'profile') return '보유 혜택 프로필';
    if (value && typeof value === 'object') {
        if ('name' in value && typeof value.name === 'string') return value.name;
        if (kind === 'rule' && 'description' in value && typeof value.description === 'string') {
            return value.description;
        }
        if (kind === 'performance' && 'cardId' in value && 'performanceMonth' in value) {
            return `${String(value.cardId)} · ${String(value.performanceMonth)} 실적`;
        }
        if (kind === 'history' && 'brandId' in value && 'date' in value) {
            return `${String(value.brandId)} · ${String(value.date).slice(0, 10)} 결제`;
        }
    }
    return key;
};

const addActiveRecord = (
    records: Map<string, IndexedMergeRecord>,
    workspace: AccountWorkspaceExport,
    key: string,
    kind: AccountWorkspaceMergeRecordKind,
    value: MergeRecordValue,
) => {
    const metadata = workspace.recordMetadata[key];
    if (!metadata) throw new Error(`병합할 workspace의 ${key} metadata가 없습니다.`);
    if (metadata.deletedAt) {
        throw new Error(`병합할 workspace의 ${key}에 활성 데이터와 삭제 기록이 함께 있습니다.`);
    }
    records.set(key, {
        key,
        kind,
        label: recordLabel(kind, value, key),
        metadata: structuredClone(metadata),
        value: structuredClone(value),
    });
};

const indexWorkspaceRecords = (value: AccountWorkspaceExport) => {
    const workspace = parseAccountWorkspaceExport(value);
    const records = new Map<string, IndexedMergeRecord>();

    Object.entries(workspace.recordMetadata).forEach(([key, metadata]) => {
        records.set(key, {
            key,
            kind: recordKindFromKey(key),
            label: recordLabel(recordKindFromKey(key), undefined, key),
            metadata: structuredClone(metadata),
        });
    });

    addActiveRecord(records, workspace, 'profile', 'profile', workspace.benefitProfile);
    workspace.categories.forEach(row => addActiveRecord(
        records,
        workspace,
        `categories:${row.id}`,
        'category',
        row,
    ));
    workspace.brands.forEach(row => addActiveRecord(
        records,
        workspace,
        `brands:${row.id}`,
        'brand',
        row,
    ));
    workspace.cards.forEach(row => addActiveRecord(
        records,
        workspace,
        `cards:${row.id}`,
        'card',
        row,
    ));
    workspace.rules.forEach(row => addActiveRecord(
        records,
        workspace,
        `rules:${row.id}`,
        'rule',
        row,
    ));
    workspace.performances.forEach(row => addActiveRecord(
        records,
        workspace,
        `performances:${row.cardId}:${row.performanceMonth}`,
        'performance',
        row,
    ));
    workspace.history.forEach(row => addActiveRecord(
        records,
        workspace,
        `history:${row.id}`,
        'history',
        row,
    ));

    records.forEach(record => {
        if (!record.value && !record.metadata.deletedAt) {
            throw new Error(`병합할 workspace의 ${record.key} 데이터가 없습니다.`);
        }
    });

    return records;
};

const buildRecordPairs = (
    localWorkspace: AccountWorkspaceExport,
    accountWorkspace: AccountWorkspaceExport,
): MergeRecordPair[] => {
    const localRecords = indexWorkspaceRecords(localWorkspace);
    const accountRecords = indexWorkspaceRecords(accountWorkspace);
    const keys = [...new Set([...localRecords.keys(), ...accountRecords.keys()])].sort();
    return keys.map(key => ({
        key,
        local: localRecords.get(key),
        account: accountRecords.get(key),
    }));
};

const recordContentEquals = (left: IndexedMergeRecord, right: IndexedMergeRecord) => (
    Boolean(left.metadata.deletedAt) === Boolean(right.metadata.deletedAt) &&
    stableStringify(left.value) === stableStringify(right.value)
);

const preferredSide = (
    local: IndexedMergeRecord,
    account: IndexedMergeRecord,
): AccountWorkspaceMergeSide => {
    const localTime = new Date(local.metadata.updatedAt).getTime();
    const accountTime = new Date(account.metadata.updatedAt).getTime();
    if (localTime !== accountTime) return localTime > accountTime ? 'local' : 'account';
    if (Boolean(local.metadata.deletedAt) !== Boolean(account.metadata.deletedAt)) {
        return local.metadata.deletedAt ? 'local' : 'account';
    }
    return 'local';
};

const preferredEquivalentRecord = (
    local: IndexedMergeRecord,
    account: IndexedMergeRecord,
) => preferredSide(local, account) === 'local' ? local : account;

export function createAccountWorkspaceMergePlan(
    localWorkspace: AccountWorkspaceExport,
    accountWorkspace: AccountWorkspaceExport,
): AccountWorkspaceMergePlan {
    const pairs = buildRecordPairs(localWorkspace, accountWorkspace);
    const conflicts: AccountWorkspaceMergeConflict[] = [];
    let localOnlyCount = 0;
    let accountOnlyCount = 0;
    let identicalCount = 0;
    let autoResolvedCount = 0;

    pairs.forEach(({ key, local, account }) => {
        if (local && !account) {
            localOnlyCount += 1;
            return;
        }
        if (!local && account) {
            accountOnlyCount += 1;
            return;
        }
        if (!local || !account) return;

        if (recordContentEquals(local, account)) {
            if (stableStringify(local.metadata) === stableStringify(account.metadata)) {
                identicalCount += 1;
            } else {
                autoResolvedCount += 1;
            }
            return;
        }

        conflicts.push({
            key,
            kind: local.kind === 'metadata' ? account.kind : local.kind,
            label: local.value ? local.label : account.label,
            defaultChoice: preferredSide(local, account),
            local: {
                updatedAt: local.metadata.updatedAt,
                deleted: Boolean(local.metadata.deletedAt),
            },
            account: {
                updatedAt: account.metadata.updatedAt,
                deleted: Boolean(account.metadata.deletedAt),
            },
        });
    });

    return {
        conflicts,
        localOnlyCount,
        accountOnlyCount,
        identicalCount,
        autoResolvedCount,
        totalRecordCount: pairs.length,
    };
}

export const createDefaultAccountWorkspaceMergeChoices = (
    plan: AccountWorkspaceMergePlan,
): Record<string, AccountWorkspaceMergeSide> => Object.fromEntries(
    plan.conflicts.map(conflict => [conflict.key, conflict.defaultChoice])
);

const chooseRecords = (
    pairs: MergeRecordPair[],
    choices: Record<string, AccountWorkspaceMergeSide>,
) => new Map(pairs.map(({ key, local, account }) => {
    if (local && !account) return [key, local];
    if (!local && account) return [key, account];
    if (!local || !account) throw new Error(`병합할 ${key} 데이터를 찾지 못했습니다.`);
    if (recordContentEquals(local, account)) {
        return [key, preferredEquivalentRecord(local, account)];
    }

    const choice = choices[key];
    if (choice !== 'local' && choice !== 'account') {
        throw new Error(`${key} 항목에서 이 기기 또는 계정 데이터를 선택해주세요.`);
    }
    return [key, choice === 'local' ? local : account];
}));

const latestTimestamp = (
    requested: string,
    records: Map<string, IndexedMergeRecord>,
) => new Date(Math.max(
    new Date(requested).getTime(),
    ...[...records.values()].flatMap(record => [
        new Date(record.metadata.updatedAt).getTime(),
        ...(record.metadata.deletedAt ? [new Date(record.metadata.deletedAt).getTime()] : []),
    ]),
)).toISOString();

const compareTextId = (left: { id: string | number }, right: { id: string | number }) =>
    String(left.id).localeCompare(String(right.id));

const materializeWorkspace = (
    records: Map<string, IndexedMergeRecord>,
    sourceWorkspaceId: string,
    exportedAt: string,
): AccountWorkspaceMergeResolution => {
    const metadata = Object.fromEntries([...records].map(([key, record]) => [
        key,
        structuredClone(record.metadata),
    ]));
    const values = [...records.values()].filter(record => !record.metadata.deletedAt);
    const profile = values.find(record => record.kind === 'profile')?.value;
    if (!profile) throw new Error('병합 결과에 보유 혜택 프로필이 없습니다.');

    const workspace: AccountWorkspaceExport = {
        schemaVersion: 1,
        sourceWorkspaceId,
        exportedAt,
        categories: values.filter(record => record.kind === 'category')
            .map(record => structuredClone(record.value) as Omit<Category, 'userId'>)
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || compareTextId(left, right)),
        brands: values.filter(record => record.kind === 'brand')
            .map(record => structuredClone(record.value) as Omit<Brand, 'userId'>)
            .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || compareTextId(left, right)),
        cards: values.filter(record => record.kind === 'card')
            .map(record => structuredClone(record.value) as Omit<Card, 'userId'>)
            .sort(compareTextId),
        rules: values.filter(record => record.kind === 'rule')
            .map(record => structuredClone(record.value) as Omit<BenefitRule, 'userId'>)
            .sort(compareTextId),
        performances: values.filter(record => record.kind === 'performance')
            .map(record => structuredClone(record.value) as UserCardPerformance)
            .sort((left, right) => (
                left.cardId.localeCompare(right.cardId) ||
                left.performanceMonth.localeCompare(right.performanceMonth)
            )),
        history: values.filter(record => record.kind === 'history')
            .map(record => structuredClone(record.value) as TransactionHistory)
            .sort((left, right) => (
                new Date(right.date).getTime() - new Date(left.date).getTime() ||
                String(left.id).localeCompare(String(right.id))
            )),
        benefitProfile: structuredClone(profile) as UserBenefitProfile,
        recordMetadata: metadata,
    };

    const mergeTimestamp = latestTimestamp(exportedAt, records);
    let cascadedDeletionCount = 0;
    let adjustedReferenceCount = 0;
    const deletedIds = (prefix: string) => new Set(Object.entries(workspace.recordMetadata)
        .filter(([key, item]) => key.startsWith(prefix) && item.deletedAt)
        .map(([key]) => key.slice(prefix.length)));
    const deletedCategoryIds = deletedIds('categories:');
    const deletedCardIds = deletedIds('cards:');
    const deletedBrandIds = deletedIds('brands:');

    const markCascadeDeleted = (key: string) => {
        const previous = workspace.recordMetadata[key];
        if (!previous?.deletedAt) cascadedDeletionCount += 1;
        workspace.recordMetadata[key] = {
            ...(previous ?? {
                id: `${sourceWorkspaceId}:${key}`,
                createdAt: mergeTimestamp,
            }),
            updatedAt: mergeTimestamp,
            deletedAt: mergeTimestamp,
        };
    };
    const touchCascadeAdjusted = (key: string) => {
        const previous = workspace.recordMetadata[key];
        if (!previous) throw new Error(`병합 결과의 ${key} metadata가 없습니다.`);
        workspace.recordMetadata[key] = {
            ...previous,
            updatedAt: mergeTimestamp,
        };
        adjustedReferenceCount += 1;
    };

    workspace.brands = workspace.brands.filter(brand => {
        if (!deletedCategoryIds.has(brand.categoryId)) return true;
        markCascadeDeleted(`brands:${brand.id}`);
        deletedBrandIds.add(brand.id);
        return false;
    });
    workspace.performances = workspace.performances.filter(performance => {
        if (!deletedCardIds.has(performance.cardId)) return true;
        markCascadeDeleted(`performances:${performance.cardId}:${performance.performanceMonth}`);
        return false;
    });
    workspace.rules = workspace.rules.flatMap(rule => {
        if (deletedCardIds.has(rule.cardId)) {
            markCascadeDeleted(`rules:${rule.id}`);
            return [];
        }

        const next = {
            ...rule,
            ...(rule.category && deletedCategoryIds.has(rule.category)
                ? { category: undefined }
                : {}),
            includedBrands: (rule.includedBrands ?? [])
                .filter(id => !deletedBrandIds.has(id)),
            excludedBrands: (rule.excludedBrands ?? [])
                .filter(id => !deletedBrandIds.has(id)),
        };
        if (stableStringify(next) !== stableStringify(rule)) {
            touchCascadeAdjusted(`rules:${rule.id}`);
        }
        return [next];
    });

    return {
        workspace: parseAccountWorkspaceExport(workspace),
        cascadedDeletionCount,
        adjustedReferenceCount,
    };
};

export function resolveAccountWorkspaceMerge(
    localWorkspace: AccountWorkspaceExport,
    accountWorkspace: AccountWorkspaceExport,
    choices: Record<string, AccountWorkspaceMergeSide>,
    options: {
        sourceWorkspaceId?: string;
        exportedAt?: Date | string;
    } = {},
): AccountWorkspaceMergeResolution {
    const local = parseAccountWorkspaceExport(localWorkspace);
    const account = parseAccountWorkspaceExport(accountWorkspace);
    const exportedAt = options.exportedAt instanceof Date
        ? options.exportedAt.toISOString()
        : options.exportedAt ?? new Date().toISOString();
    if (Number.isNaN(new Date(exportedAt).getTime())) {
        throw new Error('계정 workspace 병합 시각이 올바르지 않습니다.');
    }

    const records = chooseRecords(buildRecordPairs(local, account), choices);
    return materializeWorkspace(
        records,
        options.sourceWorkspaceId ?? local.sourceWorkspaceId,
        exportedAt,
    );
}
