import type { FirstSetupStep, WorkspacePreferences } from '@/types';

export const FIRST_SETUP_ROUTES: Record<FirstSetupStep, string> = {
    WELCOME: '/setup',
    CARDS: '/setup/cards',
    BENEFITS: '/setup/benefits',
    PERFORMANCE: '/setup/performance',
    FAVORITES: '/setup/favorites',
    RECOMMENDATION: '/setup/recommendation',
};

export function getFirstSetupRoute(preferences: WorkspacePreferences): string {
    if (preferences.firstSetup.status === 'NOT_STARTED') {
        return FIRST_SETUP_ROUTES.WELCOME;
    }
    return FIRST_SETUP_ROUTES[preferences.firstSetup.step];
}
