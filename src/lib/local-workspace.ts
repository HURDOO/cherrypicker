'use client';

import type {
    BenefitCombination,
    BenefitRule,
    Brand,
    Card,
    Category,
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import {
    accountWorkspaceContentEquals,
    parseAccountWorkspaceExport,
    summarizeAccountWorkspace,
    type AccountWorkspaceExport,
    type AccountWorkspaceState,
} from '@/lib/account-workspace-export';
import {
    createAccountWorkspaceMergePlan,
    createDefaultAccountWorkspaceMergeChoices,
    resolveAccountWorkspaceMerge,
} from '@/lib/account-workspace-merge';
import {
    LOCAL_WORKSPACE_SYNC_STATE_KEY,
    type LocalWorkspaceOutboxOperation,
    type LocalWorkspaceSyncState,
} from '@/lib/account-workspace-sync-contract';
import {
    LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
    LOCAL_WORKSPACE_STORE_NAME,
    LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
    openLocalWorkspaceDatabase,
    requestResult,
    transactionDone,
} from '@/lib/local-workspace-database';
import { getCurrentMonthInKst } from '@/lib/monthly-performance';
import {
    DEFAULT_SMALL_BENEFIT_THRESHOLD,
    MAX_SMALL_BENEFIT_THRESHOLD,
} from '@/utils/recommendationPreferences';

const CURRENT_WORKSPACE_KEY = 'current';

export const LOCAL_WORKSPACE_SCHEMA_VERSION = 1 as const;

export interface LocalSyncMetadata {
    id: string;
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}

export interface LocalWorkspaceSnapshot {
    schemaVersion: typeof LOCAL_WORKSPACE_SCHEMA_VERSION;
    workspaceId: string;
    deviceId: string;
    createdAt: string;
    updatedAt: string;
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    benefitProfile: UserBenefitProfile;
    recordMetadata: Record<string, LocalSyncMetadata>;
}

export interface LocalWorkspaceStorage {
    read: () => Promise<unknown | null>;
    write: (
        snapshot: LocalWorkspaceSnapshot,
        options?: { queueSync?: boolean },
    ) => Promise<void>;
}

export type LocalCardInput = Pick<Card, 'name' | 'company' | 'color' | 'limitTable' | 'network'>;
export type LocalRuleInput = {
    cardId: string;
    category?: string | null;
    includedBrands: string[];
    excludedBrands: string[];
    platformType: PlatformType;
    sharedGroupId?: string | null;
    usesCardLimit?: boolean;
    description: string;
    detail: string;
    condition: RuleCondition;
    action: RuleAction;
    limitConfig: LimitConfig;
};
export type LocalCombinationTransactionInput = {
    brandId: string;
    amount: number;
    eligibleItemAmount?: number;
    combination: BenefitCombination;
    catalogVersion: string;
};

type WorkspaceCreationOptions = {
    now?: Date | string;
    idFactory?: () => string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const toIsoString = (value: Date | string = new Date()) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new Error('로컬 workspace 시각이 올바르지 않습니다.');
    return date.toISOString();
};

const createId = () => {
    const crypto = globalThis.crypto;
    if (typeof crypto?.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    if (typeof crypto?.getRandomValues !== 'function') {
        throw new Error('이 브라우저에서는 안전한 로컬 ID를 만들 수 없습니다.');
    }

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));

    return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
    ].join('-');
};

export const createEmptyBenefitProfile = (): UserBenefitProfile => ({
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: DEFAULT_SMALL_BENEFIT_THRESHOLD,
});

export function createEmptyLocalWorkspace(
    options: WorkspaceCreationOptions = {}
): LocalWorkspaceSnapshot {
    const idFactory = options.idFactory ?? createId;
    const now = toIsoString(options.now);
    const workspaceId = idFactory();
    const profileId = idFactory();

    return {
        schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
        workspaceId,
        deviceId: idFactory(),
        createdAt: now,
        updatedAt: now,
        categories: [],
        brands: [],
        cards: [],
        rules: [],
        performances: [],
        history: [],
        benefitProfile: createEmptyBenefitProfile(),
        recordMetadata: {
            profile: {
                id: profileId,
                createdAt: now,
                updatedAt: now,
            },
        },
    };
}

const assertArray = (value: Record<string, unknown>, key: string) => {
    if (!Array.isArray(value[key])) {
        throw new Error(`로컬 workspace의 ${key} 목록이 올바르지 않습니다.`);
    }
};

const assertDate = (value: unknown, label: string) => {
    if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) {
        throw new Error(`로컬 workspace의 ${label} 시각이 올바르지 않습니다.`);
    }
};

