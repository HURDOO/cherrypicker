import { describe, expect, it, vi } from 'vitest';
import type { BenefitCatalogSnapshot } from '@/types';
import {
    readCachedBenefitCatalog,
    revalidateBenefitCatalog,
    type BenefitCatalogCache,
    type CachedBenefitCatalog,
} from './benefit-catalog-client';

const snapshot: BenefitCatalogSnapshot = {
    schemaVersion: 1,
    catalogVersion: 'b'.repeat(64),
    generatedAt: '2026-08-18T09:00:00.000Z',
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    providers: [],
    subscriptionProducts: [],
    promotions: [],
    routeVerifications: [],
};

const createCache = (initial: CachedBenefitCatalog | null = null) => {
    let current = initial;
    const cache: BenefitCatalogCache = {
        read: vi.fn(async () => current),
        write: vi.fn(async entry => {
            current = entry;
        }),
    };
    return { cache, getCurrent: () => current };
};

describe('benefit catalog browser client', () => {
    it('stores a validated network snapshot with its ETag', async () => {
        const memory = createCache();
        const fetcher = vi.fn(async () => Response.json(snapshot, {
            headers: { ETag: '"catalog-etag"' },
        })) as unknown as typeof fetch;

        const result = await revalidateBenefitCatalog(null, memory.cache, fetcher);

        expect(result.source).toBe('network');
        expect(result.entry.snapshot).toEqual(snapshot);
        expect(result.entry.etag).toBe('"catalog-etag"');
        expect(memory.cache.write).toHaveBeenCalledOnce();
        expect(memory.getCurrent()?.snapshot.catalogVersion).toBe(snapshot.catalogVersion);
    });

    it('uses the cached snapshot for a matching 304 response', async () => {
        const cached: CachedBenefitCatalog = {
            key: 'current',
            snapshot,
            etag: '"catalog-etag"',
            cachedAt: '2026-08-18T09:01:00.000Z',
        };
        const memory = createCache(cached);
        const fetcher = vi.fn(async (_input, init) => {
            expect(new Headers(init?.headers).get('if-none-match')).toBe('"catalog-etag"');
            return new Response(null, { status: 304 });
        }) as unknown as typeof fetch;

        const result = await revalidateBenefitCatalog(
            cached,
            memory.cache,
            fetcher,
            '2026-08-18T10:00:00.000Z'
        );

        expect(result).toEqual({
            entry: {
                ...cached,
                checkedAt: '2026-08-18T10:00:00.000Z',
            },
            source: 'not-modified',
        });
        expect(memory.cache.write).toHaveBeenCalledOnce();
        expect(memory.getCurrent()?.checkedAt).toBe('2026-08-18T10:00:00.000Z');
    });

    it('rejects malformed network snapshots without replacing the cache', async () => {
        const cached: CachedBenefitCatalog = {
            key: 'current',
            snapshot,
            cachedAt: '2026-08-18T09:01:00.000Z',
        };
        const memory = createCache(cached);
        const fetcher = vi.fn(async () => Response.json({
            ...snapshot,
            schemaVersion: 2,
        })) as unknown as typeof fetch;

        await expect(revalidateBenefitCatalog(cached, memory.cache, fetcher))
            .rejects.toThrow('지원하지 않는 공개 카탈로그 schema 버전');
        expect(memory.cache.write).not.toHaveBeenCalled();
        expect(memory.getCurrent()).toBe(cached);
    });

    it('keeps usable network data when IndexedDB writes fail', async () => {
        const memory = createCache();
        memory.cache.write = vi.fn(async () => {
            throw new Error('quota exceeded');
        });
        const fetcher = vi.fn(async () => Response.json(snapshot)) as unknown as typeof fetch;

        const result = await revalidateBenefitCatalog(null, memory.cache, fetcher);

        expect(result.entry.snapshot).toEqual(snapshot);
        expect(result.cacheWarning?.message).toBe('quota exceeded');
    });

    it('keeps a usable 304 result when the new check time cannot be stored', async () => {
        const cached: CachedBenefitCatalog = {
            key: 'current',
            snapshot,
            etag: '"catalog-etag"',
            cachedAt: '2026-08-18T09:01:00.000Z',
        };
        const memory = createCache(cached);
        memory.cache.write = vi.fn(async () => {
            throw new Error('write blocked');
        });
        const fetcher = vi.fn(async () => new Response(null, { status: 304 })) as unknown as
            typeof fetch;

        const result = await revalidateBenefitCatalog(
            cached,
            memory.cache,
            fetcher,
            '2026-08-18T10:00:00.000Z'
        );

        expect(result.entry.checkedAt).toBe('2026-08-18T10:00:00.000Z');
        expect(result.cacheWarning?.message).toBe('write blocked');
    });

    it('reads through an injected cache implementation', async () => {
        const cached: CachedBenefitCatalog = {
            key: 'current',
            snapshot,
            cachedAt: '2026-08-18T09:01:00.000Z',
        };
        const memory = createCache(cached);

        await expect(readCachedBenefitCatalog(memory.cache)).resolves.toBe(cached);
    });
});
