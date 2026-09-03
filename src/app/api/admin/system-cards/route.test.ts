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
        parseInput: vi.fn(),
        createDraft: vi.fn(),
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
    parseSystemCardDraftInput: mocks.parseInput,
    createSystemCardDraft: mocks.createDraft,
    getSystemCardOnboardingData: mocks.getData,
}));

import { GET, POST } from './route';

const postRequest = (body: Record<string, unknown>) => new Request(
    'http://localhost/api/admin/system-cards',
    {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    },
);

describe('admin system card onboarding route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
        mocks.getData.mockReturnValue({ cards: [] });
        mocks.parseInput.mockReturnValue({ id: 'new_card' });
        mocks.createDraft.mockReturnValue({ id: 'new_card', catalogStatus: 'DRAFT' });
    });

    it('returns cards and their managed sources after admin authentication', async () => {
        const response = await GET(new Request('http://localhost/api/admin/system-cards'));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ cards: [] });
        expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    });

    it('validates and creates a draft without publishing it', async () => {
        const requestBody = { id: 'new_card', sources: [{ sourceUrl: 'https://card.example.com' }] };
        const response = await POST(postRequest(requestBody));

        expect(response.status).toBe(201);
        await expect(response.json()).resolves.toMatchObject({
            id: 'new_card',
            catalogStatus: 'DRAFT',
        });
        expect(mocks.parseInput).toHaveBeenCalledWith(requestBody);
        expect(mocks.createDraft).toHaveBeenCalledWith({ id: 'new_card' });
    });

    it('returns the onboarding validation error to the admin', async () => {
        mocks.parseInput.mockImplementation(() => {
            throw new mocks.SystemCardOnboardingError(400, '공식 출처가 필요합니다.');
        });
        const response = await POST(postRequest({ id: 'new_card' }));

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toEqual({ error: '공식 출처가 필요합니다.' });
    });
});
