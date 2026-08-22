'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getErrorMessage } from '@/lib/api-client';
import {
    readCachedBenefitCatalog,
    revalidateBenefitCatalog,
    type CachedBenefitCatalog,
} from '@/lib/benefit-catalog-client';
import { readOrCreateLocalWorkspace } from '@/lib/local-workspace';
import { WORKSPACE_SYNC_COMPLETED_EVENT } from '@/lib/local-workspace-sync';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';

const isAuthPath = (pathname: string) =>
    pathname === '/login' || pathname.startsWith('/login/') ||
    pathname === '/signup' || pathname.startsWith('/signup/');

async function loadLocalAppData() {
    const workspace = await readOrCreateLocalWorkspace();
    let cached: CachedBenefitCatalog | null = null;

    try {
        cached = await readCachedBenefitCatalog();
    } catch {
        // A fresh network snapshot can replace an unavailable or corrupt cache.
    }

    let catalog = cached?.snapshot ?? null;
    try {
        catalog = (await revalidateBenefitCatalog(cached)).entry.snapshot;
    } catch (error) {
        if (!catalog) throw error;
    }

    return {
        userId: workspace.workspaceId,
        storageMode: 'guest' as const,
        categories: [...catalog.categories, ...workspace.categories],
        brands: [...catalog.brands, ...workspace.brands],
        cards: [...catalog.cards, ...workspace.cards],
        rules: [...catalog.rules, ...workspace.rules],
        performances: workspace.performances,
        history: workspace.history,
        benefitProfile: workspace.benefitProfile,
    };
}

export function useAppData() {
    const pathname = usePathname();
    const { resetData, setInitialData, setLoading } = useAppStore();
    const addToast = useToastStore(state => state.addToast);
    const isLoaded = useRef(false);
    const requestVersion = useRef(0);

    useEffect(() => {
        if (isAuthPath(pathname)) {
            requestVersion.current += 1;
            setLoading(false);
            return;
        }
        if (isLoaded.current) return;

        isLoaded.current = true;
        const currentVersion = requestVersion.current + 1;
        requestVersion.current = currentVersion;
        resetData();
        setLoading(true);

        void loadLocalAppData()
            .then(data => {
                if (requestVersion.current !== currentVersion) return;
                setInitialData(data);
            })
            .catch(error => {
                if (requestVersion.current !== currentVersion) return;
                isLoaded.current = false;
                resetData();
                addToast(
                    getErrorMessage(error, '기기 저장 데이터를 불러오지 못했습니다.'),
                    'error'
                );
            });
    }, [addToast, pathname, resetData, setInitialData, setLoading]);

    useEffect(() => {
        if (isAuthPath(pathname)) return;

        const refreshSyncedData = () => {
            void loadLocalAppData()
                .then(data => setInitialData(data))
                .catch(error => addToast(
                    getErrorMessage(error, '동기화된 기기 데이터를 다시 불러오지 못했습니다.'),
                    'error',
                ));
        };

        window.addEventListener(WORKSPACE_SYNC_COMPLETED_EVENT, refreshSyncedData);
        return () => window.removeEventListener(
            WORKSPACE_SYNC_COMPLETED_EVENT,
            refreshSyncedData,
        );
    }, [addToast, pathname, setInitialData]);
}
