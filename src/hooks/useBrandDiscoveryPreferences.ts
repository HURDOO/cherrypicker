'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    EMPTY_BRAND_DISCOVERY_PREFERENCES,
    getNearbyBrandIds,
    parseBrandDiscoveryPreferences,
    toCoarseLocation,
    type BrandDiscoveryPreferences,
    type BrandDiscoveryViewMode,
    type CoarseLocation,
} from '@/utils/brandDiscovery';

const STORAGE_PREFIX = 'cherrypicker:brand-discovery';
const MAX_LOCATION_VISITS = 200;

export type LocationRequestResult =
    | { ok: true }
    | { ok: false; message: string };

export function useBrandDiscoveryPreferences(userId: string) {
    const [preferences, setPreferences] = useState<BrandDiscoveryPreferences>(
        EMPTY_BRAND_DISCOVERY_PREFERENCES
    );
    const [loadedUserId, setLoadedUserId] = useState('');
    const [currentLocation, setCurrentLocation] = useState<CoarseLocation>();
    const [isLocating, setIsLocating] = useState(false);

    useEffect(() => {
        if (!userId) {
            setPreferences(EMPTY_BRAND_DISCOVERY_PREFERENCES);
            setLoadedUserId('');
            setCurrentLocation(undefined);
            return;
        }

        const stored = window.localStorage.getItem(`${STORAGE_PREFIX}:${userId}`);
        setPreferences(parseBrandDiscoveryPreferences(stored));
        setLoadedUserId(userId);
        setCurrentLocation(undefined);
    }, [userId]);

    useEffect(() => {
        if (!userId || loadedUserId !== userId) return;
        window.localStorage.setItem(
            `${STORAGE_PREFIX}:${userId}`,
            JSON.stringify(preferences)
        );
    }, [loadedUserId, preferences, userId]);

    const toggleFavorite = useCallback((brandId: string) => {
        setPreferences(current => ({
            ...current,
            favoriteBrandIds: current.favoriteBrandIds.includes(brandId)
                ? current.favoriteBrandIds.filter(id => id !== brandId)
                : [brandId, ...current.favoriteBrandIds],
        }));
    }, []);

    const setDefaultViewMode = useCallback((defaultViewMode: BrandDiscoveryViewMode) => {
        setPreferences(current => ({
            ...current,
            defaultViewMode,
        }));
    }, []);

    const requestCurrentLocation = useCallback(async (): Promise<LocationRequestResult> => {
        if (!('geolocation' in navigator)) {
            return { ok: false, message: '이 기기에서는 위치 기능을 사용할 수 없습니다.' };
        }

        setIsLocating(true);
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 8_000,
                    maximumAge: 300_000,
                });
            });
            setCurrentLocation(toCoarseLocation(
                position.coords.latitude,
                position.coords.longitude
            ));
            return { ok: true };
        } catch (error) {
            const denied = typeof error === 'object' && error !== null &&
                'code' in error && error.code === 1;
            return {
                ok: false,
                message: denied
                    ? '주변 기록을 보려면 브라우저에서 위치 권한을 허용해 주세요.'
                    : '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            };
        } finally {
            setIsLocating(false);
        }
    }, []);

    const recordBrandVisit = useCallback((brandId: string) => {
        if (!currentLocation) return;
        const visit = {
            brandId,
            ...currentLocation,
            usedAt: new Date().toISOString(),
        };
        setPreferences(current => ({
            ...current,
            locationVisits: [
                visit,
                ...current.locationVisits.filter(item => !(
                    item.brandId === brandId &&
                    item.latitude === currentLocation.latitude &&
                    item.longitude === currentLocation.longitude
                )),
            ].slice(0, MAX_LOCATION_VISITS),
        }));
    }, [currentLocation]);

    const nearbyBrandIds = useMemo(
        () => getNearbyBrandIds(preferences.locationVisits, currentLocation),
        [currentLocation, preferences.locationVisits]
    );

    return {
        favoriteBrandIds: preferences.favoriteBrandIds,
        defaultViewMode: preferences.defaultViewMode,
        nearbyBrandIds,
        hasCurrentLocation: Boolean(currentLocation),
        isLocating,
        isPreferencesLoaded: Boolean(userId && loadedUserId === userId),
        toggleFavorite,
        setDefaultViewMode,
        requestCurrentLocation,
        recordBrandVisit,
    };
}
