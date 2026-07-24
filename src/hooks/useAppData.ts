'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    ApiRequestError,
    UNAUTHORIZED_EVENT,
    apiClient,
    getErrorMessage,
} from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';

const isAuthPath = (pathname: string) =>
    pathname === '/login' || pathname.startsWith('/login/') ||
    pathname === '/signup' || pathname.startsWith('/signup/');

export function useAppData() {
    const pathname = usePathname();
    const router = useRouter();
    const { data: session, isPending: isSessionPending } = authClient.useSession();
    const userId = session?.user.id ?? null;
    const { resetData, setInitialData, setLoading } = useAppStore();
    const addToast = useToastStore(state => state.addToast);
    const loadedUserId = useRef<string | null>(null);
    const requestVersion = useRef(0);

    useEffect(() => {
        const handleUnauthorized = () => {
            requestVersion.current += 1;
            loadedUserId.current = null;
            resetData();
            router.replace('/login');
        };

        window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    }, [resetData, router]);

    useEffect(() => {
        if (isAuthPath(pathname)) {
            requestVersion.current += 1;
            loadedUserId.current = null;
            resetData();
            return;
        }

        if (isSessionPending) {
            setLoading(true);
            return;
        }

        if (!userId) {
            requestVersion.current += 1;
            loadedUserId.current = null;
            resetData();
            router.replace('/login');
            return;
        }

        if (loadedUserId.current === userId) return;

        loadedUserId.current = userId;
        const currentVersion = requestVersion.current + 1;
        requestVersion.current = currentVersion;
        resetData();
        setLoading(true);

        const loadAppData = async () => {
            try {
                const data = await apiClient.getAppData();
                if (requestVersion.current !== currentVersion) return;
                if (loadedUserId.current !== userId) return;
                setInitialData(data);
            } catch (error: unknown) {
                if (requestVersion.current !== currentVersion) return;
                loadedUserId.current = null;
                resetData();

                if (error instanceof ApiRequestError && error.status === 401) {
                    router.replace('/login');
                    return;
                }

                addToast(getErrorMessage(error, '앱 데이터를 불러오지 못했습니다.'), 'error');
            }
        };

        void loadAppData();
    }, [
        addToast,
        isSessionPending,
        pathname,
        resetData,
        router,
        setInitialData,
        setLoading,
        userId,
    ]);
}
