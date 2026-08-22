import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BenefitCatalogSnapshot } from '@/types';
import {
    getBenefitCatalogEtag,
    matchesIfNoneMatch,
} from '@/lib/benefit-catalog-http';

const mocks = vi.hoisted(() => ({
    getBenefitCatalogSnapshot: vi.fn(),
}));

vi.mock('@/lib/benefit-catalog-server', () => ({
    getBenefitCatalogSnapshot: mocks.getBenefitCatalogSnapshot,
}));

import { GET } from './route';

const snapshot: BenefitCatalogSnapshot = {
    schemaVersion: 2,
    catalogVersion: 'a'.repeat(64),
    generatedAt: '2026-08-18T09:00:00.000Z',
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    providers: [],
    subscriptionProducts: [],
    promotions: [],
    routeVerifications: [],
    cardBenefitSupports: [],
};

describe('public benefit catalog route', () => {
    beforeEach(() => {
        mocks.getBenefitCatalogSnapshot.mockReset();
        mocks.getBenefitCatalogSnapshot.mockReturnValue(snapshot);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a public versioned snapshot without authentication', async () => {
        const response = GET(new Request('http://localhost/api/catalog'));

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe(
            'public, max-age=0, must-revalidate'
        );
        expect(response.headers.get('etag')).toBe(getBenefitCatalogEtag(snapshot));
        expect(response.headers.get('x-catalog-schema-version')).toBe('2');
        expect(response.headers.get('x-catalog-version')).toBe(snapshot.catalogVersion);
        await expect(response.json()).resolves.toEqual(snapshot);
        expect(mocks.getBenefitCatalogSnapshot).toHaveBeenCalledOnce();
    });

    it('returns 304 when a weak or strong If-None-Match value matches', async () => {
        const etag = getBenefitCatalogEtag(snapshot);
        const request = new Request('http://localhost/api/catalog', {
            headers: { 'If-None-Match': `"old", W/${etag}` },
        });

        const response = GET(request);

        expect(response.status).toBe(304);
        expect(response.headers.get('etag')).toBe(etag);
        expect(await response.text()).toBe('');
    });

    it('accepts the wildcard validator and rejects unrelated validators', () => {
        const etag = getBenefitCatalogEtag(snapshot);

        expect(matchesIfNoneMatch('*', etag)).toBe(true);
        expect(matchesIfNoneMatch('"different"', etag)).toBe(false);
        expect(matchesIfNoneMatch(null, etag)).toBe(false);
    });

    it('changes the representation ETag when only generation time changes', () => {
        const regenerated = {
            ...snapshot,
            generatedAt: '2026-08-19T09:00:00.000Z',
        };

        expect(regenerated.catalogVersion).toBe(snapshot.catalogVersion);
        expect(getBenefitCatalogEtag(regenerated)).not.toBe(getBenefitCatalogEtag(snapshot));
    });

    it('does not cache catalog build failures', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        mocks.getBenefitCatalogSnapshot.mockImplementationOnce(() => {
            throw new Error('broken catalog');
        });

        const response = GET(new Request('http://localhost/api/catalog'));

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toBe('no-store');
        await expect(response.json()).resolves.toEqual({
            error: '혜택 카탈로그를 불러오지 못했습니다.',
        });
        errorSpy.mockRestore();
    });
});
