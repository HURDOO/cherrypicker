'use client';

import { AlertCircle, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FirstSetupFlow } from '@/components/onboarding/FirstSetupFlow';
import { useBenefitCatalog } from '@/hooks/useBenefitCatalog';
import { useBrandDiscoveryPreferences } from '@/hooks/useBrandDiscoveryPreferences';
import { getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { useAppStore } from '@/store/useAppStore';
import type { FirstSetupStep, WorkspacePreferences } from '@/types';
import { FIRST_SETUP_ROUTES } from '@/utils/firstSetupRoutes';

type SetupFormStep = Exclude<FirstSetupStep, 'RECOMMENDATION'>;

const nextStep: Record<SetupFormStep, FirstSetupStep> = {
    WELCOME: 'CARDS',
    CARDS: 'BENEFITS',
    BENEFITS: 'PERFORMANCE',
    PERFORMANCE: 'FAVORITES',
    FAVORITES: 'RECOMMENDATION',
};

const desiredProgressForStep = (
    preferences: WorkspacePreferences,
    step: SetupFormStep,
): WorkspacePreferences => ({
    ...preferences,
    firstSetup: {
        status: step === 'WELCOME' ? 'NOT_STARTED' : 'IN_PROGRESS',
        step,
    },
});

function RouteLoading() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" aria-label="첫 설정 불러오는 중" />
        </div>
    );
}

export function FirstSetupRoutePage({ step }: { step: SetupFormStep }) {
    const router = useRouter();
    const {
        userId,
        cards,
        brands,
        workspacePreferences,
        isLoading,
        appDataError,
        setWorkspacePreferences,
    } = useAppStore();
    const { snapshot: catalog } = useBenefitCatalog();
    const {
        favoriteBrandIds,
        preferencesError,
        toggleFavorite,
    } = useBrandDiscoveryPreferences(userId);
    const [routeStorageError, setRouteStorageError] = useState<string>();
    const [navigationTarget, setNavigationTarget] = useState<FirstSetupStep>();
    const selectedCardIds = workspacePreferences.selectedSystemCardIds ?? [];
    const requiresSelectedCard = step !== 'WELCOME' && step !== 'CARDS';
    const desiredPreferences = useMemo(
        () => desiredProgressForStep(workspacePreferences, step),
        [step, workspacePreferences]
    );
    const routeMatchesStoredProgress =
        workspacePreferences.firstSetup.status === desiredPreferences.firstSetup.status &&
        workspacePreferences.firstSetup.step === desiredPreferences.firstSetup.step;

    useEffect(() => {
        router.prefetch(FIRST_SETUP_ROUTES[nextStep[step]]);
    }, [router, step]);

    useEffect(() => {
        if (isLoading || appDataError) return;
        if (workspacePreferences.firstSetup.status === 'COMPLETED') {
            router.replace('/');
            return;
        }
        if (requiresSelectedCard && selectedCardIds.length === 0) {
            router.replace(FIRST_SETUP_ROUTES.CARDS);
            return;
        }
        if (routeMatchesStoredProgress) {
            if (navigationTarget === step) {
                const timer = window.setTimeout(() => setNavigationTarget(undefined), 0);
                return () => window.clearTimeout(timer);
            }
            return;
        }
        if (navigationTarget) return;

        let active = true;
        void localWorkspaceClient.updateWorkspacePreferences(desiredPreferences)
            .then(saved => {
                if (!active) return;
                setWorkspacePreferences(saved);
            })
            .catch(error => {
                if (!active) return;
                setRouteStorageError(getErrorMessage(
                    error,
                    '현재 첫 설정 단계를 이 브라우저에 저장하지 못했습니다.'
                ));
            });

        return () => {
            active = false;
        };
    }, [
        appDataError,
        desiredPreferences,
        isLoading,
        navigationTarget,
        requiresSelectedCard,
        routeMatchesStoredProgress,
        router,
        selectedCardIds.length,
        setWorkspacePreferences,
        step,
        workspacePreferences.firstSetup.status,
    ]);

    const isNavigatingAway = navigationTarget !== undefined && navigationTarget !== step;

    if (isLoading) return <RouteLoading />;

    if (appDataError) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8 text-center">
                <AlertCircle className="mb-4 h-10 w-10 text-rose-400" aria-hidden="true" />
                <h1 className="text-xl font-black text-gray-900">첫 설정을 열지 못했어요</h1>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                    {appDataError.message} 브라우저 저장 공간과 권한을 확인한 뒤 다시 시도해주세요.
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-6 min-h-12 rounded-2xl bg-gray-900 px-6 text-sm font-black text-white"
                >
                    다시 시도
                </button>
            </div>
        );
    }

    if (
        workspacePreferences.firstSetup.status === 'COMPLETED' ||
        (requiresSelectedCard && selectedCardIds.length === 0) ||
        (!routeMatchesStoredProgress && !routeStorageError && !isNavigatingAway)
    ) {
        return <RouteLoading />;
    }

    return (
        <FirstSetupFlow
            key={step}
            step={step}
            systemCards={cards.filter(card => !card.userId)}
            brands={brands}
            catalog={catalog}
            favoriteBrandIds={favoriteBrandIds}
            preferenceStorageError={routeStorageError ?? preferencesError}
            onToggleFavorite={toggleFavorite}
            onNavigate={nextStep => {
                setNavigationTarget(nextStep);
                router.push(FIRST_SETUP_ROUTES[nextStep]);
            }}
        />
    );
}
