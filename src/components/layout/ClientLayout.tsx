'use client';

import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import React from 'react';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
    useSupabaseSync(); // Initialize data sync

    return (
        <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-900">
            {children}
        </div>
    );
}
