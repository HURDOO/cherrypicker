import { describe, expect, it } from 'vitest';
import type { BenefitCatalogSnapshot } from '@/types';
import {
    assessBenefitCatalogHealth,
    BENEFIT_CATALOG_STALE_AFTER_MS,
} from './benefit-catalog-freshness';

const snapshot = (overrides: Partial<BenefitCatalogSnapshot> = {}): BenefitCatalogSnapshot => ({
    schemaVersion: 1,
    catalogVersion: 'a'.repeat(64),
    generatedAt: '2026-08-18T09:00:00.000Z',
    freshness: {
        collectionStatus: 'SUCCEEDED',
        sourceCount: 4,
        failedSourceCount: 0,
        lastAttemptAt: '2026-08-18T09:00:00.000Z',
        lastSuccessfulAt: '2026-08-18T09:00:00.000Z',
    },
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    providers: [],
    subscriptionProducts: [],
    promotions: [],
    routeVerifications: [],
    ...overrides,
});

describe('benefit catalog freshness', () => {
    it('marks a recent fully successful collection as fresh', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot(),
            isOnline: true,
            isRefreshing: false,
            now: '2026-08-18T10:00:00.000Z',
        });

        expect(health).toMatchObject({
            status: 'fresh',
            isStale: false,
            collectionStatus: 'SUCCEEDED',
            sourceCount: 4,
            failedSourceCount: 0,
        });
    });

    it('marks a successful catalog older than the policy as stale', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot(),
            isOnline: true,
            isRefreshing: false,
            now: new Date(
                new Date('2026-08-18T09:00:00.000Z').getTime() +
                BENEFIT_CATALOG_STALE_AFTER_MS + 1
            ),
        });

        expect(health.status).toBe('stale');
        expect(health.isStale).toBe(true);
    });

    it.each(['PARTIAL', 'FAILED'] as const)(
        'surfaces a %s collection as degraded',
        collectionStatus => {
            const health = assessBenefitCatalogHealth({
                snapshot: snapshot({
                    freshness: {
                        collectionStatus,
                        sourceCount: 4,
                        failedSourceCount: collectionStatus === 'FAILED' ? 4 : 1,
                        lastAttemptAt: '2026-08-18T10:00:00.000Z',
                        lastSuccessfulAt: '2026-08-18T09:00:00.000Z',
                    },
                }),
                isOnline: true,
                isRefreshing: false,
                now: '2026-08-18T10:30:00.000Z',
            });

            expect(health.status).toBe('degraded');
            expect(health.failedSourceCount).toBe(collectionStatus === 'FAILED' ? 4 : 1);
        }
    );

    it('distinguishes an offline browser while retaining stale information', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot(),
            isOnline: false,
            isRefreshing: false,
            now: '2026-08-20T10:00:00.000Z',
        });

        expect(health.status).toBe('offline');
        expect(health.isStale).toBe(true);
    });

    it('reports unknown when no collection run has been recorded yet', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot({
                freshness: {
                    collectionStatus: 'UNKNOWN',
                    sourceCount: 0,
                    failedSourceCount: 0,
                },
            }),
            isOnline: true,
            isRefreshing: false,
            now: '2026-08-18T10:00:00.000Z',
        });

        expect(health.status).toBe('unknown');
        expect(health.isStale).toBe(true);
    });

    it('reports a usable baseline when seeded data exists without a collection run', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot({
                freshness: {
                    collectionStatus: 'UNKNOWN',
                    sourceCount: 0,
                    failedSourceCount: 0,
                },
                categories: [{ id: 'etc', name: '기타' }],
            }),
            isOnline: true,
            isRefreshing: false,
            now: '2026-08-18T10:00:00.000Z',
        });

        expect(health.status).toBe('baseline');
        expect(health.isStale).toBe(true);
    });

    it('uses generatedAt for legacy cached snapshots without freshness metadata', () => {
        const health = assessBenefitCatalogHealth({
            snapshot: snapshot({ freshness: undefined }),
            isOnline: true,
            isRefreshing: false,
            now: '2026-08-18T10:00:00.000Z',
        });

        expect(health.status).toBe('unknown');
        expect(health.isStale).toBe(false);
    });

    it('reports unavailable after loading ends without any snapshot', () => {
        expect(assessBenefitCatalogHealth({
            snapshot: null,
            isOnline: true,
            isRefreshing: false,
        }).status).toBe('unavailable');
    });
});
