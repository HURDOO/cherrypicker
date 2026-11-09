'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
    parsePaymentAppPreferences,
    type PaymentAppId,
    type PaymentAppPreferences,
} from '@/utils/paymentAppLinks';

// A per-browser convenience: which app buttons are hidden on this phone.
// `preferredModes` is the mode older versions remembered; it is only read now, as a fallback
// until the user saves an open mode in the workspace.
const STORAGE_KEY = 'cherrypicker:payment-apps';
const CHANGE_EVENT = 'cherrypicker:payment-apps-change';

function readRaw(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function subscribe(onChange: () => void) {
    window.addEventListener('storage', onChange);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(CHANGE_EVENT, onChange);
    };
}

function write(update: (current: PaymentAppPreferences) => PaymentAppPreferences) {
    const next = update(parsePaymentAppPreferences(readRaw()));
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage can be blocked; the buttons still work without remembering.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePaymentAppPreferences() {
    const raw = useSyncExternalStore(subscribe, readRaw, () => null);
    const preferences = useMemo(() => parsePaymentAppPreferences(raw), [raw]);

    const setHidden = useCallback((appId: PaymentAppId, hidden: boolean) => {
        write(current => ({
            ...current,
            hiddenAppIds: hidden
                ? [...new Set([...current.hiddenAppIds, appId])]
                : current.hiddenAppIds.filter(id => id !== appId),
        }));
    }, []);

    return { preferences, setHidden };
}
