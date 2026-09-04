import { describe, expect, it } from 'vitest';
import { createAccountWorkspaceExport } from './account-workspace-export';
import {
    createAccountWorkspaceMergePlan,
    createDefaultAccountWorkspaceMergeChoices,
    resolveAccountWorkspaceMerge,
} from './account-workspace-merge';

const emptyProfile = () => ({
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: 100,
});

const createExport = ({
    sourceWorkspaceId,
    exportedAt,
    categories = [],
    brands = [],
    cards = [],
    rules = [],
    performances = [],
    history = [],
}: {
    sourceWorkspaceId: string;
    exportedAt: string;
    categories?: Parameters<typeof createAccountWorkspaceExport>[0]['categories'];
    brands?: Parameters<typeof createAccountWorkspaceExport>[0]['brands'];
    cards?: Parameters<typeof createAccountWorkspaceExport>[0]['cards'];
    rules?: Parameters<typeof createAccountWorkspaceExport>[0]['rules'];
    performances?: Parameters<typeof createAccountWorkspaceExport>[0]['performances'];
    history?: Parameters<typeof createAccountWorkspaceExport>[0]['history'];
}) => createAccountWorkspaceExport({
    sourceWorkspaceId,
    exportedAt,
    categories,
    brands,
    cards,
    rules,
    performances,
    history,
    benefitProfile: emptyProfile(),
});

