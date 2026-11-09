'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { CreditCard, ExternalLink } from 'lucide-react';
import { usePaymentAppPreferences } from '@/hooks/usePaymentAppPreferences';
import { useWorkspacePaymentPreferences } from '@/hooks/useWorkspacePaymentPreferences';
import type { PaymentOpenMode, PaymentPayId, PaymentPreferences } from '@/types';
import {
    appStoreUrl,
    buildPaymentAppHref,
    detectPaymentAppPlatform,
    PAYMENT_APPS,
    pickLink,
    type PaymentAppAction,
    type PaymentAppId,
    type PaymentAppPlatform,
} from '@/utils/paymentAppLinks';
import {
    getOpenMode,
    getPayRouteStatus,
    orderPayMethods,
    PAYMENT_PAY_NAMES,
    setPayRouteCheck,
    type PayRouteStatus,
} from '@/utils/paymentPreferences';

// If the page is still on screen this long after a tap, the app did not open.
const APP_OPEN_TIMEOUT_MS = 1600;

const PAY_LOGO_URLS: Record<PaymentPayId, string> = {
    kakaopay: '/brand-logos/providers/kakaopay.png',
    naverpay: '/brand-logos/providers/naverpay.png',
};

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

/** Notices when a tapped app link left the page on screen, i.e. the app did not open. */
function useAppOpenWatcher() {
    const [notOpenedAppId, setNotOpenedAppId] = useState<PaymentAppId | null>(null);
    const timerRef = useRef<number | undefined>(undefined);

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

    const watch = useCallback((appId: PaymentAppId) => {
        setNotOpenedAppId(null);
        if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = undefined;
            if (document.visibilityState === 'visible') setNotOpenedAppId(appId);
        }, APP_OPEN_TIMEOUT_MS);
    }, []);

    return { notOpenedAppId, watch, clear: () => setNotOpenedAppId(null) };
}

