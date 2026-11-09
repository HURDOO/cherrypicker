'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { detectInstallGuidePlatform, type InstallGuidePlatform } from '@/utils/appInstall';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome, Edge and Samsung Internet fire this once per page load, often before the install
// page is open, so the listener lives at module level and the root layout imports it.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', event => {
        // Our own card and button offer the install, so the browser's banner stays quiet.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        notify();
    });
}

const subscribePrompt = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

const STANDALONE_QUERY = '(display-mode: standalone)';

const isStandalone = () => (
    window.matchMedia(STANDALONE_QUERY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
);

const subscribeDisplayMode = (listener: () => void) => {
    const query = window.matchMedia(STANDALONE_QUERY);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
};

export function useAppInstall() {
    const prompt = useSyncExternalStore(subscribePrompt, () => deferredPrompt, () => null);
    const standalone = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);

    const install = useCallback(async () => {
        const current = deferredPrompt;
        if (!current) return 'unavailable' as const;
        await current.prompt();
        const choice = await current.userChoice;
        // A prompt can be shown only once; the browser fires a new event if it allows another.
        deferredPrompt = null;
        notify();
        return choice.outcome;
    }, []);

    return { canPrompt: prompt !== null, standalone, install };
}

const subscribeNothing = () => () => undefined;
const readPlatform = () => detectInstallGuidePlatform(navigator.userAgent);

/** The browser guide to open first; `null` until the page runs in the browser. */
export function useInstallGuidePlatform(): InstallGuidePlatform | null {
    return useSyncExternalStore(subscribeNothing, readPlatform, () => null);
}
