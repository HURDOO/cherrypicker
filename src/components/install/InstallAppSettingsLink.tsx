'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useAppInstall } from '@/hooks/useAppInstall';

/** Settings entry to the per-browser install guide. */
export default function InstallAppSettingsLink() {
    const { standalone } = useAppInstall();

    return (
        <section>
            <Link
                href="/install"
                className="flex items-center gap-3 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm hover:bg-gray-50"
            >
                <Image
                    src="/app-icon/icon-192.png"
                    alt=""
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">앱으로 설치</p>
                    <p className="text-[10px] text-gray-500">
                        {standalone
                            ? '지금 설치한 앱으로 쓰고 있어요.'
                            : '홈 화면에 추가하는 방법을 브라우저별로 안내해요.'}
                    </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
            </Link>
        </section>
    );
}
