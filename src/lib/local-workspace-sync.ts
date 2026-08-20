'use client';

import type { AccountWorkspaceExport } from '@/lib/account-workspace-export';
import type {
    AccountWorkspaceSyncOperation,
    AccountWorkspaceSyncPullResult,
    AccountWorkspaceSyncPushResult,
    LocalWorkspaceOutboxOperation,
    LocalWorkspaceSyncState,
    LocalWorkspaceSyncStatus,
} from '@/lib/account-workspace-sync-contract';
import { LOCAL_WORKSPACE_SYNC_STATE_KEY } from '@/lib/account-workspace-sync-contract';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import {
    LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
    LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
    openLocalWorkspaceDatabase,
    requestResult,
    transactionDone,
} from '@/lib/local-workspace-database';

export const WORKSPACE_SYNC_NEEDED_EVENT = 'cherrypicker:workspace-sync-needed';
export const WORKSPACE_SYNC_COMPLETED_EVENT = 'cherrypicker:workspace-sync-completed';

const RETRY_DELAYS_MS = [5_000, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];

const toIsoString = (value: Date | string = new Date()) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) throw new Error('동기화 시각이 올바르지 않습니다.');
    return date.toISOString();
};

const validateRevision = (revision: number) => {
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new Error('계정 동기화 revision이 올바르지 않습니다.');
    }
    return revision;
};

export const getWorkspaceSyncRetryDelay = (attemptCount: number) => (
    RETRY_DELAYS_MS[Math.min(
        Math.max(1, attemptCount) - 1,
        RETRY_DELAYS_MS.length - 1,
    )]
);

const readAllOutboxOperations = async (
    transaction: IDBTransaction,
) => requestResult<LocalWorkspaceOutboxOperation[]>(
    transaction.objectStore(LOCAL_WORKSPACE_OUTBOX_STORE_NAME).getAll()
).then(operations => operations.sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) ||
    left.operationId.localeCompare(right.operationId)
)));

export async function enableLocalWorkspaceSync(
    accountUserId: string,
    remoteRevision: number,
    now: Date | string = new Date(),
) {
    if (!accountUserId) throw new Error('동기화할 계정 ID가 필요합니다.');
    validateRevision(remoteRevision);
    const timestamp = toIsoString(now);
    const database = await openLocalWorkspaceDatabase();

    try {
        const transaction = database.transaction([
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
        ], 'readwrite');
        const done = transactionDone(transaction);
        const stateStore = transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME);
        const existingRequest = stateStore.get(
            LOCAL_WORKSPACE_SYNC_STATE_KEY
        ) as IDBRequest<LocalWorkspaceSyncState | undefined>;
        let validationError: Error | null = null;
        existingRequest.onsuccess = () => {
            const existing = existingRequest.result;
            if (existing && existing.accountUserId !== accountUserId) {
                validationError = new Error(
                    '이 기기는 다른 계정과 동기화되어 있습니다. 계정 전환 선택 기능이 필요합니다.',
                );
                transaction.abort();
                return;
            }
            stateStore.put({
                key: LOCAL_WORKSPACE_SYNC_STATE_KEY,
                accountUserId,
                remoteRevision,
                enabledAt: existing?.enabledAt ?? timestamp,
                lastSyncedAt: timestamp,
            } satisfies LocalWorkspaceSyncState);
            transaction.objectStore(LOCAL_WORKSPACE_OUTBOX_STORE_NAME).clear();
        };
        try {
            await done;
        } catch (error) {
            throw validationError ?? error;
        }
    } finally {
        database.close();
    }

    return getLocalWorkspaceSyncStatus(accountUserId);
}

export async function getLocalWorkspaceSyncStatus(
    accountUserId?: string,
): Promise<LocalWorkspaceSyncStatus | null> {
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
        ], 'readonly');
        const done = transactionDone(transaction);
        const [state, operations] = await Promise.all([
            requestResult<LocalWorkspaceSyncState | undefined>(
                transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME)
                    .get(LOCAL_WORKSPACE_SYNC_STATE_KEY)
            ),
            readAllOutboxOperations(transaction),
        ]);
        await done;
        if (!state) return null;
        if (accountUserId && state.accountUserId !== accountUserId) {
            throw new Error('이 기기는 현재 로그인한 계정이 아닌 다른 계정과 동기화되어 있습니다.');
        }
        return {
            ...state,
            pendingOperationCount: operations.filter(operation => (
                operation.accountUserId === state.accountUserId
            )).length,
        };
    } finally {
        database.close();
    }
}

async function readDueOutboxOperations(
    accountUserId: string,
    now: Date,
) {
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction(
            LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
            'readonly',
        );
        const done = transactionDone(transaction);
        const operations = await readAllOutboxOperations(transaction);
        await done;
        return operations.filter(operation => (
            operation.accountUserId === accountUserId &&
            new Date(operation.nextAttemptAt).getTime() <= now.getTime()
        ));
    } finally {
        database.close();
    }
}

