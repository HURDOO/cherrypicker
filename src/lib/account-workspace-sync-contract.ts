import type {
    AccountWorkspaceExport,
    AccountWorkspaceState,
} from '@/lib/account-workspace-export';

export const LOCAL_WORKSPACE_SYNC_STATE_KEY = 'current' as const;

export interface AccountWorkspaceSyncOperation {
    operationId: string;
    deviceId: string;
    baseRevision: number;
    workspace: AccountWorkspaceExport;
}

export interface AccountWorkspaceSyncPushResult {
    acknowledgedOperationId: string;
    appliedRevision: number;
    duplicate: boolean;
    staleBaseRevision: boolean;
    state: AccountWorkspaceState;
}

export interface AccountWorkspaceSyncPullResult {
    fromRevision: number;
    toRevision: number;
    changed: boolean;
    operationIds: string[];
    state?: AccountWorkspaceState;
}

export interface LocalWorkspaceSyncState {
    key: typeof LOCAL_WORKSPACE_SYNC_STATE_KEY;
    accountUserId: string;
    remoteRevision: number;
    enabledAt: string;
    lastSyncedAt: string;
    lastError?: string;
    nextRetryAt?: string;
    retryAttemptCount?: number;
}

export interface LocalWorkspaceOutboxOperation extends AccountWorkspaceSyncOperation {
    accountUserId: string;
    createdAt: string;
    attemptCount: number;
    nextAttemptAt: string;
    lastError?: string;
}

export interface LocalWorkspaceSyncStatus extends LocalWorkspaceSyncState {
    pendingOperationCount: number;
}