export function parseLocalWorkspaceSnapshot(value: unknown): LocalWorkspaceSnapshot {
    if (!isRecord(value)) throw new Error('로컬 workspace가 객체가 아닙니다.');
    if (value.schemaVersion !== LOCAL_WORKSPACE_SCHEMA_VERSION) {
        throw new Error('지원하지 않는 로컬 workspace schema 버전입니다.');
    }
    if (typeof value.workspaceId !== 'string' || !value.workspaceId) {
        throw new Error('로컬 workspace ID가 올바르지 않습니다.');
    }
    if (typeof value.deviceId !== 'string' || !value.deviceId) {
        throw new Error('로컬 기기 ID가 올바르지 않습니다.');
    }
    assertDate(value.createdAt, '생성');
    assertDate(value.updatedAt, '수정');
    ['categories', 'brands', 'cards', 'rules', 'performances', 'history']
        .forEach(key => assertArray(value, key));

    if (!isRecord(value.benefitProfile)) {
        throw new Error('로컬 혜택 프로필이 올바르지 않습니다.');
    }
    const profile = value.benefitProfile;
    if (
        !Array.isArray(profile.telecomMemberships) ||
        !Array.isArray(profile.subscriptions) ||
        !Array.isArray(profile.enabledPayProviderIds) ||
        typeof profile.moneyEnabled !== 'boolean' ||
        typeof profile.pointsEnabled !== 'boolean' ||
        typeof profile.pointValue !== 'number' ||
        !Number.isFinite(profile.pointValue)
    ) {
        throw new Error('로컬 혜택 프로필 값이 올바르지 않습니다.');
    }
    const smallBenefitThreshold = profile.smallBenefitThreshold ??
        DEFAULT_SMALL_BENEFIT_THRESHOLD;
    if (
        !Number.isSafeInteger(smallBenefitThreshold) ||
        (smallBenefitThreshold as number) < 0 ||
        (smallBenefitThreshold as number) > MAX_SMALL_BENEFIT_THRESHOLD
    ) {
        throw new Error('로컬 소액 혜택 기준이 올바르지 않습니다.');
    }
    if (!isRecord(value.recordMetadata)) {
        throw new Error('로컬 workspace metadata가 올바르지 않습니다.');
    }
    Object.entries(value.recordMetadata).forEach(([key, metadata]) => {
        if (!isRecord(metadata) || typeof metadata.id !== 'string' || !metadata.id) {
            throw new Error(`로컬 workspace metadata ${key}가 올바르지 않습니다.`);
        }
        assertDate(metadata.createdAt, `${key} 생성`);
        assertDate(metadata.updatedAt, `${key} 수정`);
        if (metadata.deletedAt !== undefined) assertDate(metadata.deletedAt, `${key} 삭제`);
    });

    const snapshot = value as unknown as LocalWorkspaceSnapshot;
    const idCollections = [
        snapshot.categories,
        snapshot.brands,
        snapshot.cards,
        snapshot.rules,
        snapshot.history,
    ];
    idCollections.forEach(collection => {
        const ids = new Set<string | number>();
        collection.forEach(row => {
            if (!isRecord(row) || (typeof row.id !== 'string' && typeof row.id !== 'number')) {
                throw new Error('로컬 workspace 항목 ID가 올바르지 않습니다.');
            }
            if (ids.has(row.id)) throw new Error(`로컬 workspace ID가 중복되었습니다: ${row.id}`);
            ids.add(row.id);
        });
    });
    [snapshot.categories, snapshot.brands, snapshot.cards, snapshot.rules].forEach(collection => {
        collection.forEach(row => {
            if (row.userId !== snapshot.workspaceId) {
                throw new Error(`로컬 항목 ${row.id}의 workspace 소유권이 올바르지 않습니다.`);
            }
        });
    });

    return {
        ...snapshot,
        benefitProfile: {
            ...snapshot.benefitProfile,
            smallBenefitThreshold: smallBenefitThreshold as number,
        },
    };
}

type StoredWorkspace = {
    key: typeof CURRENT_WORKSPACE_KEY;
    snapshot: LocalWorkspaceSnapshot;
};

