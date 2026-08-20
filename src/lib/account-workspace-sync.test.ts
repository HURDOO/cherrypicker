import { describe, expect, it } from 'vitest';
import { createAccountWorkspaceExport } from '@/lib/account-workspace-export';
import { mergeAccountWorkspaceSyncOperation } from '@/lib/account-workspace-sync';

const emptyProfile = () => ({
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: 100,
});

const category = (name: string) => ({
    id: 'shared-category',
    name,
    userId: 'transport-owner',
});

describe('incremental account workspace merge', () => {
    it('keeps a newer account edit while accepting a new record from a stale device', () => {
        const current = createAccountWorkspaceExport({
            sourceWorkspaceId: 'canonical-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [category('계정의 최신 이름')],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: emptyProfile(),
        });
        const incoming = createAccountWorkspaceExport({
            sourceWorkspaceId: 'second-device',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [category('기기의 오래된 이름')],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [{
                id: 'new-history',
                date: '2026-08-20T11:00:00.000Z',
                brandId: 'system-brand',
                amount: 10_000,
                discountAmount: 1_000,
            }],
            benefitProfile: emptyProfile(),
        });
        incoming.recordMetadata['categories:shared-category'].id =
            current.recordMetadata['categories:shared-category'].id;
        incoming.recordMetadata.profile = structuredClone(current.recordMetadata.profile);

        const merged = mergeAccountWorkspaceSyncOperation(incoming, current);

        expect(merged.plan.conflicts).toMatchObject([{
            key: 'categories:shared-category',
            defaultChoice: 'account',
        }]);
        expect(merged.resolution.workspace.categories[0].name).toBe('계정의 최신 이름');
        expect(merged.resolution.workspace.history).toHaveLength(1);
        expect(merged.resolution.workspace.sourceWorkspaceId).toBe('canonical-workspace');
    });

    it('round-trips a newer tombstone from another device', () => {
        const current = createAccountWorkspaceExport({
            sourceWorkspaceId: 'canonical-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [category('삭제 전 카테고리')],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: emptyProfile(),
        });
        const incoming = createAccountWorkspaceExport({
            sourceWorkspaceId: 'second-device',
            exportedAt: '2026-08-20T12:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: emptyProfile(),
        });
        incoming.recordMetadata.profile = structuredClone(current.recordMetadata.profile);
        incoming.recordMetadata['categories:shared-category'] = {
            ...current.recordMetadata['categories:shared-category'],
            updatedAt: '2026-08-20T12:00:00.000Z',
            deletedAt: '2026-08-20T12:00:00.000Z',
        };

        const result = mergeAccountWorkspaceSyncOperation(incoming, current).resolution.workspace;

        expect(result.categories).toEqual([]);
        expect(result.recordMetadata['categories:shared-category']).toMatchObject({
            deletedAt: '2026-08-20T12:00:00.000Z',
        });
    });
});
