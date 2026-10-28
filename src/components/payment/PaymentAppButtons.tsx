'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ExternalLink } from 'lucide-react';
import { usePaymentAppPreferences } from '@/hooks/usePaymentAppPreferences';
import {
    appStoreUrl,
    buildPaymentAppHref,
    detectPaymentAppPlatform,
    orderLinks,
    PAYMENT_APPS,
    type PaymentAppAction,
    type PaymentAppLink,
    type PaymentAppPlatform,
} from '@/utils/paymentAppLinks';

// If the page is still on screen this long after a tap, the app did not open.
const APP_OPEN_TIMEOUT_MS = 1600;

const noopSubscribe = () => () => {};

export function usePaymentAppPlatform(): PaymentAppPlatform {
    return useSyncExternalStore(
        noopSubscribe,
        () => detectPaymentAppPlatform(navigator.userAgent, navigator.maxTouchPoints),
        () => 'other',
    );
}

function useOrigin(): string {
    return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => '');
}

function PaymentAppButton({
    action,
    platform,
    origin,
}: {
    action: PaymentAppAction;
    platform: PaymentAppPlatform;
    origin: string;
}) {
    const { preferences, setHidden, setPreferredMode } = usePaymentAppPreferences();
    const [notOpened, setNotOpened] = useState(false);
    const timerRef = useRef<number | undefined>(undefined);
    const app = PAYMENT_APPS[action.appId];

    useEffect(() => {
        const cancel = () => {
            if (document.visibilityState === 'hidden' && timerRef.current !== undefined) {
                window.clearTimeout(timerRef.current);
                timerRef.current = undefined;
            }
        };
        document.addEventListener('visibilitychange', cancel);
        window.addEventListener('pagehide', cancel);
        return () => {
            document.removeEventListener('visibilitychange', cancel);
            window.removeEventListener('pagehide', cancel);
            if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
        };
    }, []);

    if (preferences.hiddenAppIds.includes(action.appId)) {
        return (
            <button
                type="button"
                onClick={() => setHidden(action.appId, false)}
                className="min-h-11 text-[10px] font-bold text-gray-500 underline underline-offset-2"
            >
                {app.name} 열기 버튼 다시 보이기
            </button>
        );
    }

    const links = orderLinks(action.links, preferences.preferredModes[action.appId]);
    const [primary, ...others] = links;

    const handleOpen = (link: PaymentAppLink) => {
        if (action.links.length > 1) setPreferredMode(action.appId, link.mode);
        setNotOpened(false);
        if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = undefined;
            if (document.visibilityState === 'visible') setNotOpened(true);
        }, APP_OPEN_TIMEOUT_MS);
    };

    return (
        <div className="space-y-2" data-testid={`payment-app-${action.appId}`}>
            <div className="flex flex-wrap items-center gap-2">
                <a
                    href={buildPaymentAppHref(action.appId, primary, platform, origin)}
                    onClick={() => handleOpen(primary)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-4 text-xs font-black text-white"
                >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {action.title ?? app.name} {primary.label} 열기
                </a>
                {others.map(link => (
                    <a
                        key={link.mode}
                        href={buildPaymentAppHref(action.appId, link, platform, origin)}
                        onClick={() => handleOpen(link)}
                        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-gray-200 bg-white px-3 text-[11px] font-black text-gray-700"
                    >
                        {link.label}로 열기
                    </a>
                ))}
            </div>
            {action.hint && (
                <p className="text-[10px] font-bold leading-relaxed opacity-70">{action.hint}</p>
            )}
            {notOpened && (
                <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] font-black text-amber-900">
                        {app.name} 앱이 열리지 않았어요. 설치되어 있지 않을 수 있어요.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <a
                            href={appStoreUrl(action.appId, platform)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center rounded-xl bg-amber-900 px-3 text-[11px] font-black text-white"
                        >
                            설치하기
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                setHidden(action.appId, true);
                                setNotOpened(false);
                            }}
                            className="inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-3 text-[11px] font-black text-amber-900"
                        >
                            이 버튼 숨기기
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/** Buttons that open the payment or membership app. Shown only on phones. */
export function PaymentAppButtons({ actions }: { actions: PaymentAppAction[] }) {
    const platform = usePaymentAppPlatform();
    const origin = useOrigin();
    if (platform === 'other' || actions.length === 0) return null;
    return (
        <div className="mt-3 space-y-3">
            {actions.map(action => (
                <PaymentAppButton key={action.appId} action={action} platform={platform} origin={origin} />
            ))}
        </div>
    );
}
