'use client';

import React from 'react';
import { useToastStore } from '@/store/useToastStore';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import clsx from 'clsx';

export function ToastContainer() {
    const { toasts, removeToast } = useToastStore();

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className={clsx(
                        "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg border backdrop-blur-md animate-in slide-in-from-bottom-5 fade-in duration-300",
                        toast.type === 'success' && "bg-gray-900/90 text-white border-gray-800",
                        toast.type === 'error' && "bg-red-500/90 text-white border-red-500",
                        toast.type === 'info' && "bg-white/90 text-gray-900 border-gray-200"
                    )}
                >
                    <div className="shrink-0">
                        {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400" />}
                        {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-white" />}
                        {toast.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                    </div>
                    <p className="text-sm font-medium flex-1">{toast.message}</p>
                    <button
                        onClick={() => removeToast(toast.id)}
                        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity p-1"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}