function AppMissingNotice({
    appId,
    platform,
    onHide,
}: {
    appId: PaymentAppId;
    platform: PaymentAppPlatform;
    onHide: () => void;
}) {
    return (
        <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[11px] font-black text-amber-900">
                {PAYMENT_APPS[appId].name} 앱이 열리지 않았어요. 설치되어 있지 않을 수 있어요.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                <a
                    href={appStoreUrl(appId, platform)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center rounded-xl bg-amber-900 px-3 text-[11px] font-black text-white"
                >
                    설치하기
                </a>
                <button
                    type="button"
                    onClick={onHide}
                    className="inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-3 text-[11px] font-black text-amber-900"
                >
                    이 버튼 숨기기
                </button>
            </div>
        </div>
    );
}

const modeLabel = (mode: PaymentOpenMode, action: PaymentAppAction) => (
    pickLink(action.links, mode).label
);

/** The saved mode for this app: the workspace setting, then what this browser used last. */
function useOpenMode() {
    const { preferences } = usePaymentAppPreferences();
    const { payment } = useWorkspacePaymentPreferences();
    return useCallback((action: PaymentAppAction): PaymentOpenMode | undefined => (
        action.payId
            ? getOpenMode(payment, action.payId, preferences.preferredModes[action.appId])
            : undefined
    ), [payment, preferences.preferredModes]);
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
    const { preferences, setHidden } = usePaymentAppPreferences();
    const { notOpenedAppId, watch, clear } = useAppOpenWatcher();
    const openModeFor = useOpenMode();
    const app = PAYMENT_APPS[action.appId];

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

    const link = pickLink(action.links, openModeFor(action));

    return (
        <div className="space-y-2" data-testid={`payment-app-${action.appId}`}>
            <a
                href={buildPaymentAppHref(action.appId, link, platform, origin)}
                onClick={() => watch(action.appId)}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-4 text-xs font-black text-white"
            >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {action.title ?? app.name} {link.label} 열기
            </a>
            {action.hint && (
                <p className="text-[10px] font-bold leading-relaxed opacity-70">{action.hint}</p>
            )}
            {action.payId && action.links.length > 1 && (
                <p className="text-[10px] font-bold opacity-60">
                    여는 방식은{' '}
                    <Link href="/settings#payment-methods" className="underline underline-offset-2">
                        설정
                    </Link>
                    에서 바꿀 수 있어요.
                </p>
            )}
            {notOpenedAppId && (
                <AppMissingNotice
                    appId={notOpenedAppId}
                    platform={platform}
                    onHide={() => {
                        setHidden(notOpenedAppId, true);
                        clear();
                    }}
                />
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

const ROUTE_STATUS: Record<PayRouteStatus | 'CARD', { label: string; mark: string; className: string }> = {
    CARD: { label: '카드 혜택 확정', mark: '✓', className: 'bg-emerald-500' },
    APPLIED: { label: '카드 혜택 확인됨', mark: '✓', className: 'bg-emerald-500' },
    UNCHECKED: { label: '카드 혜택 확인 필요', mark: '?', className: 'bg-amber-400' },
    NOT_APPLIED: { label: '카드 혜택 빠짐', mark: '!', className: 'bg-rose-500' },
};

/** A small corner mark for whether the card benefit comes through on this route. */
function StatusMark({ status }: { status: PayRouteStatus | 'CARD' }) {
    const item = ROUTE_STATUS[status];
    return (
        <span
            title={item.label}
            className={clsx(
                'absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-black leading-none text-white',
                item.className,
            )}
        >
            <span aria-hidden="true">{item.mark}</span>
            <span className="sr-only">{item.label}</span>
        </span>
    );
}

function RouteCheckPrompt({
    payId,
    mode,
    cardCompany,
    modeText,
    onAnswer,
}: {
    payId: PaymentPayId;
    mode: PaymentOpenMode;
    cardCompany: string;
    modeText: string;
    onAnswer: (applied: boolean | undefined, payment: (current: PaymentPreferences) => PaymentPreferences) => void;
}) {
    const answer = (applied: boolean | undefined) => onAnswer(
        applied,
        current => applied === undefined
            ? current
            : setPayRouteCheck(current, { payId, mode, cardCompany }, applied),
    );
    return (
        <div className="rounded-2xl border border-gray-200 bg-white/80 p-3" data-testid="pay-route-check">
            <p className="text-[11px] font-black text-gray-900">
                {PAYMENT_PAY_NAMES[payId]} {modeText}로 낸 {cardCompany} 혜택이 들어왔나요?
            </p>
            <p className="mt-0.5 text-[10px] font-bold text-gray-500">
                카드사 앱 이용내역에서 볼 수 있어요. 알려 주시면 다음부터 표시해 드려요.
            </p>
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={() => answer(true)}
                    className="min-h-11 flex-1 rounded-xl bg-emerald-600 px-2 text-[11px] font-black text-white"
                >
                    들어왔어요
                </button>
                <button
                    type="button"
                    onClick={() => answer(false)}
                    className="min-h-11 flex-1 rounded-xl border border-rose-200 bg-white px-2 text-[11px] font-black text-rose-700"
                >
                    안 들어왔어요
                </button>
                <button
                    type="button"
                    onClick={() => answer(undefined)}
                    className="min-h-11 rounded-xl px-2 text-[11px] font-bold text-gray-500"
                >
                    나중에
                </button>
            </div>
        </div>
    );
}

/**
 * A row of payment methods for a plain card payment, where no pay adds a benefit.
 * Each pay opens its app in one tap with the saved mode; the card itself needs no app.
 */
export function PaymentMethodPicker({
    actions,
    cardName,
    cardCompany,
    defaultMethod,
}: {
    actions: Partial<Record<PaymentPayId, PaymentAppAction>>;
    cardName?: string;
    cardCompany?: string;
    defaultMethod: 'CARD' | PaymentPayId;
}) {
    const platform = usePaymentAppPlatform();
    const origin = useOrigin();
    const { preferences, setHidden } = usePaymentAppPreferences();
    const { payment, update } = useWorkspacePaymentPreferences();
    const openModeFor = useOpenMode();
    const { notOpenedAppId, watch, clear } = useAppOpenWatcher();
    const [openedPayId, setOpenedPayId] = useState<PaymentPayId | null>(null);

    const payIds = (Object.keys(actions) as PaymentPayId[])
        .filter(payId => !preferences.hiddenAppIds.includes(actions[payId]!.appId));
    if (platform === 'other' || payIds.length === 0) return null;

    const methods = orderPayMethods(payIds, defaultMethod);
    const statusOf = (payId: PaymentPayId, mode: PaymentOpenMode) => (
        cardCompany ? getPayRouteStatus(payment, { payId, mode, cardCompany }) : 'UNCHECKED'
    );
    const openedAction = openedPayId ? actions[openedPayId] : undefined;
    const openedMode = openedAction ? openModeFor(openedAction) : undefined;

    return (
        <div className="mt-3 space-y-2" data-testid="payment-method-picker">
            <div className="flex items-center justify-between">
                <p className="text-[11px] font-black opacity-80">누르면 바로 열려요</p>
                <Link
                    href="/settings#payment-methods"
                    className="text-[10px] font-bold opacity-60 underline underline-offset-2"
                >
                    설정
                </Link>
            </div>
            <div
                className="grid gap-2 pt-2"
                style={{ gridTemplateColumns: `repeat(${methods.length}, minmax(0, 1fr))` }}
            >
                {methods.map(method => {
                    const isDefault = method === methods[0];
                    const defaultTag = isDefault && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gray-900 px-2 py-0.5 text-[9px] font-black leading-none text-white">
                            기본
                        </span>
                    );
                    if (method === 'CARD') {
                        return (
                            <div
                                key="CARD"
                                className={clsx(
                                    'relative flex flex-col items-center justify-center gap-1.5 rounded-3xl border border-dashed bg-white/50 py-3',
                                    isDefault ? 'border-gray-900' : 'border-gray-300',
                                )}
                                data-testid="pay-method-CARD"
                            >
                                {defaultTag}
                                <StatusMark status="CARD" />
                                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-600">
                                    <CreditCard className="h-6 w-6" aria-hidden="true" />
                                </span>
                                <span className="text-xs font-black text-gray-700">카드로 내기</span>
                            </div>
                        );
                    }
                    const action = actions[method]!;
                    const link = pickLink(action.links, openModeFor(action) ?? 'SAMSUNG_PAY');
                    return (
                        <a
                            key={method}
                            href={buildPaymentAppHref(action.appId, link, platform, origin)}
                            onClick={() => {
                                setOpenedPayId(method);
                                watch(action.appId);
                            }}
                            aria-label={`${PAYMENT_PAY_NAMES[method]} ${link.label}로 열기`}
                            className={clsx(
                                'relative flex flex-col items-center justify-center gap-1.5 rounded-3xl bg-white py-3 shadow-[0_3px_0_rgba(17,24,39,0.12)] transition-transform active:translate-y-0.5 active:shadow-none',
                                isDefault ? 'border-2 border-gray-900' : 'border border-gray-200',
                            )}
                            data-testid={`pay-method-${method}`}
                        >
                            {defaultTag}
                            <StatusMark status={statusOf(method, link.mode)} />
                            {/* eslint-disable-next-line @next/next/no-img-element -- small static app icon */}
                            <img src={PAY_LOGO_URLS[method]} alt="" className="h-12 w-12 rounded-2xl" />
                            <span className="text-xs font-black text-gray-900">{PAYMENT_PAY_NAMES[method]}</span>
                        </a>
                    );
                })}
            </div>
            <p className="text-[10px] font-bold opacity-70">
                페이 앱에서는 {cardName ?? '추천 카드'}로 결제하세요.
            </p>
            {notOpenedAppId && (
                <AppMissingNotice
                    appId={notOpenedAppId}
                    platform={platform}
                    onHide={() => {
                        setHidden(notOpenedAppId, true);
                        clear();
                        setOpenedPayId(null);
                    }}
                />
            )}
            {!notOpenedAppId && openedPayId && openedAction && openedMode && cardCompany &&
                statusOf(openedPayId, pickLink(openedAction.links, openedMode).mode) === 'UNCHECKED' && (
                <RouteCheckPrompt
                    payId={openedPayId}
                    mode={pickLink(openedAction.links, openedMode).mode}
                    cardCompany={cardCompany}
                    modeText={modeLabel(openedMode, openedAction)}
                    onAnswer={(applied, change) => {
                        setOpenedPayId(null);
                        if (applied !== undefined) void update(change);
                    }}
                />
            )}
        </div>
    );
}
