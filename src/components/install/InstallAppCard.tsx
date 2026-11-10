'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Download, X } from 'lucide-react';
import { useAppInstall, useInstallGuidePlatform } from '@/hooks/useAppInstall';
import {
    INSTALL_CARD_STORAGE_KEY,
    type InstallCardState,
    kstDay,
    parseInstallCardState,
    recordFirstRecommendation,
    recordInstallCardVisit,
    shouldShowInstallCard,
} from '@/utils/appInstall';

// A per-browser convenience: when this browser first opened home, whether the first-recommendation
// tutorial finished here, and whether the card was closed.
const CHANGE_EVENT = 'cherrypicker:install-card-change';

function readRaw(): string | null {
    try {
        return window.localStorage.getItem(INSTALL_CARD_STORAGE_KEY);
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

function write(update: (current: InstallCardState) => InstallCardState) {
    const current = parseInstallCardState(readRaw());
    const next = update(current);
    if (next === current) return;
    try {
        window.localStorage.setItem(INSTALL_CARD_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage can be blocked; then the card simply never shows.
        return;
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

const subscribeNothing = () => () => undefined;

/** Lets the home card show right after the tutorial's first recommendation. */
export function markFirstRecommendationForInstallCard() {
    write(recordFirstRecommendation);
}

/** "Install as an app" suggestion on home, after the first recommendation or from the second visit day. */
export default function InstallAppCard() {
    const raw = useSyncExternalStore(subscribe, readRaw, () => null);
    const state = useMemo(() => parseInstallCardState(raw), [raw]);
    const today = useSyncExternalStore(subscribeNothing, () => kstDay(new Date()), () => '');
    const platform = useInstallGuidePlatform();
    const { canPrompt, standalone, install } = useAppInstall();

    useEffect(() => {
        write(current => recordInstallCardVisit(current, kstDay(new Date())));
    }, []);

    if (
        !today ||
        platform === null ||
        platform === 'kakaotalk' ||
        !shouldShowInstallCard(state, today, { standalone })
    ) {
        return null;
    }

    const dismiss = () => write(current => ({ ...current, dismissed: true }));

    return (
        <section
            aria-label="앱으로 설치"
            className="rounded-3xl border border-rose-100 bg-rose-50 p-4"
        >
            <div className="flex items-start gap-3">
                <Image
                    src="/app-icon/icon-192.png"
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-xl shadow-sm"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-gray-900">자주 쓰면 앱으로 설치</p>
                    <p className="mt-0.5 break-keep text-[11px] font-bold leading-relaxed text-gray-600">
                        홈 화면에서 바로 열고, 주소창 없이 넓게 쓸 수 있어요.
                    </p>
                </div>
                <button
                    type="button"
                    aria-label="앱 설치 안내 닫기"
                    onClick={dismiss}
                    className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-white/70"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
            <div className="mt-3 flex gap-2">
                {canPrompt && (
                    <button
                        type="button"
                        onClick={() => void install()}
                        className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-3 text-xs font-black text-white"
                    >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        앱 설치
                    </button>
                )}
                <Link
                    href="/install"
                    className="flex min-h-10 flex-1 items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 text-xs font-black text-gray-800"
                >
                    설치 방법 보기
                </Link>
            </div>
        </section>
    );
}
