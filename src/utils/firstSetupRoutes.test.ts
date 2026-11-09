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
    it('maps every setup step to an address', () => {
        expect(FIRST_SETUP_ROUTES).toEqual({
            WELCOME: '/setup',
            CARDS: '/setup/cards',
            BENEFITS: '/setup/benefits',
            PERFORMANCE: '/setup/benefits',
            FAVORITES: '/setup/benefits',
            RECOMMENDATION: '/setup/recommendation',
        });
    });

    it('always starts a not-started workspace at the landing page', () => {
        expect(getFirstSetupRoute(preferences('NOT_STARTED', 'WELCOME'))).toBe('/setup');
        expect(getFirstSetupRoute(preferences('NOT_STARTED', 'CARDS'))).toBe('/setup');
    });

    it('resumes an in-progress or awaiting workspace at its saved route', () => {
        expect(getFirstSetupRoute(preferences('IN_PROGRESS', 'CARDS')))
            .toBe('/setup/cards');
        expect(getFirstSetupRoute(preferences('AWAITING_RECOMMENDATION', 'RECOMMENDATION')))
            .toBe('/setup/recommendation');
    });

    it('resumes the removed performance and favorites steps at benefits', () => {
        expect(getFirstSetupRoute(preferences('IN_PROGRESS', 'PERFORMANCE'))).toBe('/setup/benefits');
        expect(getFirstSetupRoute(preferences('IN_PROGRESS', 'FAVORITES'))).toBe('/setup/benefits');
    });
});