export const browserLocalWorkspaceStorage: LocalWorkspaceStorage = {
    async read() {
        const database = await openLocalWorkspaceDatabase();
        try {
            const transaction = database.transaction(
                LOCAL_WORKSPACE_STORE_NAME,
                'readonly',
            );
            const done = transactionDone(transaction);
            const stored = await requestResult<StoredWorkspace | undefined>(
                transaction.objectStore(LOCAL_WORKSPACE_STORE_NAME).get(CURRENT_WORKSPACE_KEY)
            );
            await done;
            return stored?.snapshot ?? null;
        } finally {
            database.close();
        }
    },

    async write(snapshot, options = {}) {
        parseLocalWorkspaceSnapshot(snapshot);
        const database = await openLocalWorkspaceDatabase();
        let queuedOperation = false;
        let queueError: Error | null = null;
        try {
            const storeNames = options.queueSync
                ? [
                    LOCAL_WORKSPACE_STORE_NAME,
                    LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
                    LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
                ]
                : [LOCAL_WORKSPACE_STORE_NAME];
            const transaction = database.transaction(storeNames, 'readwrite');
            const done = transactionDone(transaction);
            transaction.objectStore(LOCAL_WORKSPACE_STORE_NAME).put({
                key: CURRENT_WORKSPACE_KEY,
                snapshot,
            } satisfies StoredWorkspace);

            if (options.queueSync) {
                const syncRequest = transaction
                    .objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME)
                    .get(LOCAL_WORKSPACE_SYNC_STATE_KEY) as IDBRequest<
                        LocalWorkspaceSyncState | undefined
                    >;
                syncRequest.onsuccess = () => {
                    const syncState = syncRequest.result;
                    if (!syncState) return;
                    try {
                        const operationId = createId();
                        const operation: LocalWorkspaceOutboxOperation = {
                            operationId,
                            accountUserId: syncState.accountUserId,
                            deviceId: snapshot.deviceId,
                            baseRevision: syncState.remoteRevision,
                            workspace: createAccountWorkspaceExportFromLocal(
                                snapshot,
                                snapshot.updatedAt,
                            ),
                            createdAt: snapshot.updatedAt,
                            attemptCount: 0,
                            nextAttemptAt: snapshot.updatedAt,
                        };
                        transaction.objectStore(LOCAL_WORKSPACE_OUTBOX_STORE_NAME).put(operation);
                        queuedOperation = true;
                    } catch (error) {
                        queueError = error instanceof Error
                            ? error
                            : new Error('동기화 outbox를 만들지 못했습니다.');
                        transaction.abort();
                    }
                };
            }
            try {
                await done;
            } catch (error) {
                throw queueError ?? error;
            }
        } finally {
            database.close();
        }

        if (queuedOperation && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('cherrypicker:workspace-sync-needed'));
        }
    },
};

export async function readOrCreateLocalWorkspace(
    storage: LocalWorkspaceStorage = browserLocalWorkspaceStorage,
    options: WorkspaceCreationOptions = {}
) {
    const stored = await storage.read();
    if (stored) return parseLocalWorkspaceSnapshot(stored);

    const created = createEmptyLocalWorkspace(options);
    await storage.write(created);
    return created;
}

let mutationQueue: Promise<unknown> = Promise.resolve();

const enqueueMutation = <T>(mutation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.then(mutation, mutation);
    mutationQueue = result.then(() => undefined, () => undefined);
    return result;
};

const metadataKey = (collection: string, id: string) => `${collection}:${id}`;

const touchMetadata = (
    workspace: LocalWorkspaceSnapshot,
    key: string,
    timestamp: string,
    id: string = createId(),
) => {
    const previous = workspace.recordMetadata[key];
    workspace.recordMetadata[key] = {
        id: previous?.id ?? id,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
    };
};

const markDeleted = (
    workspace: LocalWorkspaceSnapshot,
    key: string,
    timestamp: string,
    id: string = createId(),
) => {
    const previous = workspace.recordMetadata[key];
    workspace.recordMetadata[key] = {
        id: previous?.id ?? id,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
        deletedAt: timestamp,
    };
};

async function mutateWorkspace<T>(
    mutator: (workspace: LocalWorkspaceSnapshot, timestamp: string) => T,
    storage: LocalWorkspaceStorage = browserLocalWorkspaceStorage,
): Promise<T> {
    return enqueueMutation(async () => {
        const current = await readOrCreateLocalWorkspace(storage);
        const next = structuredClone(current);
        const timestamp = new Date().toISOString();
        const result = mutator(next, timestamp);
        next.updatedAt = timestamp;
        parseLocalWorkspaceSnapshot(next);
        await storage.write(next, { queueSync: true });
        return result;
    });
}

const requireOwned = <T extends { id: string; userId?: string }>(
    workspace: LocalWorkspaceSnapshot,
    rows: T[],
    id: string,
    label: string,
) => {
    const row = rows.find(item => item.id === id && item.userId === workspace.workspaceId);
    if (!row) throw new Error(`${label}을(를) 찾을 수 없습니다.`);
    return row;
};