async function acknowledgeOutboxOperation(
    operationId: string,
    accountUserId: string,
    remoteRevision: number,
    now: Date,
) {
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
        ], 'readwrite');
        const done = transactionDone(transaction);
        const stateStore = transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME);
        const stateRequest = stateStore.get(
            LOCAL_WORKSPACE_SYNC_STATE_KEY
        ) as IDBRequest<LocalWorkspaceSyncState | undefined>;
        let validationError: Error | null = null;
        stateRequest.onsuccess = () => {
            const state = stateRequest.result;
            if (!state || state.accountUserId !== accountUserId) {
                validationError = new Error('동기화 계정 상태가 변경되었습니다.');
                transaction.abort();
                return;
            }
            transaction.objectStore(LOCAL_WORKSPACE_OUTBOX_STORE_NAME).delete(operationId);
            stateStore.put({
                ...state,
                remoteRevision: Math.max(state.remoteRevision, validateRevision(remoteRevision)),
                lastSyncedAt: now.toISOString(),
                lastError: undefined,
                nextRetryAt: undefined,
                retryAttemptCount: undefined,
            } satisfies LocalWorkspaceSyncState);
        };
        try {
            await done;
        } catch (error) {
            throw validationError ?? error;
        }
    } finally {
        database.close();
    }
}

async function markOutboxOperationFailed(
    operation: LocalWorkspaceOutboxOperation,
    message: string,
    now: Date,
) {
    const attemptCount = operation.attemptCount + 1;
    const nextRetryAt = new Date(
        now.getTime() + getWorkspaceSyncRetryDelay(attemptCount),
    ).toISOString();
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction([
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            LOCAL_WORKSPACE_OUTBOX_STORE_NAME,
        ], 'readwrite');
        const done = transactionDone(transaction);
        const stateStore = transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME);
        transaction.objectStore(LOCAL_WORKSPACE_OUTBOX_STORE_NAME).put({
            ...operation,
            attemptCount,
            nextAttemptAt: nextRetryAt,
            lastError: message,
        } satisfies LocalWorkspaceOutboxOperation);
        const stateRequest = stateStore.get(
            LOCAL_WORKSPACE_SYNC_STATE_KEY
        ) as IDBRequest<LocalWorkspaceSyncState | undefined>;
        stateRequest.onsuccess = () => {
            const state = stateRequest.result;
            if (state && state.accountUserId === operation.accountUserId) {
                stateStore.put({
                    ...state,
                    lastError: message,
                    nextRetryAt,
                    retryAttemptCount: attemptCount,
                } satisfies LocalWorkspaceSyncState);
            }
        };
        await done;
    } finally {
        database.close();
    }
}

async function recordPullSuccess(
    accountUserId: string,
    remoteRevision: number,
    now: Date,
) {
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction(
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            'readwrite',
        );
        const done = transactionDone(transaction);
        const stateStore = transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME);
        const stateRequest = stateStore.get(
            LOCAL_WORKSPACE_SYNC_STATE_KEY
        ) as IDBRequest<LocalWorkspaceSyncState | undefined>;
        let validationError: Error | null = null;
        stateRequest.onsuccess = () => {
            const state = stateRequest.result;
            if (!state || state.accountUserId !== accountUserId) {
                validationError = new Error('동기화 계정 상태가 변경되었습니다.');
                transaction.abort();
                return;
            }
            stateStore.put({
                ...state,
                remoteRevision: validateRevision(remoteRevision),
                lastSyncedAt: now.toISOString(),
                lastError: undefined,
                nextRetryAt: undefined,
                retryAttemptCount: undefined,
            } satisfies LocalWorkspaceSyncState);
        };
        try {
            await done;
        } catch (error) {
            throw validationError ?? error;
        }
    } finally {
        database.close();
    }
}

async function markPullFailed(
    accountUserId: string,
    message: string,
    now: Date,
) {
    const database = await openLocalWorkspaceDatabase();
    try {
        const transaction = database.transaction(
            LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME,
            'readwrite',
        );
        const done = transactionDone(transaction);
        const stateStore = transaction.objectStore(LOCAL_WORKSPACE_SYNC_STATE_STORE_NAME);
        const stateRequest = stateStore.get(
            LOCAL_WORKSPACE_SYNC_STATE_KEY
        ) as IDBRequest<LocalWorkspaceSyncState | undefined>;
        stateRequest.onsuccess = () => {
            const state = stateRequest.result;
            if (!state || state.accountUserId !== accountUserId) return;
            const retryAttemptCount = (state.retryAttemptCount ?? 0) + 1;
            const nextRetryAt = new Date(
                now.getTime() + getWorkspaceSyncRetryDelay(retryAttemptCount),
            ).toISOString();
            stateStore.put({
                ...state,
                lastError: message,
                nextRetryAt,
                retryAttemptCount,
            } satisfies LocalWorkspaceSyncState);
        };
        await done;
    } finally {
        database.close();
    }
}

type WorkspaceSyncApi = {
    push: (operation: AccountWorkspaceSyncOperation) => Promise<AccountWorkspaceSyncPushResult>;
    pull: (afterRevision: number) => Promise<AccountWorkspaceSyncPullResult>;
};

type WorkspaceSyncLocalClient = {
    merge: (workspace: AccountWorkspaceExport) => Promise<unknown>;
};

