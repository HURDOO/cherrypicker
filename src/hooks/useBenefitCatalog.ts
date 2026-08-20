'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    readCachedBenefitCatalog,
    revalidateBenefitCatalog,
    type CachedBenefitCatalog,
} from '@/lib/benefit-catalog-client';
import { assessBenefitCatalogHealth } from '@/lib/benefit-catalog-freshness';

type BenefitCatalogState = {
    entry: CachedBenefitCatalog | null;
    isLoading: boolean;
    isRefreshing: boolean;
    isOnline: boolean;
    error: Error | null;
    cacheWarning: Error | null;
};

const initialState: BenefitCatalogState = {
    entry: null,
    isLoading: true,
    isRefreshing: true,
    isOnline: true,
    error: null,
    cacheWarning: null,
};

export function useBenefitCatalog() {
    const [state, setState] = useState<BenefitCatalogState>(initialState);
    const requestVersion = useRef(0);
    const active = useRef(false);
    const currentEntry = useRef<CachedBenefitCatalog | null>(null);

    const refresh = useCallback(async (readCacheFirst: boolean = false) => {
        const version = requestVersion.current + 1;
        requestVersion.current = version;
        let cached = currentEntry.current;
        let cacheReadError: Error | null = null;

        if (readCacheFirst) {
            try {
                cached = await readCachedBenefitCatalog();
                currentEntry.current = cached;
                if (active.current && requestVersion.current === version && cached) {
                    setState(current => ({
                        ...current,
                        entry: cached,
                        isLoading: false,
                        isRefreshing: true,
                        error: null,
                        cacheWarning: null,
                    }));
                }
            } catch (error) {
                cacheReadError = error instanceof Error
                    ? error
                    : new Error('저장된 혜택 정보를 읽지 못했습니다.');
                // Network data can still be used when IndexedDB is unavailable or corrupt.
            }
        } else if (active.current) {
            setState(current => ({
                ...current,
                isRefreshing: true,
                error: null,
            }));
        }

        const isOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
        if (active.current && requestVersion.current === version) {
            setState(current => ({ ...current, isOnline }));
        }
        if (!isOnline) {
            if (!active.current || requestVersion.current !== version) return;
            setState(current => ({
                ...current,
                entry: cached ?? current.entry,
                isLoading: false,
                isRefreshing: false,
                error: new Error('현재 네트워크가 오프라인입니다.'),
                cacheWarning: cacheReadError,
            }));
            return;
        }

        try {
            const refreshed = await revalidateBenefitCatalog(cached);
            if (!active.current || requestVersion.current !== version) return;
            currentEntry.current = refreshed.entry;
            setState({
                entry: refreshed.entry,
                isLoading: false,
                isRefreshing: false,
                isOnline: true,
                error: null,
                cacheWarning: refreshed.cacheWarning ?? null,
            });
        } catch (error) {
            if (!active.current || requestVersion.current !== version) return;
            setState(current => ({
                ...current,
                entry: cached ?? current.entry,
                isLoading: false,
                isRefreshing: false,
                error: error instanceof Error
                    ? error
                    : new Error('혜택 카탈로그를 불러오지 못했습니다.'),
                cacheWarning: cacheReadError,
            }));
        }
    }, []);

    useEffect(() => {
        active.current = true;

        const handleFocus = () => void refresh(false);
        const handleOnline = () => {
            setState(current => ({ ...current, isOnline: true }));
            void refresh(false);
        };
        const handleOffline = () => {
            requestVersion.current += 1;
            setState(current => ({
                ...current,
                isOnline: false,
                isLoading: false,
                isRefreshing: false,
                error: new Error('현재 네트워크가 오프라인입니다.'),
            }));
        };

        void refresh(true);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            active.current = false;
            requestVersion.current += 1;
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [refresh]);

    const snapshot = state.entry?.snapshot ?? null;
    const health = assessBenefitCatalogHealth({
        snapshot,
        isOnline: state.isOnline,
        isRefreshing: state.isRefreshing,
        refreshError: state.error,
    });

    return {
        ...state,
        snapshot,
        health,
        isStale: health.isStale,
        lastCheckedAt: state.entry?.checkedAt ?? state.entry?.cachedAt,
        refresh: () => refresh(false),
    };
}
