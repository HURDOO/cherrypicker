import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientLayout from '@/components/layout/ClientLayout';
import BottomNav from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/Toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Cherry Picker',
    description: 'Card Benefit Optimization',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body className={inter.className}>
                <ClientLayout>
                    <div className="max-w-md mx-auto min-h-screen bg-white shadow-xl relative">
                        {children}
                        <BottomNav />
                        <ToastContainer />
                    </div>
                </ClientLayout>
            </body>
        </html>
    );
}