export const hasMeaningfulLocalWorkspaceData = (workspace: LocalWorkspaceSnapshot) => (
    workspace.categories.length > 0 ||
    workspace.brands.length > 0 ||
    workspace.cards.length > 0 ||
    workspace.rules.length > 0 ||
    workspace.performances.length > 0 ||
    workspace.history.length > 0 ||
    Object.keys(workspace.recordMetadata).some(key => key !== 'profile') ||
    workspace.recordMetadata.profile?.createdAt !== workspace.recordMetadata.profile?.updatedAt ||
    Boolean(workspace.recordMetadata.profile?.deletedAt) ||
    workspace.benefitProfile.telecomMemberships.length > 0 ||
    workspace.benefitProfile.subscriptions.length > 0 ||
    workspace.benefitProfile.enabledPayProviderIds.length > 0 ||
    !workspace.benefitProfile.moneyEnabled ||
    !workspace.benefitProfile.pointsEnabled ||
    workspace.benefitProfile.pointValue !== 1 ||
    workspace.benefitProfile.smallBenefitThreshold !== DEFAULT_SMALL_BENEFIT_THRESHOLD
);

const withoutLocalOwner = <T extends { userId?: string }>(row: T) => {
    const result = { ...row };
    delete result.userId;
    return result;
};

export function createAccountWorkspaceExportFromLocal(
    value: LocalWorkspaceSnapshot,
    exportedAt: Date | string = new Date()
): AccountWorkspaceExport {
    const workspace = parseLocalWorkspaceSnapshot(value);
    const timestamp = toIsoString(exportedAt);

    return parseAccountWorkspaceExport({
        schemaVersion: 1,
        sourceWorkspaceId: workspace.workspaceId,
        exportedAt: timestamp,
        categories: workspace.categories.map(withoutLocalOwner),
        brands: workspace.brands.map(withoutLocalOwner),
        cards: workspace.cards.map(withoutLocalOwner),
        rules: workspace.rules.map(withoutLocalOwner),
        performances: structuredClone(workspace.performances),
        history: structuredClone(workspace.history),
        benefitProfile: structuredClone(workspace.benefitProfile),
        recordMetadata: structuredClone(workspace.recordMetadata),
    });
}

export function accountWorkspaceMatchesLocal(
    localWorkspace: LocalWorkspaceSnapshot,
    accountWorkspace: AccountWorkspaceExport
) {
    const candidate = createAccountWorkspaceExportFromLocal(
        localWorkspace,
        accountWorkspace.exportedAt
    );
    return accountWorkspaceContentEquals(candidate, accountWorkspace, {
        ignoreSourceWorkspaceId: true,
    });
}

export type AccountWorkspaceSyncMode =
    | 'empty'
    | 'upload'
    | 'update'
    | 'restore'
    | 'synced'
    | 'conflict';

export function getAccountWorkspaceSyncMode(
    localWorkspace: LocalWorkspaceSnapshot,
    accountState: AccountWorkspaceState
): AccountWorkspaceSyncMode {
    const localHasData = hasMeaningfulLocalWorkspaceData(localWorkspace);
    const accountHasData = accountState.summary.totalRecords > 0;
    const hasSnapshot = accountState.source === 'snapshot';
    const matches = accountWorkspaceMatchesLocal(localWorkspace, accountState.workspace);

    if (matches && (localHasData || accountHasData || hasSnapshot)) return 'synced';
    if (!localHasData && (accountHasData || hasSnapshot)) return 'restore';
    if (localHasData && !accountHasData && !hasSnapshot) return 'upload';
    if (
        localHasData &&
        hasSnapshot &&
        accountState.workspace.sourceWorkspaceId === localWorkspace.workspaceId
    ) return 'update';
    if (localHasData && (accountHasData || hasSnapshot)) return 'conflict';
    return 'empty';
}

export function createLocalWorkspaceFromAccountExport(
    current: LocalWorkspaceSnapshot,
    value: AccountWorkspaceExport
): LocalWorkspaceSnapshot {
    const accountWorkspace = parseAccountWorkspaceExport(value);
    if (hasMeaningfulLocalWorkspaceData(current)) {
        throw new Error(
            '이 기기에 이미 개인 데이터가 있어 계정 데이터로 덮어쓰지 않았습니다. 병합 기능이 필요합니다.'
        );
    }

    return materializeLocalWorkspaceFromAccountExport(current, accountWorkspace);
}

