'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import clsx from 'clsx';
import { ArrowLeft, CheckCircle2, ChevronDown, Download, ExternalLink, Info } from 'lucide-react';
import { useAppInstall, useInstallGuidePlatform } from '@/hooks/useAppInstall';
import { APP_INSTALL_NAME, type InstallGuidePlatform } from '@/utils/appInstall';
import { kakaoTalkOpenExternalUrl } from '@/utils/inAppBrowser';

type GuideKey = Exclude<InstallGuidePlatform, 'kakaotalk' | 'other'>;

interface Guide {
    key: GuideKey;
    title: string;
    steps: string[];
    note?: { tone: 'info' | 'warning'; text: string };
}

const MOVE_DATA_STEPS = '이미 설정했다면 원래 브라우저의 설정 > 데이터 관리 > "JSON 내보내기"로 파일을 저장하고, ' +
    `설치한 ${APP_INSTALL_NAME} 앱의 설정 > 데이터 관리 > "JSON 가져오기"로 그 파일을 불러오세요.`;

const GUIDES: Guide[] = [
    {
        key: 'android-chrome',
        title: 'Android · Chrome',
        steps: [
            '오른쪽 위 ⋮ 메뉴를 눌러요.',
            '"앱 설치" 또는 "홈 화면에 추가"를 눌러요.',
            '"설치"를 누르면 홈 화면에 체리 아이콘이 생겨요.',
        ],
        note: {
            tone: 'info',
            text: 'Chrome에서 설정한 카드·기록이 설치한 앱에서도 그대로 보여요.',
        },
    },
    {
        key: 'samsung-internet',
        title: 'Android · 삼성 인터넷',
        steps: [
            '주소창에 설치 아이콘(아래 화살표)이 보이면 눌러요.',
            '없으면 아래쪽 ≡ 메뉴 > "현재 페이지 추가" > "홈 화면"을 눌러요.',
            '"추가"를 누르면 홈 화면에 체리 아이콘이 생겨요.',
        ],
        note: {
            tone: 'warning',
            text: '삼성 인터넷은 Chrome과 저장 공간이 따로예요. Chrome에서 이미 설정했다면 Chrome으로 설치하는 게 편해요. ' +
                MOVE_DATA_STEPS,
        },
    },
    {
        key: 'ios-safari',
        title: 'iPhone · Safari',
        steps: [
            '공유 버튼(네모에 위쪽 화살표)을 눌러요. 주소창 옆 ··· 메뉴 안에 있을 수도 있어요.',
            '목록을 내려 "홈 화면에 추가"를 눌러요.',
            '오른쪽 위 "추가"를 눌러요.',
            '홈 화면의 체리 아이콘으로 열어 처음 설정을 해요.',
        ],
        note: {
            tone: 'warning',
            text: 'iPhone은 홈 화면에 추가한 앱이 Safari와 저장 공간을 따로 써요. 먼저 설치하고, 설치한 앱에서 처음 설정을 하세요. ' +
                MOVE_DATA_STEPS,
        },
    },
    {
        key: 'ios-chrome',
        title: 'iPhone · Chrome',
        steps: [
            '주소창 오른쪽 공유 버튼(네모에 위쪽 화살표)을 눌러요.',
            '"홈 화면에 추가"를 눌러요. iOS 16.4 이상에서 보여요.',
            '"추가"를 누른 뒤 홈 화면의 체리 아이콘으로 열어 처음 설정을 해요.',
        ],
        note: {
            tone: 'warning',
            text: 'iPhone은 홈 화면에 추가한 앱이 브라우저와 저장 공간을 따로 써요. 먼저 설치하고, 설치한 앱에서 처음 설정을 하세요. ' +
                MOVE_DATA_STEPS,
        },
    },
    {
        key: 'desktop',
        title: 'PC · Chrome·Edge',
        steps: [
            '주소창 오른쪽 설치 아이콘(화면에 아래 화살표)을 눌러요.',
            '안 보이면 Chrome은 ⋮ 메뉴 > "전송, 저장, 공유" > "페이지를 앱으로 설치", Edge는 ··· 메뉴 > "앱" > "이 사이트를 앱으로 설치"를 눌러요.',
            '"설치"를 누르면 바탕화면과 시작 메뉴에서 열 수 있어요.',
        ],
    },
];