export interface WorkspaceSyncRunResult {
    status: 'disabled' | 'offline' | 'waiting' | 'synced' | 'retrying';
    pushedOperationCount: number;
    pulled: boolean;
    pendingOperationCount: number;
    error?: string;
}

type WorkspaceSyncOptions = {
    force?: boolean;
    now?: Date;
    isOnline?: boolean;
    api?: WorkspaceSyncApi;
    localClient?: WorkspaceSyncLocalClient;
};

const defaultApi: WorkspaceSyncApi = {
    push: operation => apiClient.pushAccountWorkspaceOperation(operation),
    pull: revision => apiClient.pullAccountWorkspaceOperations(revision),
};

const defaultLocalClient: WorkspaceSyncLocalClient = {
    merge: workspace => localWorkspaceClient.mergeSyncedAccountWorkspace(workspace),
};

const syncRuns = new Map<string, Promise<WorkspaceSyncRunResult>>();

async function runWorkspaceSync(
    accountUserId: string,
    options: WorkspaceSyncOptions,
): Promise<WorkspaceSyncRunResult> {
    const now = options.now ?? new Date();
    const api = options.api ?? defaultApi;
    const localClient = options.localClient ?? defaultLocalClient;
    const online = options.isOnline ?? (
        typeof navigator === 'undefined' || navigator.onLine
    );
    const initialStatus = await getLocalWorkspaceSyncStatus(accountUserId);
    if (!initialStatus) {
        return {
            status: 'disabled',
            pushedOperationCount: 0,
            pulled: false,
            pendingOperationCount: 0,
        };
    }
    if (!online) {
        return {
            status: 'offline',
            pushedOperationCount: 0,
            pulled: false,
            pendingOperationCount: initialStatus.pendingOperationCount,
        };
    }

    const dueOperations = await readDueOutboxOperations(
        accountUserId,
        options.force ? new Date(8_640_000_000_000_000) : now,
    );
    let pushedOperationCount = 0;
    for (const queued of dueOperations) {
        const operation: AccountWorkspaceSyncOperation = {
            operationId: queued.operationId,
            deviceId: queued.deviceId,
            baseRevision: queued.baseRevision,
            workspace: queued.workspace,
        };
        try {
            const response = await api.push(operation);
            if (response.acknowledgedOperationId !== operation.operationId) {
                throw new Error('서버가 다른 동기화 operation을 확인했습니다.');
            }
            await localClient.merge(response.state.workspace);
            await acknowledgeOutboxOperation(
                operation.operationId,
                accountUserId,
                response.state.revision,
                now,
            );
            pushedOperationCount += 1;
        } catch (error) {
            const message = getErrorMessage(error, '계정 동기화에 실패했습니다.');
            await markOutboxOperationFailed(queued, message, now);
            const status = await getLocalWorkspaceSyncStatus(accountUserId);
            return {
                status: 'retrying',
                pushedOperationCount,
                pulled: false,
                pendingOperationCount: status?.pendingOperationCount ?? 1,
                error: message,
            };
        }
    }

    const statusBeforePull = await getLocalWorkspaceSyncStatus(accountUserId);
    if (!statusBeforePull) {
        return {
            status: 'disabled',
            pushedOperationCount,
            pulled: false,
            pendingOperationCount: 0,
        };
    }
    if (
        !options.force &&
        statusBeforePull.nextRetryAt &&
        new Date(statusBeforePull.nextRetryAt).getTime() > now.getTime()
    ) {
        return {
            status: 'waiting',
            pushedOperationCount,
            pulled: false,
            pendingOperationCount: statusBeforePull.pendingOperationCount,
        };
    }

    try {
        const response = await api.pull(statusBeforePull.remoteRevision);
        if (response.changed) {
            if (!response.state || response.state.revision !== response.toRevision) {
                throw new Error('서버의 증분 동기화 응답이 완전하지 않습니다.');
            }
            await localClient.merge(response.state.workspace);
        }
        await recordPullSuccess(accountUserId, response.toRevision, now);
        const finalStatus = await getLocalWorkspaceSyncStatus(accountUserId);
        return {
            status: 'synced',
            pushedOperationCount,
            pulled: response.changed,
            pendingOperationCount: finalStatus?.pendingOperationCount ?? 0,
        };
    } catch (error) {
        const message = getErrorMessage(error, '계정 변경사항을 내려받지 못했습니다.');
        await markPullFailed(accountUserId, message, now);
        const pending = await getLocalWorkspaceSyncStatus(accountUserId);
        return {
            status: 'retrying',
            pushedOperationCount,
            pulled: false,
            pendingOperationCount: pending?.pendingOperationCount ?? 0,
            error: message,
        };
    }
}

export function synchronizeLocalWorkspace(
    accountUserId: string,
    options: WorkspaceSyncOptions = {},
) {
    const current = syncRuns.get(accountUserId);
    if (current) return current;

    const run = runWorkspaceSync(accountUserId, options).finally(() => {
        if (syncRuns.get(accountUserId) === run) syncRuns.delete(accountUserId);
    });
    syncRuns.set(accountUserId, run);
    return run;
}
