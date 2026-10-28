'use client';

import React, { use } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { usePaymentAppPlatform } from '@/components/payment/PaymentAppButtons';
import { usePaymentAppPreferences } from '@/hooks/usePaymentAppPreferences';
import { appStoreUrl, isPaymentAppId, PAYMENT_APPS } from '@/utils/paymentAppLinks';

// Android Chrome lands here from an app button when the app is not installed.
export default function AppMissingPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const { app } = use(searchParams);
    const appId = isPaymentAppId(app) ? app : undefined;
    const router = useRouter();
    const platform = usePaymentAppPlatform();
    const { setHidden } = usePaymentAppPreferences();

    const goBack = () => {
        if (window.history.length > 1) router.back();
        else router.replace('/');
    };

    return (
        <main className="px-4 py-10">
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-amber-500 p-2 text-white">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base font-black text-amber-950">
                            {appId ? `${PAYMENT_APPS[appId].name} 앱이 없어요` : '앱을 열지 못했어요'}
                        </h1>
                        <p className="mt-1 text-xs font-bold leading-relaxed text-amber-900/80">
                            {appId
                                ? '이 폰에 앱이 설치되어 있지 않아서 열 수 없었어요. 설치하거나, 앞으로 이 버튼을 숨길 수 있어요.'
                                : '열려던 앱을 알 수 없어요. 추천 화면으로 돌아가 주세요.'}
                        </p>
                    </div>
                </div>
            </div>
            <div className="mt-5 space-y-2">
                {appId && (
                    <>
                        <a
                            href={appStoreUrl(appId, platform)}
                            className="flex min-h-12 items-center justify-center rounded-2xl bg-gray-900 text-sm font-black text-white"
                        >
                            {PAYMENT_APPS[appId].name} 설치하기
                        </a>
                        <button
                            type="button"
                            onClick={() => {
                                setHidden(appId, true);
                                goBack();
                            }}
                            className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-gray-200 bg-white text-sm font-black text-gray-800"
                        >
                            이 버튼 숨기고 돌아가기
                        </button>
                    </>
                )}
                <button
                    type="button"
                    onClick={goBack}
                    className="flex min-h-12 w-full items-center justify-center rounded-2xl text-sm font-black text-gray-500"
                >
                    추천으로 돌아가기
                </button>
            </div>
            {appId && (
                <p className="mt-4 text-center text-[11px] font-bold text-gray-400">
                    숨긴 버튼은 추천 화면에서 다시 보이게 할 수 있어요.
                </p>
            )}
        </main>
    );
}
