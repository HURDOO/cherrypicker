import 'server-only';

import { createHash } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import {
    accountWorkspaceOperations,
    accountWorkspaceSnapshots,
} from '@/db/schema';
import {
    parseAccountWorkspaceExport,
    serializeAccountWorkspace,
    summarizeAccountWorkspace,
    type AccountWorkspaceState,
} from '@/lib/account-workspace-export';
import { mergeAccountWorkspaceSyncOperation } from '@/lib/account-workspace-sync';
import type {
    AccountWorkspaceSyncOperation,
    AccountWorkspaceSyncPullResult,
    AccountWorkspaceSyncPushResult,
} from '@/lib/account-workspace-sync-contract';
import { HttpError } from '@/lib/api-server';

const hashWorkspace = (workspace: AccountWorkspaceSyncOperation['workspace']) => createHash('sha256')
    .update(serializeAccountWorkspace(workspace))
    .digest('hex');

const hashOperation = (operation: AccountWorkspaceSyncOperation) => createHash('sha256')
    .update(operation.deviceId)
    .update('\n')
    .update(String(operation.baseRevision))
    .update('\n')
    .update(serializeAccountWorkspace(operation.workspace))
    .digest('hex');

const stateFromRow = (
    row: typeof accountWorkspaceSnapshots.$inferSelect,
): AccountWorkspaceState => {
    const workspace = parseAccountWorkspaceExport(row.snapshot);
    const contentHash = hashWorkspace(workspace);
    if (contentHash !== row.contentHash) {
        throw new Error('저장된 계정 workspace 무결성 검증에 실패했습니다.');
    }

    return {
        workspace,
        summary: summarizeAccountWorkspace(workspace),
        revision: row.revision,
        source: 'snapshot',
        contentHash,
        updatedAt: row.updatedAt.toISOString(),
    };
};

export function pushAccountWorkspaceOperation(
    userId: string,
    value: AccountWorkspaceSyncOperation,
): AccountWorkspaceSyncPushResult {
    const operation: AccountWorkspaceSyncOperation = {
        ...value,
        workspace: parseAccountWorkspaceExport(value.workspace),
    };
    const requestHash = hashOperation(operation);

    return db.transaction(tx => {
        const currentRow = tx.select().from(accountWorkspaceSnapshots)
            .where(eq(accountWorkspaceSnapshots.userId, userId))
            .get();
        if (!currentRow) {
            throw new HttpError(
                409,
                '자동 동기화 전에 이 기기 데이터를 계정에 처음 백업하거나 복원해주세요.',
            );
        }

        const existing = tx.select().from(accountWorkspaceOperations)
            .where(and(
                eq(accountWorkspaceOperations.userId, userId),
                eq(accountWorkspaceOperations.operationId, operation.operationId),
            ))
            .get();
        if (existing) {
            if (existing.requestHash !== requestHash) {
                throw new HttpError(
                    409,
                    '같은 operation ID에 다른 동기화 내용이 사용되었습니다.',
                );
            }
            return {
                acknowledgedOperationId: existing.operationId,
                appliedRevision: existing.appliedRevision,
                duplicate: true,
                staleBaseRevision: existing.staleBaseRevision,
                state: stateFromRow(currentRow),
            };
        }

        if (operation.baseRevision > currentRow.revision) {
            throw new HttpError(
                409,
                '이 기기가 알고 있는 계정 revision이 서버보다 앞서 있습니다. 다시 내려받아주세요.',
            );
        }

        const current = stateFromRow(currentRow);
        const merged = mergeAccountWorkspaceSyncOperation(
            operation.workspace,
            current.workspace,
        ).resolution.workspace;
        const contentHash = hashWorkspace(merged);
        const staleBaseRevision = operation.baseRevision < currentRow.revision;
        let appliedRow = currentRow;

        if (contentHash !== currentRow.contentHash) {
            appliedRow = tx.update(accountWorkspaceSnapshots)
                .set({
                    schemaVersion: merged.schemaVersion,
                    sourceWorkspaceId: merged.sourceWorkspaceId,
                    revision: currentRow.revision + 1,
                    contentHash,
                    snapshot: merged,
                    updatedAt: new Date(),
                })
                .where(eq(accountWorkspaceSnapshots.userId, userId))
                .returning()
                .get();
        }

        tx.insert(accountWorkspaceOperations).values({
            userId,
            operationId: operation.operationId,
            deviceId: operation.deviceId,
            baseRevision: operation.baseRevision,
            appliedRevision: appliedRow.revision,
            staleBaseRevision,
            requestHash,
            createdAt: new Date(),
        }).run();

        return {
            acknowledgedOperationId: operation.operationId,
            appliedRevision: appliedRow.revision,
            duplicate: false,
            staleBaseRevision,
            state: stateFromRow(appliedRow),
        };
    });
}

export function pullAccountWorkspaceOperations(
    userId: string,
    afterRevision: number,
): AccountWorkspaceSyncPullResult {
    const currentRow = db.select().from(accountWorkspaceSnapshots)
        .where(eq(accountWorkspaceSnapshots.userId, userId))
        .get();
    if (!currentRow) {
        throw new HttpError(
            409,
            '자동 동기화 전에 이 기기 데이터를 계정에 처음 백업하거나 복원해주세요.',
        );
    }
    if (afterRevision > currentRow.revision) {
        throw new HttpError(
            409,
            '이 기기가 알고 있는 계정 revision이 서버보다 앞서 있습니다. 다시 내려받아주세요.',
        );
    }

    const changed = currentRow.revision > afterRevision;
    const operationIds = changed
        ? db.select({ operationId: accountWorkspaceOperations.operationId })
            .from(accountWorkspaceOperations)
            .where(and(
                eq(accountWorkspaceOperations.userId, userId),
                gt(accountWorkspaceOperations.appliedRevision, afterRevision),
            ))
            .orderBy(asc(accountWorkspaceOperations.appliedRevision))
            .limit(100)
            .all()
            .map(row => row.operationId)
        : [];

    return {
        fromRevision: afterRevision,
        toRevision: currentRow.revision,
        changed,
        operationIds,
        ...(changed && { state: stateFromRow(currentRow) }),
    };
}
