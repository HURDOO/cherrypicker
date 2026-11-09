'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import {
    isKakaoTalkInAppBrowser,
    KAKAOTALK_HANDOFF_STORAGE_KEY,
    kakaoTalkOpenExternalUrl,
} from '@/utils/inAppBrowser';

const NOTICE_DELAY_MS = 1_500;
// When this page load tried the hand-off: 0 if an earlier load in this tab already tried.
let handoffAttemptedAt: number | null = null;

/**
 * Inside KakaoTalk, hands the page to the default browser once per tab. If the page is still
 * here afterwards (the hand-off failed, or the user came back), explains why and offers a button.
 */
export default function KakaoTalkHandoff() {
    const [externalUrl, setExternalUrl] = useState<string | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!isKakaoTalkInAppBrowser(navigator.userAgent)) return;

        if (handoffAttemptedAt === null) {
            let attemptedEarlier = false;
            try {
                attemptedEarlier = window.sessionStorage.getItem(KAKAOTALK_HANDOFF_STORAGE_KEY) === '1';
                window.sessionStorage.setItem(KAKAOTALK_HANDOFF_STORAGE_KEY, '1');
            } catch {
                // Without session storage the hand-off still runs once per page load, never in a loop.
            }
            handoffAttemptedAt = attemptedEarlier ? 0 : Date.now();
            if (!attemptedEarlier) {
                window.location.href = kakaoTalkOpenExternalUrl(window.location.href);
            }
        }

        // Give the hand-off time to leave; a remount or a later page load shows the notice at once.
        const delay = handoffAttemptedAt === 0
            ? 0
            : Math.max(0, NOTICE_DELAY_MS - (Date.now() - handoffAttemptedAt));
        const timer = window.setTimeout(() => {
            setExternalUrl(kakaoTalkOpenExternalUrl(window.location.href));
        }, delay);
        return () => window.clearTimeout(timer);
    }, []);

    if (!externalUrl || dismissed) return null;

    return (
        <div
            role="alert"
            className="fixed inset-x-0 top-0 z-[70] border-b border-amber-200 bg-amber-50 px-4 py-3 shadow-lg"
        >
            <div className="mx-auto max-w-md">
                <p className="text-sm font-black text-amber-950">기본 브라우저에서 열어 주세요</p>
                <p className="mt-1 break-keep text-xs font-bold leading-relaxed text-amber-900/80">
                    카카오톡 안에서 저장한 카드·기록은 Chrome이나 Safari와 따로 보관돼요.
                    다음에 다시 열 때 처음부터 설정하지 않도록 기본 브라우저로 열어 주세요.
                </p>
                <div className="mt-3 flex gap-2">
                    <a
                        href={externalUrl}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 px-3 text-sm font-black text-white"
                    >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        기본 브라우저로 열기
                    </a>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="min-h-11 rounded-2xl px-3 text-xs font-black text-amber-900/70"
                    >
                        여기서 계속
                    </button>
                </div>
            </div>
        </div>
    );
}
