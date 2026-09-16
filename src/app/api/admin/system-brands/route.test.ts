import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class HttpError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    }
    class SystemCardOnboardingError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    }
    return {
        HttpError,
        SystemCardOnboardingError,
        requireAdmin: vi.fn(),
        parseBatch: vi.fn(),
        createBatch: vi.fn(),
        getData: vi.fn(),
    };
});

vi.mock('@/lib/api-server', () => ({
    HttpError: mocks.HttpError,
    requireAdmin: mocks.requireAdmin,
    readJsonObject: async (request: Request) => request.json(),
    handleRouteError: (error: unknown) => error instanceof mocks.HttpError
        ? Response.json({ error: error.message }, { status: error.status })
        : Response.json({ error: 'server error' }, { status: 500 }),
}));

vi.mock('@/lib/system-card-onboarding', () => ({
    SystemCardOnboardingError: mocks.SystemCardOnboardingError,
}));

vi.mock('@/lib/system-brand-registry', () => ({
    parseSystemBrandDraftBatchInput: mocks.parseBatch,
    createSystemBrandDraftBatch: mocks.createBatch,
    getSystemBrandRegistryData: mocks.getData,
}));

import { GET, POST } from './route';

describe('admin system brand registry route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
        mocks.getData.mockReturnValue({ categories: [], brands: [] });
        mocks.parseBatch.mockReturnValue([{
            id: 'doosan_bears_ticket_goods',
            name: '야구 홈경기 티켓/굿즈&용품',
            categoryId: 'movie',
        }]);
        mocks.createBatch.mockReturnValue([{
            id: 'doosan_bears_ticket_goods',
            name: '야구 홈경기 티켓/굿즈&용품',
            categoryId: 'movie',
        }]);
    });

    it('returns only after admin authentication', async () => {
        const response = await GET(new Request('http://localhost/api/admin/system-brands'));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ categories: [], brands: [] });
        expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    });

    it('registers validated public payment targets as data', async () => {
        const body = {
            brands: [{
                id: 'doosan_bears_ticket_goods',
                name: '야구 홈경기 티켓/굿즈&용품',
                categoryId: 'movie',
            }],
        };
        const response = await POST(new Request('http://localhost/api/admin/system-brands', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        }));

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toEqual({
            brands: [{
                id: 'doosan_bears_ticket_goods',
                name: '야구 홈경기 티켓/굿즈&용품',
                categoryId: 'movie',
            }],
        });
        expect(mocks.parseBatch).toHaveBeenCalledWith(body);
        expect(mocks.createBatch).toHaveBeenCalledOnce();
    });
});
