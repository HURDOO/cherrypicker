import type { Metadata, Viewport } from 'next';
import './globals.css';
import ClientLayout from '@/components/layout/ClientLayout';
import { APP_INSTALL_NAME } from '@/utils/appInstall';

export const metadata: Metadata = {
    title: 'Cherry Picker',
    description: 'Card Benefit Optimization',
    applicationName: APP_INSTALL_NAME,
    appleWebApp: {
        capable: true,
        title: APP_INSTALL_NAME,
        statusBarStyle: 'default',
    },
    icons: {
        icon: [
            { url: '/app-icon/icon.svg', type: 'image/svg+xml' },
            { url: '/app-icon/icon-192.png', type: 'image/png', sizes: '192x192' },
        ],
        apple: { url: '/app-icon/apple-touch-icon.png', sizes: '180x180' },
    },
};

export const viewport: Viewport = {
    themeColor: '#ffffff',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko" suppressHydrationWarning>
            <body>
                <ClientLayout>
                    {children}
                </ClientLayout>
            </body>
        </html>
    );
}
