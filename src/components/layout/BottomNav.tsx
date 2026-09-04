'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Settings } from 'lucide-react';
import clsx from 'clsx';

import { useAppStore } from '@/store/useAppStore';

export default function BottomNav() {
    const pathname = usePathname();
    const { setSelectedBrandId, workspacePreferences } = useAppStore();

    if (
        pathname === '/login' ||
        pathname === '/signup' ||
        pathname.startsWith('/setup') ||
        pathname.startsWith('/design-lab') ||
        pathname.startsWith('/admin') ||
        (
            pathname === '/' &&
            (
                workspacePreferences.firstSetup.status === 'NOT_STARTED' ||
                workspacePreferences.firstSetup.status === 'IN_PROGRESS'
            )
        )
    ) {
        return null;
    }

    const tabs = [
        { name: '추천', href: '/', icon: Home, onClick: () => setSelectedBrandId('') },
        { name: '히스토리', href: '/history', icon: History },
        { name: '설정', href: '/settings', icon: Settings },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-bottom z-50">
            <div className="max-w-md mx-auto flex justify-around items-center h-16">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href;

                    return (
                        <Link
                            key={tab.name}
                            href={tab.href}
                            onClick={tab.onClick}
                            className={clsx(
                                "flex flex-col items-center justify-center w-full h-full space-y-1",
                                isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            <Icon className={clsx("w-6 h-6", isActive && "fill-current opacity-20")} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-medium">{tab.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
