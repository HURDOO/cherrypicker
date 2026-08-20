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
    return {
        HttpError,
        requireAdmin: vi.fn(),
        collect: vi.fn(),
        reviewData: vi.fn(),
        review: vi.fn(),
        rollback: vi.fn(),
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

vi.mock('@/lib/card-benefit-ingestion', () => ({
    CardBenefitIngestionError: class CardBenefitIngestionError extends Error {},
    collectShinhanSolTravelBenefits: mocks.collect,
    getCardBenefitReviewData: mocks.reviewData,
    reviewCardBenefitCandidate: mocks.review,
    rollbackCardBenefitRevision: mocks.rollback,
}));

import { GET, PATCH, POST } from './route';

const jsonRequest = (method: string, body: Record<string, unknown>) => new Request(
    'http://localhost/api/admin/card-benefits',
    {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    },
);

describe('admin card benefit route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireAdmin.mockResolvedValue({ id: 'admin-1' });
        mocks.reviewData.mockReturnValue({ candidates: [], revisions: [] });
        mocks.collect.mockResolvedValue({ status: 'created' });
        mocks.review.mockReturnValue({ revision: 2 });
        mocks.rollback.mockReturnValue({ revision: 3 });
    });

    it('returns the private review queue after admin authentication', async () => {
        const response = await GET(new Request('http://localhost/api/admin/card-benefits'));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ candidates: [], revisions: [] });
        expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    });

    it('collects only the supported representative official source', async () => {
        const response = await POST(jsonRequest('POST', { action: 'collect-shinhan-sol' }));

        expect(response.status).toBe(201);
        expect(mocks.collect).toHaveBeenCalledOnce();

        const unsupported = await POST(jsonRequest('POST', { action: 'collect-other' }));
        expect(unsupported.status).toBe(400);
    });

    it('reviews and rolls back card benefit revisions with the authenticated admin ID', async () => {
        const approved = await PATCH(jsonRequest('PATCH', {
            action: 'review',
            candidateId: 'candidate-1',
            status: 'APPROVED',
        }));
        const rolledBack = await PATCH(jsonRequest('PATCH', {
            action: 'rollback',
            cardId: 'shinhan_sol',
            targetRevision: 1,
        }));

        expect(approved.status).toBe(200);
        expect(rolledBack.status).toBe(200);
        expect(mocks.review).toHaveBeenCalledWith('candidate-1', 'APPROVED', 'admin-1');
        expect(mocks.rollback).toHaveBeenCalledWith('shinhan_sol', 1, 'admin-1');
    });
});
