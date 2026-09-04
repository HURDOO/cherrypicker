import { describe, expect, it } from 'vitest';
import type { WorkspacePreferences } from '@/types';
import { FIRST_SETUP_ROUTES, getFirstSetupRoute } from '@/utils/firstSetupRoutes';

const preferences = (
    status: WorkspacePreferences['firstSetup']['status'],
    step: WorkspacePreferences['firstSetup']['step'],
): WorkspacePreferences => ({
    selectedSystemCardIds: [],
    firstSetup: { status, step },
});

describe('first setup routes', () => {
    it('maps every setup step to a stable address', () => {
        expect(FIRST_SETUP_ROUTES).toEqual({
            WELCOME: '/setup',
            CARDS: '/setup/cards',
            BENEFITS: '/setup/benefits',
            PERFORMANCE: '/setup/performance',
            FAVORITES: '/setup/favorites',
            RECOMMENDATION: '/setup/recommendation',
        });
    });

    it('always starts a not-started workspace at the landing page', () => {
        expect(getFirstSetupRoute(preferences('NOT_STARTED', 'WELCOME'))).toBe('/setup');
        expect(getFirstSetupRoute(preferences('NOT_STARTED', 'CARDS'))).toBe('/setup');
    });

    it('resumes an in-progress or awaiting workspace at its saved route', () => {
        expect(getFirstSetupRoute(preferences('IN_PROGRESS', 'PERFORMANCE')))
            .toBe('/setup/performance');
        expect(getFirstSetupRoute(preferences('AWAITING_RECOMMENDATION', 'RECOMMENDATION')))
            .toBe('/setup/recommendation');
    });
});
