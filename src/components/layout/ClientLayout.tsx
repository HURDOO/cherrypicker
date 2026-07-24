'use client';

import { useAppData } from '@/hooks/useAppData';
import React from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    useAppData();

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-900">
            {children}
        </div>
    );
}
