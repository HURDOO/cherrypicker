import type { BenefitCatalogSnapshot } from '@/types';
import { parseBenefitCatalogSnapshot } from './benefit-catalog-contract';

const DATABASE_NAME = 'cherrypicker-catalog';
const DATABASE_VERSION = 1;
const STORE_NAME = 'snapshots';
const CURRENT_SNAPSHOT_KEY = 'current';

export interface CachedBenefitCatalog {
    key: typeof CURRENT_SNAPSHOT_KEY;
    snapshot: BenefitCatalogSnapshot;
    etag?: string;
    cachedAt: string;
    checkedAt?: string;
}

export interface BenefitCatalogCache {
    read: () => Promise<CachedBenefitCatalog | null>;
    write: (entry: CachedBenefitCatalog) => Promise<void>;
}

export interface BenefitCatalogRefreshResult {
    entry: CachedBenefitCatalog;
    source: 'network' | 'not-modified';
    cacheWarning?: Error;
}

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 요청에 실패했습니다.'));
});

const transactionDone = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(
        transaction.error ?? new Error('IndexedDB transaction이 취소되었습니다.')
    );
    transaction.onerror = () => reject(
        transaction.error ?? new Error('IndexedDB transaction에 실패했습니다.')
    );
});

const openCatalogDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
        reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
        return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(
        request.error ?? new Error('혜택 카탈로그 저장소를 열지 못했습니다.')
    );
    request.onblocked = () => reject(
        new Error('다른 탭이 혜택 카탈로그 저장소 갱신을 막고 있습니다.')
    );
});

export const browserBenefitCatalogCache: BenefitCatalogCache = {
    async read() {
        const database = await openCatalogDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const done = transactionDone(transaction);
            const raw = await requestResult<unknown>(
                transaction.objectStore(STORE_NAME).get(CURRENT_SNAPSHOT_KEY)
            );
            await done;
            if (!raw || typeof raw !== 'object') return null;

            const entry = raw as Partial<CachedBenefitCatalog>;
            if (
                entry.key !== CURRENT_SNAPSHOT_KEY ||
                typeof entry.cachedAt !== 'string' ||
                Number.isNaN(new Date(entry.cachedAt).getTime()) ||
                (entry.checkedAt !== undefined && (
                    typeof entry.checkedAt !== 'string' ||
                    Number.isNaN(new Date(entry.checkedAt).getTime())
                )) ||
                (entry.etag !== undefined && typeof entry.etag !== 'string')
            ) {
                throw new Error('저장된 혜택 카탈로그 metadata가 올바르지 않습니다.');
            }

            return {
                key: CURRENT_SNAPSHOT_KEY,
                snapshot: parseBenefitCatalogSnapshot(entry.snapshot),
                ...(entry.etag && { etag: entry.etag }),
                cachedAt: entry.cachedAt,
                ...(entry.checkedAt && { checkedAt: entry.checkedAt }),
            };
        } finally {
            database.close();
        }
    },

    async write(entry) {
        parseBenefitCatalogSnapshot(entry.snapshot);
        const database = await openCatalogDatabase();
        try {
            const transaction = database.transaction(STORE_NAME, 'readwrite');
            const done = transactionDone(transaction);
            transaction.objectStore(STORE_NAME).put(entry);
            await done;
        } finally {
            database.close();
        }
    },
};

export async function readCachedBenefitCatalog(
    cache: BenefitCatalogCache = browserBenefitCatalogCache
) {
    return cache.read();
}

export async function revalidateBenefitCatalog(
    cached: CachedBenefitCatalog | null,
    cache: BenefitCatalogCache = browserBenefitCatalogCache,
    fetcher: typeof fetch = fetch,
    now: Date | string = new Date()
): Promise<BenefitCatalogRefreshResult> {
    const headers = new Headers();
    if (cached?.etag) headers.set('If-None-Match', cached.etag);

    const response = await fetcher('/api/catalog', {
        cache: 'no-cache',
        credentials: 'same-origin',
        headers,
    });

    const checkedAt = (typeof now === 'string' ? new Date(now) : now).toISOString();

    if (response.status === 304) {
        if (!cached) {
            throw new Error('로컬 snapshot 없이 카탈로그 304 응답을 받았습니다.');
        }
        const entry = { ...cached, checkedAt };
        try {
            await cache.write(entry);
            return { entry, source: 'not-modified' };
        } catch (error) {
            return {
                entry,
                source: 'not-modified',
                cacheWarning: error instanceof Error
                    ? error
                    : new Error('혜택 카탈로그 확인 시각을 저장하지 못했습니다.'),
            };
        }
    }

    if (!response.ok) {
        throw new Error(`혜택 카탈로그 요청에 실패했습니다. (${response.status})`);
    }

    const snapshot = parseBenefitCatalogSnapshot(await response.json());
    const etag = response.headers.get('etag') ?? undefined;
    const entry: CachedBenefitCatalog = {
        key: CURRENT_SNAPSHOT_KEY,
        snapshot,
        ...(etag && { etag }),
        cachedAt: checkedAt,
        checkedAt,
    };

    try {
        await cache.write(entry);
        return { entry, source: 'network' };
    } catch (error) {
        return {
            entry,
            source: 'network',
            cacheWarning: error instanceof Error
                ? error
                : new Error('혜택 카탈로그를 기기에 저장하지 못했습니다.'),
        };
    }
}