function materializeLocalWorkspaceFromAccountExport(
    current: LocalWorkspaceSnapshot,
    accountWorkspace: AccountWorkspaceExport,
): LocalWorkspaceSnapshot {

    const ownerId = current.workspaceId;
    const imported: LocalWorkspaceSnapshot = {
        schemaVersion: LOCAL_WORKSPACE_SCHEMA_VERSION,
        workspaceId: ownerId,
        deviceId: current.deviceId,
        createdAt: current.createdAt,
        updatedAt: accountWorkspace.exportedAt,
        categories: accountWorkspace.categories.map(row => ({ ...row, userId: ownerId })),
        brands: accountWorkspace.brands.map(row => ({ ...row, userId: ownerId })),
        cards: accountWorkspace.cards.map(row => ({ ...row, userId: ownerId })),
        rules: accountWorkspace.rules.map(row => ({ ...row, userId: ownerId })),
        performances: structuredClone(accountWorkspace.performances),
        history: structuredClone(accountWorkspace.history),
        benefitProfile: structuredClone(accountWorkspace.benefitProfile),
        recordMetadata: structuredClone(accountWorkspace.recordMetadata),
    };

    return parseLocalWorkspaceSnapshot(imported);
}

export function createLocalWorkspaceFromMergedAccountExport(
    current: LocalWorkspaceSnapshot,
    value: AccountWorkspaceExport,
): LocalWorkspaceSnapshot {
    const accountWorkspace = parseAccountWorkspaceExport(value);
    if (accountWorkspace.sourceWorkspaceId !== current.workspaceId) {
        throw new Error('병합 결과의 원본 workspace가 현재 기기와 일치하지 않습니다.');
    }
    return materializeLocalWorkspaceFromAccountExport(current, accountWorkspace);
}

