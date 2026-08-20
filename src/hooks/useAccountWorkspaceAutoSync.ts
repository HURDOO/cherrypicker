'use client';

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
    synchronizeLocalWorkspace,
    WORKSPACE_SYNC_COMPLETED_EVENT,
    WORKSPACE_SYNC_NEEDED_EVENT,
} from '@/lib/local-workspace-sync';

const AUTO_SYNC_INTERVAL_MS = 30_000;

export function useAccountWorkspaceAutoSync() {
    const { user } = useAuth();
    const userId = user?.id;

    const runSync = useCallback(async (force = false) => {
        if (!userId) return;
        try {
            const result = await synchronizeLocalWorkspace(userId, { force });
            if (
                typeof window !== 'undefined' &&
                (result.pushedOperationCount > 0 || result.pulled)
            ) {
                window.dispatchEvent(new CustomEvent(WORKSPACE_SYNC_COMPLETED_EVENT, {
                    detail: result,
                }));
            }
        } catch {
            // The persisted sync status exposes failures and the next retry time.
        }
    }, [userId]);

    useEffect(() => {
        if (!userId) return;

        const onSyncNeeded = () => void runSync();
        const onOnline = () => void runSync(true);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') void runSync();
        };
        const interval = window.setInterval(() => void runSync(), AUTO_SYNC_INTERVAL_MS);

        window.addEventListener(WORKSPACE_SYNC_NEEDED_EVENT, onSyncNeeded);
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisibilityChange);
        void runSync();

        return () => {
            window.clearInterval(interval);
            window.removeEventListener(WORKSPACE_SYNC_NEEDED_EVENT, onSyncNeeded);
            window.removeEventListener('online', onOnline);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
    }, [runSync, userId]);
}
