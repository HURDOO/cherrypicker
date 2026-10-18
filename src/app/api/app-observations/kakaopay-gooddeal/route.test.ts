import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    ingestGoodDealObservation: vi.fn(),
}));

vi.mock('@/lib/promotion-collector', () => ({
    ingestGoodDealObservation: mocks.ingestGoodDealObservation,
}));

vi.mock('@/lib/api-server', async () => {
    const { HttpError } = await import('@/lib/http-error');
    return {
        HttpError,
        readJsonObject: async (request: Request) => request.json(),
        handleRouteError: (error: unknown) => error instanceof HttpError
            ? Response.json({ error: error.message }, { status: error.status })
            : Response.json({ error: 'server error' }, { status: 500 }),
    };
});

import { POST } from './route';

const TOKEN = 't'.repeat(40);

const upload = {
    observedAt: '2026-10-20T08:30:00+09:00',
    kakaopayVersion: '26.8.10',
    parserVersion: 2,
    status: 'ok',
    items: [{ brand: '투썸플레이스', rate: 20 }],
};

const request = (token: string | undefined, body: unknown = upload) => new Request(
    'http://localhost/api/app-observations/kakaopay-gooddeal',
    {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token && { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
    },
);

describe('GoodDeal observation upload route', () => {
    beforeEach(() => {
        vi.stubEnv('KAKAOPAY_GOODDEAL_UPLOAD_TOKEN', TOKEN);
        mocks.ingestGoodDealObservation.mockReset();
        mocks.ingestGoodDealObservation.mockReturnValue({ status: 'applied', reasons: [] });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('applies an upload carrying the device token', async () => {
        const response = await POST(request(TOKEN));

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({ status: 'applied', reasons: [] });
        expect(mocks.ingestGoodDealObservation).toHaveBeenCalledWith(expect.objectContaining({
            parserVersion: 2,
            items: [{ brand: '투썸플레이스', rate: 20 }],
        }));
    });

    it('rejects a missing or wrong token without reading the observation', async () => {
        expect((await POST(request(undefined))).status).toBe(401);
        expect((await POST(request('x'.repeat(40)))).status).toBe(401);
        expect(mocks.ingestGoodDealObservation).not.toHaveBeenCalled();
    });

    it('stays closed until the server has a long enough token', async () => {
        vi.stubEnv('KAKAOPAY_GOODDEAL_UPLOAD_TOKEN', 'short');

        expect((await POST(request('short'))).status).toBe(503);
        expect(mocks.ingestGoodDealObservation).not.toHaveBeenCalled();
    });

    it('answers 422 with the reasons when the gate holds the upload', async () => {
        mocks.ingestGoodDealObservation.mockReturnValue({
            status: 'held',
            reasons: ['직전 반영 브랜드 중 80%만 남았습니다.'],
        });

        const response = await POST(request(TOKEN));

        expect(response.status).toBe(422);
        await expect(response.json()).resolves.toMatchObject({
            reasons: ['직전 반영 브랜드 중 80%만 남았습니다.'],
        });
    });

    it('rejects an upload that is not a successful observation', async () => {
        const response = await POST(request(TOKEN, { ...upload, status: 'failed' }));

        expect(response.status).toBe(400);
        expect(mocks.ingestGoodDealObservation).not.toHaveBeenCalled();
    });
});
