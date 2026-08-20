import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createAccountWorkspaceExport,
    serializeAccountWorkspace,
} from '@/lib/account-workspace-export';

const mocks = vi.hoisted(() => {
    class HttpError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    }

    return {
        HttpError,
        transaction: vi.fn(),
    };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-server', () => ({ HttpError: mocks.HttpError }));
vi.mock('@/db', () => ({
    db: { transaction: mocks.transaction },
}));

import { pushAccountWorkspaceOperation } from '@/lib/account-workspace-sync-server';

const profile = (payIds: string[]) => ({
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: payIds,
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
});

describe('account workspace sync server', () => {
    beforeEach(() => {
        mocks.transaction.mockReset();
    });

    it('applies the same operation ID only once and rejects a changed replay', () => {
        const original = createAccountWorkspaceExport({
            sourceWorkspaceId: 'workspace-1',
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: profile(['naverpay']),
        });
        const incoming = createAccountWorkspaceExport({
            sourceWorkspaceId: 'workspace-1',
            exportedAt: '2026-08-20T11:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: profile(['naverpay', 'kakaopay']),
        });
        incoming.recordMetadata.profile.id = original.recordMetadata.profile.id;
        incoming.recordMetadata.profile.createdAt = original.recordMetadata.profile.createdAt;
        let currentRow = {
            userId: 'user-1',
            schemaVersion: 1,
            sourceWorkspaceId: original.sourceWorkspaceId,
            revision: 1,
            contentHash: createHash('sha256')
                .update(serializeAccountWorkspace(original))
                .digest('hex'),
            snapshot: original,
            createdAt: new Date('2026-08-20T10:00:00.000Z'),
            updatedAt: new Date('2026-08-20T10:00:00.000Z'),
        };
        let storedOperation: Record<string, unknown> | undefined;
        const update = vi.fn(() => ({
            set: (values: Partial<typeof currentRow>) => ({
                where: () => ({
                    returning: () => ({
                        get: () => {
                            currentRow = { ...currentRow, ...values };
                            return currentRow;
                        },
                    }),
                }),
            }),
        }));
        const insert = vi.fn(() => ({
            values: (values: Record<string, unknown>) => ({
                run: () => {
                    storedOperation = { id: 1, ...values };
                },
            }),
        }));
        mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) => {
            let selectIndex = 0;
            return callback({
                select: () => ({
                    from: () => ({
                        where: () => ({
                            get: () => selectIndex++ === 0
                                ? currentRow
                                : storedOperation,
                        }),
                    }),
                }),
                update,
                insert,
            });
        });
        const operation = {
            operationId: 'operation-1',
            deviceId: 'device-1',
            baseRevision: 1,
            workspace: incoming,
        };

        const first = pushAccountWorkspaceOperation('user-1', operation);
        const replay = pushAccountWorkspaceOperation('user-1', operation);

        expect(first).toMatchObject({
            duplicate: false,
            appliedRevision: 2,
            state: { revision: 2 },
        });
        expect(replay).toMatchObject({
            duplicate: true,
            appliedRevision: 2,
            state: { revision: 2 },
        });
        expect(update).toHaveBeenCalledOnce();
        expect(insert).toHaveBeenCalledOnce();

        const changedReplay = structuredClone(operation);
        changedReplay.workspace.benefitProfile.enabledPayProviderIds.push('different-pay');
        expect(() => pushAccountWorkspaceOperation('user-1', changedReplay))
            .toThrow('같은 operation ID에 다른 동기화 내용');
    });
});
