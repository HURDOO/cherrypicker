'use client';

import { useAppData } from '@/hooks/useAppData';
import { usePathname } from 'next/navigation';
import React from 'react';
import BottomNav from './BottomNav';
import { ToastContainer } from '@/components/ui/Toast';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    useAppData();
    const pathname = usePathname();
    const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');

    return (
        <div className={`min-h-screen bg-gray-50 font-sans text-gray-900 ${
            isAdminRoute ? '' : 'pb-20'
        }`}>
            <div className={isAdminRoute
                ? 'min-h-screen bg-gray-50'
                : 'relative mx-auto min-h-screen max-w-md bg-white shadow-xl'
            }>
                {children}
                <BottomNav />
                <ToastContainer />
            </div>
        </div>
    );
}