describe('account workspace merge', () => {
    it('preserves records that exist on only one side', () => {
        const local = createExport({
            sourceWorkspaceId: 'local-workspace',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [{ id: 'local-category', name: '로컬 카테고리', userId: 'local' }],
        });
        const account = createExport({
            sourceWorkspaceId: 'account-workspace',
            exportedAt: '2026-08-20T08:00:00.000Z',
            cards: [{
                id: 'account-card',
                userId: 'account',
                name: '계정 카드',
                company: '테스트 카드사',
                color: 'bg-blue-500',
                limitTable: [],
            }],
        });

        const plan = createAccountWorkspaceMergePlan(local, account);
        const resolved = resolveAccountWorkspaceMerge(
            local,
            account,
            createDefaultAccountWorkspaceMergeChoices(plan),
            { exportedAt: '2026-08-20T10:00:00.000Z' },
        );

        expect(plan).toMatchObject({
            localOnlyCount: 1,
            accountOnlyCount: 1,
            conflicts: [],
        });
        expect(resolved.workspace.categories.map(row => row.id)).toEqual(['local-category']);
        expect(resolved.workspace.cards.map(row => row.id)).toEqual(['account-card']);
        expect(resolved.workspace.sourceWorkspaceId).toBe('local-workspace');
    });

    it('shows overlapping edits and defaults to the latest updated record', () => {
        const local = createExport({
            sourceWorkspaceId: 'local-workspace',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [{ id: 'shared', name: '로컬 이름', userId: 'local' }],
        });
        const account = createExport({
            sourceWorkspaceId: 'account-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [{ id: 'shared', name: '계정 이름', userId: 'account' }],
        });

        const plan = createAccountWorkspaceMergePlan(local, account);
        expect(plan.conflicts).toHaveLength(1);
        expect(plan.conflicts[0]).toMatchObject({
            key: 'categories:shared',
            label: '로컬 이름',
            defaultChoice: 'account',
        });

        const defaultResult = resolveAccountWorkspaceMerge(
            local,
            account,
            createDefaultAccountWorkspaceMergeChoices(plan),
        );
        const localResult = resolveAccountWorkspaceMerge(local, account, {
            'categories:shared': 'local',
        });

        expect(defaultResult.workspace.categories[0].name).toBe('계정 이름');
        expect(localResult.workspace.categories[0].name).toBe('로컬 이름');
    });

    it('requires an explicit choice for every differing shared record', () => {
        const local = createExport({
            sourceWorkspaceId: 'local-workspace',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [{ id: 'shared', name: '로컬 이름', userId: 'local' }],
        });
        const account = createExport({
            sourceWorkspaceId: 'account-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [{ id: 'shared', name: '계정 이름', userId: 'account' }],
        });

        expect(() => resolveAccountWorkspaceMerge(local, account, {}))
            .toThrow('이 기기 또는 계정 데이터를 선택');
    });

    it('treats a newer tombstone as a selectable conflict', () => {
        const local = createExport({
            sourceWorkspaceId: 'local-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
        });
        local.recordMetadata['categories:shared'] = {
            id: 'shared-record',
            createdAt: '2026-08-20T08:00:00.000Z',
            updatedAt: '2026-08-20T10:00:00.000Z',
            deletedAt: '2026-08-20T10:00:00.000Z',
        };
        const account = createExport({
            sourceWorkspaceId: 'account-workspace',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [{ id: 'shared', name: '계정 카테고리', userId: 'account' }],
        });
        account.recordMetadata['categories:shared'].id = 'shared-record';

        const plan = createAccountWorkspaceMergePlan(local, account);
        expect(plan.conflicts[0]).toMatchObject({
            defaultChoice: 'local',
            local: { deleted: true },
            account: { deleted: false },
        });
        expect(resolveAccountWorkspaceMerge(
            local,
            account,
            createDefaultAccountWorkspaceMergeChoices(plan),
        ).workspace.categories).toEqual([]);
        expect(resolveAccountWorkspaceMerge(local, account, {
            ...createDefaultAccountWorkspaceMergeChoices(plan),
            'categories:shared': 'account',
        }).workspace.categories).toHaveLength(1);
    });

    it('cascades selected parent deletions and preserves referential integrity', () => {
        const local = createExport({
            sourceWorkspaceId: 'local-workspace',
            exportedAt: '2026-08-20T10:00:00.000Z',
        });
        local.recordMetadata['categories:personal-category'] = {
            id: 'category-record',
            createdAt: '2026-08-20T08:00:00.000Z',
            updatedAt: '2026-08-20T10:00:00.000Z',
            deletedAt: '2026-08-20T10:00:00.000Z',
        };
        local.recordMetadata['cards:personal-card'] = {
            id: 'card-record',
            createdAt: '2026-08-20T08:00:00.000Z',
            updatedAt: '2026-08-20T10:00:00.000Z',
            deletedAt: '2026-08-20T10:00:00.000Z',
        };
        const account = createExport({
            sourceWorkspaceId: 'account-workspace',
            exportedAt: '2026-08-20T09:00:00.000Z',
            categories: [{
                id: 'personal-category',
                name: '개인 카테고리',
                userId: 'account',
            }],
            brands: [{
                id: 'personal-brand',
                name: '개인 브랜드',
                categoryId: 'personal-category',
                userId: 'account',
            }],
            cards: [{
                id: 'personal-card',
                name: '개인 카드',
                company: '테스트 카드사',
                color: 'bg-blue-500',
                limitTable: [],
                userId: 'account',
            }],
            rules: [{
                id: 'personal-rule',
                cardId: 'personal-card',
                category: 'personal-category',
                includedBrands: ['personal-brand'],
                excludedBrands: [],
                platformType: 'ALL',
                description: '테스트 할인',
                detail: '',
                condition: {},
                action: { type: 'FLAT', value: 1000 },
                limitConfig: {},
                userId: 'account',
            }],
            performances: [{
                cardId: 'personal-card',
                performanceMonth: '2026-07',
                amount: 300000,
            }],
        });
        account.recordMetadata['categories:personal-category'].id = 'category-record';
        account.recordMetadata['cards:personal-card'].id = 'card-record';

        const plan = createAccountWorkspaceMergePlan(local, account);
        const resolved = resolveAccountWorkspaceMerge(
            local,
            account,
            createDefaultAccountWorkspaceMergeChoices(plan),
            { exportedAt: '2026-08-20T11:00:00.000Z' },
        );

        expect(resolved.workspace).toMatchObject({
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
        });
        expect(resolved.cascadedDeletionCount).toBe(3);
        expect(resolved.workspace.recordMetadata['brands:personal-brand'].deletedAt).toBeTruthy();
        expect(resolved.workspace.recordMetadata['rules:personal-rule'].deletedAt).toBeTruthy();
        expect(resolved.workspace.recordMetadata[
            'performances:personal-card:2026-07'
        ].deletedAt).toBeTruthy();
    });
});