export default function InstallGuide() {
    const platform = useInstallGuidePlatform();
    const { canPrompt, standalone, install } = useAppInstall();
    // null follows the detected browser; 'none' means the user closed every guide.
    const [openKey, setOpenKey] = useState<GuideKey | 'none' | null>(null);
    const [installResult, setInstallResult] = useState<'accepted' | 'dismissed' | null>(null);

    const detectedKey = GUIDES.find(guide => guide.key === platform)?.key ?? null;
    const activeKey = openKey === null ? detectedKey : openKey === 'none' ? null : openKey;
    const orderedGuides = detectedKey
        ? [...GUIDES].sort((left, right) => Number(right.key === detectedKey) - Number(left.key === detectedKey))
        : GUIDES;

    return (
        <main className="min-h-screen bg-gray-50 pb-28">
            <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-gray-100 bg-white/90 px-3 py-2.5 backdrop-blur">
                <Link
                    href="/settings"
                    aria-label="설정으로 돌아가기"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
                >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </Link>
                <h1 className="text-[17px] font-black tracking-[-0.025em] text-gray-900">앱으로 설치하기</h1>
            </header>

            <div className="mx-auto max-w-lg space-y-4 px-4 pt-5">
                <section className="flex items-center gap-3 rounded-3xl border border-rose-100 bg-rose-50 p-4">
                    <Image
                        src="/app-icon/icon-192.png"
                        alt=""
                        width={48}
                        height={48}
                        className="h-12 w-12 shrink-0 rounded-2xl shadow-sm"
                    />
                    <p className="min-w-0 break-keep text-xs font-bold leading-relaxed text-gray-700">
                        자주 쓰면 홈 화면에 설치해 두는 게 편해요. 앱처럼 바로 열리고 주소창 없이 넓게 보여요.
                    </p>
                </section>

                {standalone ? (
                    <p className="flex items-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        지금 설치한 앱으로 쓰고 있어요.
                    </p>
                ) : platform === 'kakaotalk' ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="break-keep text-xs font-bold leading-relaxed text-amber-950">
                            카카오톡 안에서는 설치할 수 없어요. 기본 브라우저로 연 뒤 아래 방법으로 설치하세요.
                        </p>
                        <a
                            // Only rendered after hydration, when the platform is known in the browser.
                            href={kakaoTalkOpenExternalUrl(window.location.href)}
                            className="mt-3 flex min-h-11 items-center justify-center gap-1.5 rounded-2xl bg-gray-900 text-sm font-black text-white"
                        >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            기본 브라우저로 열기
                        </a>
                    </div>
                ) : canPrompt ? (
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => void install().then(outcome => {
                                if (outcome !== 'unavailable') setInstallResult(outcome);
                            })}
                            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 text-sm font-black text-white"
                        >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            앱 설치
                        </button>
                        <p className="text-center text-[11px] font-bold text-gray-400">
                            버튼이 안 되면 아래 방법을 따라 해 주세요.
                        </p>
                    </div>
                ) : null}
                {installResult === 'accepted' && !standalone && (
                    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800">
                        설치했어요. 홈 화면의 체리 아이콘으로 열어 보세요.
                    </p>
                )}

                <section aria-label="브라우저별 설치 방법" className="space-y-2">
                    {orderedGuides.map(guide => {
                        const isOpen = activeKey === guide.key;
                        return (
                            <div key={guide.key} className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
                                <button
                                    type="button"
                                    aria-expanded={isOpen}
                                    onClick={() => setOpenKey(isOpen ? 'none' : guide.key)}
                                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left"
                                >
                                    <span className="text-sm font-black text-gray-900">
                                        {guide.title}
                                        {guide.key === detectedKey && (
                                            <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">
                                                지금 브라우저
                                            </span>
                                        )}
                                    </span>
                                    <ChevronDown
                                        className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', isOpen && 'rotate-180')}
                                        aria-hidden="true"
                                    />
                                </button>
                                {isOpen && (
                                    <div className="border-t border-gray-50 px-4 pb-4 pt-3">
                                        <ol className="space-y-2">
                                            {guide.steps.map((step, index) => (
                                                <li key={step} className="flex gap-2.5 text-xs font-bold leading-relaxed text-gray-700">
                                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-900 text-[10px] font-black text-white">
                                                        {index + 1}
                                                    </span>
                                                    <span className="min-w-0 break-keep">{step}</span>
                                                </li>
                                            ))}
                                        </ol>
                                        {guide.note && (
                                            <p className={clsx(
                                                'mt-3 flex gap-2 rounded-2xl px-3 py-2.5 text-[11px] font-bold leading-relaxed break-keep',
                                                guide.note.tone === 'warning'
                                                    ? 'bg-amber-50 text-amber-900'
                                                    : 'bg-blue-50 text-blue-900',
                                            )}>
                                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                <span className="min-w-0">{guide.note.text}</span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </section>
            </div>
        </main>
    );
}
