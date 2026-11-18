'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, History, Settings } from 'lucide-react';
import clsx from 'clsx';

import { useAppStore } from '@/store/useAppStore';

// Inputs marked with this attribute hide the nav while focused, so the keyboard only lifts the input.
export const HIDE_BOTTOM_NAV_ATTRIBUTE = 'data-hide-bottom-nav';

function subscribeToFocus(onChange: () => void) {
    // activeElement can still point at the blurred input during focusout, so re-read it after.
    const onFocusOut = () => window.setTimeout(onChange);
    document.addEventListener('focusin', onChange);
    document.addEventListener('focusout', onFocusOut);
    return () => {
        document.removeEventListener('focusin', onChange);
        document.removeEventListener('focusout', onFocusOut);
    };
}

function isNavHidingInputFocused() {
    return document.activeElement?.hasAttribute(HIDE_BOTTOM_NAV_ATTRIBUTE) ?? false;
}

export function useIsBottomNavVisible() {
    const pathname = usePathname();
    const { workspacePreferences } = useAppStore();
    const isNavHidingInputActive = useSyncExternalStore(
        subscribeToFocus,
        isNavHidingInputFocused,
        () => false,
    );

    return !isNavHidingInputActive && !(
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
    );
}

export default function BottomNav() {
    const pathname = usePathname();
    const { setSelectedBrandId } = useAppStore();
    const isVisible = useIsBottomNavVisible();

    if (!isVisible) {
        return null;
    }

    const tabs = [
        { name: '추천', href: '/', icon: Home, onClick: () => setSelectedBrandId('') },
        { name: '히스토리', href: '/history', icon: History },
        { name: '설정', href: '/settings', icon: Settings },
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white safe-area-bottom">
            <div className="mx-auto flex h-14 max-w-md items-center justify-around">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href;

                    return (
                        <Link
                            key={tab.name}
                            href={tab.href}
                            onClick={tab.onClick}
                            className={clsx(
                                'flex h-full w-full flex-col items-center justify-center gap-0.5',
                                isActive ? "text-blue-600" : "text-gray-400 hover:text-gray-600"
                            )}
                        >
                            <Icon className={clsx('h-5 w-5', isActive && 'fill-current opacity-20')} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[9px] font-bold">{tab.name}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
