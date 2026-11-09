import type { MetadataRoute } from 'next';
import { APP_INSTALL_NAME } from '@/utils/appInstall';

// Installable app without a caching service worker, so the demo never shows a stale screen.
export default function manifest(): MetadataRoute.Manifest {
    return {
        id: '/',
        name: APP_INSTALL_NAME,
        short_name: APP_INSTALL_NAME,
        description: '결제 전에 내 카드·통신사·페이 혜택 조합을 추천합니다.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        lang: 'ko',
        icons: [
            { src: '/app-icon/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/app-icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
                src: '/app-icon/icon-maskable-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
            },
        ],
    };
}