export const createLocalWorkspaceClient = (
    storage: LocalWorkspaceStorage = browserLocalWorkspaceStorage,
) => ({
    read: () => readOrCreateLocalWorkspace(storage),

    async exportAccountWorkspace(exportedAt: Date | string = new Date()) {
        const workspace = await readOrCreateLocalWorkspace(storage);
        return createAccountWorkspaceExportFromLocal(workspace, exportedAt);
    },

    async previewAccountImport(value: AccountWorkspaceExport) {
        const accountWorkspace = parseAccountWorkspaceExport(value);
        const localWorkspace = await readOrCreateLocalWorkspace(storage);
        return {
            summary: summarizeAccountWorkspace(accountWorkspace),
            localHasData: hasMeaningfulLocalWorkspaceData(localWorkspace),
        };
    },

    async importAccountWorkspace(value: AccountWorkspaceExport) {
        return enqueueMutation(async () => {
            const current = await readOrCreateLocalWorkspace(storage);
            const imported = createLocalWorkspaceFromAccountExport(current, value);
            await storage.write(structuredClone(imported));
            return structuredClone(imported);
        });
    },

    async importMergedAccountWorkspace(value: AccountWorkspaceExport) {
        return enqueueMutation(async () => {
            const current = await readOrCreateLocalWorkspace(storage);
            const imported = createLocalWorkspaceFromMergedAccountExport(current, value);
            await storage.write(structuredClone(imported));
            return structuredClone(imported);
        });
    },

    async mergeSyncedAccountWorkspace(value: AccountWorkspaceExport) {
        return enqueueMutation(async () => {
            const current = await readOrCreateLocalWorkspace(storage);
            const remote = parseAccountWorkspaceExport(value);
            const local = createAccountWorkspaceExportFromLocal(
                current,
                current.updatedAt,
            );
            const plan = createAccountWorkspaceMergePlan(local, remote);
            const resolution = resolveAccountWorkspaceMerge(
                local,
                remote,
                createDefaultAccountWorkspaceMergeChoices(plan),
                {
                    sourceWorkspaceId: current.workspaceId,
                    exportedAt: new Date(),
                },
            );
            const imported = createLocalWorkspaceFromMergedAccountExport(
                current,
                resolution.workspace,
            );
            await storage.write(structuredClone(imported));
            return structuredClone(imported);
        });
    },

    createCategory(input: Pick<Category, 'name'>) {
        return mutateWorkspace((workspace, timestamp) => {
            const id = createId();
            const category: Category = {
                id,
                name: input.name.trim(),
                userId: workspace.workspaceId,
                order: workspace.categories.length,
            };
            workspace.categories.push(category);
            touchMetadata(workspace, metadataKey('categories', id), timestamp, id);
            return structuredClone(category);
        }, storage);
    },

    updateCategory(id: string, input: Pick<Category, 'name'>) {
        return mutateWorkspace((workspace, timestamp) => {
            const category = requireOwned(workspace, workspace.categories, id, '카테고리');
            category.name = input.name.trim();
            touchMetadata(workspace, metadataKey('categories', id), timestamp, id);
            return structuredClone(category);
        }, storage);
    },

    deleteCategory(id: string) {
        return mutateWorkspace((workspace, timestamp) => {
            requireOwned(workspace, workspace.categories, id, '카테고리');
            const deletedBrandIds = workspace.brands
                .filter(brand => brand.categoryId === id)
                .map(brand => brand.id);
            workspace.categories = workspace.categories.filter(category => category.id !== id);
            workspace.brands = workspace.brands.filter(brand => brand.categoryId !== id);
            workspace.rules = workspace.rules.map(rule => ({
                ...rule,
                ...(rule.category === id ? { category: undefined } : {}),
                includedBrands: (rule.includedBrands ?? []).filter(
                    brandId => !deletedBrandIds.includes(brandId)
                ),
                excludedBrands: (rule.excludedBrands ?? []).filter(
                    brandId => !deletedBrandIds.includes(brandId)
                ),
            }));
            markDeleted(workspace, metadataKey('categories', id), timestamp, id);
            deletedBrandIds.forEach(brandId => {
                markDeleted(workspace, metadataKey('brands', brandId), timestamp, brandId);
            });
        }, storage);
    },

    reorderCategories(orderedIds: string[]) {
        return mutateWorkspace((workspace, timestamp) => {
            const orderById = new Map(orderedIds.map((id, index) => [id, index]));
            workspace.categories = [...workspace.categories]
                .sort((left, right) => (
                    (orderById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
                    (orderById.get(right.id) ?? Number.MAX_SAFE_INTEGER)
                ))
                .map((category, index) => ({ ...category, order: index }));
            workspace.categories.forEach(category => {
                touchMetadata(
                    workspace,
                    metadataKey('categories', category.id),
                    timestamp,
                    category.id,
                );
            });
            return structuredClone(workspace.categories);
        }, storage);
    },

    createBrand(input: Pick<Brand, 'name' | 'categoryId' | 'iconName'>) {
        return mutateWorkspace((workspace, timestamp) => {
            const id = createId();
            const brand: Brand = {
                id,
                name: input.name.trim(),
                categoryId: input.categoryId,
                ...(input.iconName && { iconName: input.iconName }),
                userId: workspace.workspaceId,
                order: workspace.brands.filter(item => item.categoryId === input.categoryId).length,
            };
            workspace.brands.push(brand);
            touchMetadata(workspace, metadataKey('brands', id), timestamp, id);
            return structuredClone(brand);
        }, storage);
    },

    updateBrand(id: string, input: Pick<Brand, 'name'>) {
        return mutateWorkspace((workspace, timestamp) => {
            const brand = requireOwned(workspace, workspace.brands, id, '브랜드');
            brand.name = input.name.trim();
            touchMetadata(workspace, metadataKey('brands', id), timestamp, id);
            return structuredClone(brand);
        }, storage);
    },

    deleteBrand(id: string) {
        return mutateWorkspace((workspace, timestamp) => {
            requireOwned(workspace, workspace.brands, id, '브랜드');
            workspace.brands = workspace.brands.filter(brand => brand.id !== id);
            workspace.rules = workspace.rules.map(rule => ({
                ...rule,
                includedBrands: (rule.includedBrands ?? []).filter(brandId => brandId !== id),
                excludedBrands: (rule.excludedBrands ?? []).filter(brandId => brandId !== id),
            }));
            markDeleted(workspace, metadataKey('brands', id), timestamp, id);
        }, storage);
    },

    reorderBrands(categoryId: string, orderedIds: string[]) {
        return mutateWorkspace((workspace, timestamp) => {
            const orderById = new Map(orderedIds.map((id, index) => [id, index]));
            workspace.brands = workspace.brands.map(brand => brand.categoryId === categoryId
                ? { ...brand, order: orderById.get(brand.id) ?? brand.order }
                : brand);
            workspace.brands.filter(brand => brand.categoryId === categoryId).forEach(brand => {
                touchMetadata(
                    workspace,
                    metadataKey('brands', brand.id),
                    timestamp,
                    brand.id,
                );
            });
            return structuredClone(workspace.brands);
        }, storage);
    },

    createCard(input: LocalCardInput) {
        return mutateWorkspace((workspace, timestamp) => {
            const id = createId();
            const card: Card = {
                id,
                userId: workspace.workspaceId,
                name: input.name.trim(),
                company: input.company.trim(),
                color: input.color,
                limitTable: structuredClone(input.limitTable),
                ...(input.network && { network: input.network }),
            };
            workspace.cards.push(card);
            touchMetadata(workspace, metadataKey('cards', id), timestamp, id);
            return structuredClone(card);
        }, storage);
    },

    updateCard(id: string, input: LocalCardInput) {
        return mutateWorkspace((workspace, timestamp) => {
            const card = requireOwned(workspace, workspace.cards, id, '카드');
            Object.assign(card, {
                name: input.name.trim(),
                company: input.company.trim(),
                color: input.color,
                limitTable: structuredClone(input.limitTable),
                network: input.network,
            });
            touchMetadata(workspace, metadataKey('cards', id), timestamp, id);
            return structuredClone(card);
        }, storage);
    },

    createRule(input: LocalRuleInput) {
        return mutateWorkspace((workspace, timestamp) => {
            requireOwned(workspace, workspace.cards, input.cardId, '카드');
            const id = createId();
            const rule: BenefitRule = {
                id,
                userId: workspace.workspaceId,
                cardId: input.cardId,
                ...(input.category && { category: input.category }),
                includedBrands: [...input.includedBrands],
                excludedBrands: [...input.excludedBrands],
                platformType: input.platformType,
                ...(input.sharedGroupId && { sharedGroupId: input.sharedGroupId }),
                ...(input.usesCardLimit !== undefined && {
                    usesCardLimit: input.usesCardLimit,
                }),
                description: input.description.trim(),
                detail: input.detail,
                condition: structuredClone(input.condition),
                action: structuredClone(input.action),
                limitConfig: structuredClone(input.limitConfig),
            };
            workspace.rules.push(rule);
            touchMetadata(workspace, metadataKey('rules', id), timestamp, id);
            return structuredClone(rule);
        }, storage);
    },

    updateRule(id: string, input: LocalRuleInput) {
        return mutateWorkspace((workspace, timestamp) => {
            const rule = requireOwned(workspace, workspace.rules, id, '혜택');
            Object.assign(rule, {
                cardId: input.cardId,
                category: input.category || undefined,
                includedBrands: [...input.includedBrands],
                excludedBrands: [...input.excludedBrands],
                platformType: input.platformType,
                sharedGroupId: input.sharedGroupId || undefined,
                usesCardLimit: input.usesCardLimit,
                description: input.description.trim(),
                detail: input.detail,
                condition: structuredClone(input.condition),
                action: structuredClone(input.action),
                limitConfig: structuredClone(input.limitConfig),
            });
            touchMetadata(workspace, metadataKey('rules', id), timestamp, id);
            return structuredClone(rule);
        }, storage);
    },

    deleteRule(id: string) {
        return mutateWorkspace((workspace, timestamp) => {
            requireOwned(workspace, workspace.rules, id, '혜택');
            workspace.rules = workspace.rules.filter(rule => rule.id !== id);
            markDeleted(workspace, metadataKey('rules', id), timestamp, id);
        }, storage);
    },

    updatePerformance(
        cardId: string,
        amount: number,
        performanceMonth: string,
        targetAmount?: number | null,
    ) {
        return mutateWorkspace((workspace, timestamp) => {
            const existingIndex = workspace.performances.findIndex(item => (
                item.cardId === cardId && item.performanceMonth === performanceMonth
            ));
            const existing = existingIndex >= 0
                ? workspace.performances[existingIndex]
                : undefined;
            const nextTarget = targetAmount === undefined
                ? existing?.targetAmount
                : targetAmount ?? undefined;
            const performance: UserCardPerformance = {
                cardId,
                amount,
                performanceMonth,
                ...(nextTarget !== undefined && { targetAmount: nextTarget }),
            };
            if (existingIndex >= 0) workspace.performances[existingIndex] = performance;
            else workspace.performances.push(performance);
            touchMetadata(
                workspace,
                metadataKey('performances', `${cardId}:${performanceMonth}`),
                timestamp,
            );
            return structuredClone(performance);
        }, storage);
    },

    updateBenefitProfile(profile: UserBenefitProfile) {
        return mutateWorkspace((workspace, timestamp) => {
            workspace.benefitProfile = structuredClone(profile);
            touchMetadata(workspace, 'profile', timestamp);
            return structuredClone(workspace.benefitProfile);
        }, storage);
    },

    createTransaction(input: LocalCombinationTransactionInput) {
        return mutateWorkspace((workspace, timestamp) => {
            const id = createId();
            const cardSteps = input.combination.steps.filter(step => step.cardId);
            const cardStep = cardSteps[0];
            const performanceContributionAmount = input.combination.fundingType === 'CARD' &&
                input.combination.cardId
                ? Math.max(0, Math.floor(cardStep?.amountBefore ?? input.combination.payableAmount))
                : 0;
            const transaction: TransactionHistory = {
                id,
                date: timestamp,
                brandId: input.brandId,
                ...(input.combination.cardId && { cardId: input.combination.cardId }),
                ...(cardStep?.ruleId && { ruleId: cardStep.ruleId }),
                amount: input.amount,
                discountAmount: cardSteps
                    .filter(step => step.certainty === 'CONFIRMED')
                    .reduce((total, step) => total + step.benefitAmount, 0),
                ...(input.eligibleItemAmount !== undefined && {
                    eligibleItemAmount: input.eligibleItemAmount,
                }),
                ...(input.combination.payProviderId && {
                    payProviderId: input.combination.payProviderId,
                }),
                fundingType: input.combination.fundingType,
                combinationId: input.combination.id,
                confirmedValue: input.combination.confirmedValue,
                conditionalValue: input.combination.conditionalValue,
                estimatedValue: input.combination.estimatedValue,
                payableAmount: input.combination.payableAmount,
                laterReward: input.combination.laterReward,
                ...(performanceContributionAmount > 0 && { performanceContributionAmount }),
                combinationSnapshot: {
                    ...structuredClone(input.combination),
                    catalogVersion: input.catalogVersion,
                },
            };
            workspace.history.unshift(transaction);
            touchMetadata(workspace, metadataKey('history', id), timestamp, id);
            if (transaction.cardId && performanceContributionAmount > 0) {
                const performanceMonth = getCurrentMonthInKst(new Date(timestamp));
                const performanceIndex = workspace.performances.findIndex(item => (
                    item.cardId === transaction.cardId &&
                    item.performanceMonth === performanceMonth
                ));
                const currentPerformance = performanceIndex >= 0
                    ? workspace.performances[performanceIndex]
                    : undefined;
                const performance: UserCardPerformance = {
                    cardId: transaction.cardId,
                    performanceMonth,
                    amount: (currentPerformance?.amount ?? 0) + performanceContributionAmount,
                    ...(currentPerformance?.targetAmount !== undefined && {
                        targetAmount: currentPerformance.targetAmount,
                    }),
                };
                if (performanceIndex >= 0) workspace.performances[performanceIndex] = performance;
                else workspace.performances.push(performance);
                touchMetadata(
                    workspace,
                    metadataKey('performances', `${transaction.cardId}:${performanceMonth}`),
                    timestamp,
                );
            }
            return structuredClone(transaction);
        }, storage);
    },

    clearHistory() {
        return mutateWorkspace((workspace, timestamp) => {
            workspace.history.forEach(transaction => {
                markDeleted(
                    workspace,
                    metadataKey('history', String(transaction.id)),
                    timestamp,
                    String(transaction.id),
                );
            });
            workspace.history = [];
        }, storage);
    },

    resetPersonalData() {
        return mutateWorkspace((workspace, timestamp) => {
            Object.entries(workspace.recordMetadata).forEach(([key, metadata]) => {
                if (key === 'profile') return;
                workspace.recordMetadata[key] = {
                    ...metadata,
                    updatedAt: timestamp,
                    deletedAt: timestamp,
                };
            });
            workspace.categories = [];
            workspace.brands = [];
            workspace.cards = [];
            workspace.rules = [];
            workspace.performances = [];
            workspace.history = [];
            workspace.benefitProfile = createEmptyBenefitProfile();
            touchMetadata(workspace, 'profile', timestamp);
        }, storage);
    },

    async exportJson() {
        const workspace = await readOrCreateLocalWorkspace(storage);
        return JSON.stringify(workspace, null, 2);
    },

    async importJson(value: string) {
        const parsed = parseLocalWorkspaceSnapshot(JSON.parse(value));
        await enqueueMutation(() => storage.write(
            structuredClone(parsed),
            { queueSync: true },
        ));
        return structuredClone(parsed);
    },

    async purgePersonalData(options: WorkspaceCreationOptions = {}) {
        return enqueueMutation(async () => {
            const fresh = createEmptyLocalWorkspace(options);
            await storage.write(structuredClone(fresh));
            return structuredClone(fresh);
        });
    },
});

export const localWorkspaceClient = createLocalWorkspaceClient();
