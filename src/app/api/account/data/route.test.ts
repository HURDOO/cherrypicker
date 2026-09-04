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
        mergeAccountWorkspaceSnapshot: vi.fn(),
    };
});

vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/schema', () => ({
    accountWorkspaceSnapshots: {},
    benefitRules: {},
    brands: {},
    cards: {},
    categories: {},
    transactionHistory: {},
    userBenefitProfiles: {},
    userCardPerformances: {},
}));
vi.mock('@/lib/api-server', () => ({
    HttpError: mocks.HttpError,
    requireUser: mocks.requireUser,
    readJsonObject: mocks.readJsonObject,
    handleRouteError: (error: unknown) => error instanceof mocks.HttpError
        ? Response.json({ error: error.message }, { status: error.status })
        : Response.json({ error: 'server error' }, { status: 500 }),
}));
vi.mock('@/lib/account-workspace-server', () => ({
    createAccountWorkspaceSnapshot: vi.fn(),
    getAccountWorkspaceState: vi.fn(),
    mergeAccountWorkspaceSnapshot: mocks.mergeAccountWorkspaceSnapshot,
    updateAccountWorkspaceSnapshot: vi.fn(),
}));

import { PATCH } from './route';

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
        smallBenefitThreshold: 100,
    },
});

describe('account workspace merge route', () => {
    beforeEach(() => {
        mocks.requireUser.mockReset();
        mocks.readJsonObject.mockReset();
        mocks.mergeAccountWorkspaceSnapshot.mockReset();
        mocks.requireUser.mockResolvedValue({ id: 'user-1' });
        mocks.readJsonObject.mockResolvedValue({ workspace, expectedRevision: 3 });
        mocks.mergeAccountWorkspaceSnapshot.mockReturnValue({
            workspace,
            revision: 4,
            source: 'snapshot',
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: true,
                hasWorkspacePreferences: true,
                totalRecords: 2,
            },
        });
    });

    it('merges an authenticated workspace against the expected revision', async () => {
        const request = new Request('http://localhost/api/account/data', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });

        const response = await PATCH(request);

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        expect(mocks.requireUser).toHaveBeenCalledWith(request);
        expect(mocks.readJsonObject).toHaveBeenCalledWith(request, 5 * 1024 * 1024);
        expect(mocks.mergeAccountWorkspaceSnapshot)
            .toHaveBeenCalledWith('user-1', workspace, 3);
        await expect(response.json()).resolves.toMatchObject({ revision: 4 });
    });

    it('rejects negative or non-integer revisions before merging', async () => {
        mocks.readJsonObject.mockResolvedValue({ workspace, expectedRevision: -1 });

        const response = await PATCH(new Request('http://localhost/api/account/data', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({
            error: '계정 workspace revision이 올바르지 않습니다.',
        });
        expect(mocks.mergeAccountWorkspaceSnapshot).not.toHaveBeenCalled();
    });
});
