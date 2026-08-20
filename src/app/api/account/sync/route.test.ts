import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountWorkspaceExport } from '@/lib/account-workspace-export';

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
        requireUser: vi.fn(),
        readJsonObject: vi.fn(),
        push: vi.fn(),
        pull: vi.fn(),
    };
});

vi.mock('@/lib/api-server', () => ({
    HttpError: mocks.HttpError,
    requireUser: mocks.requireUser,
    readJsonObject: mocks.readJsonObject,
    handleRouteError: (error: unknown) => error instanceof mocks.HttpError
        ? Response.json({ error: error.message }, { status: error.status })
        : Response.json({ error: 'server error' }, { status: 500 }),
}));
vi.mock('@/lib/account-workspace-sync-server', () => ({
    pushAccountWorkspaceOperation: mocks.push,
    pullAccountWorkspaceOperations: mocks.pull,
}));

import { GET, POST } from './route';

const workspace = createAccountWorkspaceExport({
    sourceWorkspaceId: 'local-workspace',
    exportedAt: '2026-08-20T10:00:00.000Z',
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    performances: [],
    history: [],
    benefitProfile: {
        telecomMemberships: [],
        subscriptions: [],
        enabledPayProviderIds: ['npay'],
        moneyEnabled: true,
        pointsEnabled: true,
        pointValue: 1,
    },
});

describe('account workspace sync route', () => {
    beforeEach(() => {
        mocks.requireUser.mockReset();
        mocks.readJsonObject.mockReset();
        mocks.push.mockReset();
        mocks.pull.mockReset();
        mocks.requireUser.mockResolvedValue({ id: 'user-1' });
    });

    it('pushes a validated operation for the authenticated account', async () => {
        mocks.readJsonObject.mockResolvedValue({
            operationId: 'operation-1',
            deviceId: 'device-1',
            baseRevision: 3,
            workspace,
        });
        mocks.push.mockReturnValue({
            acknowledgedOperationId: 'operation-1',
            appliedRevision: 4,
            duplicate: false,
            staleBaseRevision: false,
            state: { workspace, revision: 4 },
        });
        const request = new Request('http://localhost/api/account/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        const response = await POST(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.push).toHaveBeenCalledWith('user-1', {
            operationId: 'operation-1',
            deviceId: 'device-1',
            baseRevision: 3,
            workspace,
        });
    });

    it('pulls only revisions after the supplied cursor', async () => {
        mocks.pull.mockReturnValue({
            fromRevision: 7,
            toRevision: 9,
            changed: true,
            operationIds: ['operation-2'],
            state: { workspace, revision: 9 },
        });

        const response = await GET(new Request(
            'http://localhost/api/account/sync?afterRevision=7',
        ));

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.pull).toHaveBeenCalledWith('user-1', 7);
    });

    it('rejects invalid revisions before calling the sync service', async () => {
        const response = await GET(new Request(
            'http://localhost/api/account/sync?afterRevision=-1',
        ));

        expect(response.status).toBe(400);
        expect(mocks.pull).not.toHaveBeenCalled();
    });
});
