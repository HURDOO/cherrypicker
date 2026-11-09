'use client';

import { useCallback, useState } from 'react';
import { getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import type { PaymentPreferences } from '@/types';

/** Payment settings saved in the workspace, so they follow the account to other devices. */
export function useWorkspacePaymentPreferences() {
    const payment = useAppStore(state => state.workspacePreferences.payment);
    const setWorkspacePreferences = useAppStore(state => state.setWorkspacePreferences);
    const addToast = useToastStore(state => state.addToast);
    const [isSaving, setIsSaving] = useState(false);

    const update = useCallback(async (
        change: (current: PaymentPreferences) => PaymentPreferences,
    ): Promise<boolean> => {
        // Read the latest state so two quick taps do not overwrite each other.
        const current = useAppStore.getState().workspacePreferences;
        setIsSaving(true);
        try {
            const saved = await localWorkspaceClient.updateWorkspacePreferences({
                ...current,
                payment: change(current.payment),
            });
            setWorkspacePreferences(saved);
            return true;
        } catch (error) {
            addToast(getErrorMessage(error, '결제수단 설정을 저장하지 못했습니다.'), 'error');
            return false;
        } finally {
            setIsSaving(false);
        }
    }, [addToast, setWorkspacePreferences]);

    return { payment, update, isSaving };
}
