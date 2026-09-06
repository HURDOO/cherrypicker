import { describe, expect, it, vi } from 'vitest';
import type { BenefitCombination } from '@/types';
import { createAccountWorkspaceExport } from './account-workspace-export';
import {
    accountWorkspaceMatchesLocal,
    createAccountWorkspaceExportFromLocal,
    createEmptyLocalWorkspace,
    createLocalWorkspaceFromMergedAccountExport,
    createLocalWorkspaceClient,
    getAccountWorkspaceSyncMode,
    parseLocalWorkspaceSnapshot,
    readOrCreateLocalWorkspace,
    type LocalWorkspaceSnapshot,
    type LocalWorkspaceStorage,
} from './local-workspace';
import { buildPromotionUsage } from '@/utils/promotionUsage';

const createMemoryStorage = (initial: LocalWorkspaceSnapshot | null = null) => {
    let current = initial ? structuredClone(initial) : null;
    const storage: LocalWorkspaceStorage = {
        read: vi.fn(async () => current ? structuredClone(current) : null),
        write: vi.fn(async snapshot => {
            current = structuredClone(snapshot);
        }),
    };

    return {
        storage,
        getCurrent: () => current ? structuredClone(current) : null,
    };
};

const combination: BenefitCombination = {
    id: 'combination-1',
    fundingType: 'CARD',
    cardId: 'card-placeholder',
    cardName: '테스트 카드',
    steps: [{
        id: 'step-1',
        layer: 'PAYMENT_METHOD',
        providerName: '테스트 카드사',
        title: '10% 할인',
        certainty: 'CONFIRMED',
        amountBefore: 10000,
        benefitAmount: 1000,
        amountAfter: 9000,
        isImmediate: true,
        cardId: 'card-placeholder',
        ruleId: 'rule-placeholder',
    }],
    confirmedValue: 1000,
    conditionalValue: 0,
    estimatedValue: 0,
    immediateDiscount: 1000,
    laterReward: 0,
    payableAmount: 9000,
    warnings: [],
    requiredChecks: [],
};

describe('local workspace', () => {
    it('creates UUIDs with getRandomValues on an HTTP LAN origin', () => {
        let call = 0;
        vi.stubGlobal('crypto', {
            getRandomValues: (values: Uint8Array) => {
                const offset = call++ * values.length;
                values.forEach((_, index) => {
                    values[index] = offset + index;
                });
                return values;
            },
        });

        try {
            const workspace = createEmptyLocalWorkspace();
            const ids = [
                workspace.workspaceId,
                workspace.recordMetadata.profile.id,
                workspace.deviceId,
            ];

            expect(ids).toHaveLength(new Set(ids).size);
            ids.forEach(id => expect(id).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
            ));
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('creates a stable, versioned empty workspace once', async () => {
        const memory = createMemoryStorage();
        const ids = ['workspace-id', 'profile-id', 'device-id'];

        const first = await readOrCreateLocalWorkspace(memory.storage, {
            now: '2026-08-18T09:00:00.000Z',
            idFactory: () => ids.shift() ?? 'unexpected-id',
        });
        const second = await readOrCreateLocalWorkspace(memory.storage);

        expect(first).toEqual(second);
        expect(first).toMatchObject({
            schemaVersion: 1,
            workspaceId: 'workspace-id',
            deviceId: 'device-id',
            createdAt: '2026-08-18T09:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            workspacePreferences: {
                selectedSystemCardIds: [],
                firstSetup: {
                    status: 'NOT_STARTED',
                    step: 'WELCOME',
                },
            },
        });
        expect(first.recordMetadata.profile.id).toBe('profile-id');
        expect(memory.storage.write).toHaveBeenCalledOnce();
    });

    it('normalizes a legacy empty workspace into a resumable first setup', () => {
        const workspace = createEmptyLocalWorkspace();
        const legacy = structuredClone(workspace) as unknown as Record<string, unknown>;
        delete legacy.workspacePreferences;
        delete (legacy.recordMetadata as Record<string, unknown>).workspacePreferences;

        expect(parseLocalWorkspaceSnapshot(legacy).workspacePreferences).toEqual({
            selectedSystemCardIds: [],
            firstSetup: {
                status: 'NOT_STARTED',
                step: 'WELCOME',
            },
        });
    });

    it('moves an untouched pre-landing workspace to the welcome step', () => {
        const workspace = createEmptyLocalWorkspace();
        workspace.workspacePreferences.firstSetup.step = 'CARDS';

        expect(parseLocalWorkspaceSnapshot(workspace).workspacePreferences.firstSetup).toEqual({
            status: 'NOT_STARTED',
            step: 'WELCOME',
        });
    });

    it('persists selected system cards and first-setup progress', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);

        await client.updateWorkspacePreferences({
            selectedSystemCardIds: ['system-card'],
            firstSetup: {
                status: 'IN_PROGRESS',
                step: 'PERFORMANCE',
            },
        });

        await expect(client.read()).resolves.toMatchObject({
            workspacePreferences: {
                selectedSystemCardIds: ['system-card'],
                firstSetup: {
                    status: 'IN_PROGRESS',
                    step: 'PERFORMANCE',
                },
            },
        });
        await expect(client.exportAccountWorkspace()).resolves.toMatchObject({
            workspacePreferences: {
                selectedSystemCardIds: ['system-card'],
                firstSetup: {
                    status: 'IN_PROGRESS',
                    step: 'PERFORMANCE',
                },
            },
        });
        expect(memory.getCurrent()?.recordMetadata.workspacePreferences.updatedAt).toBeTruthy();
    });

    it('resumes after skipped optional steps and keeps the completed state', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);

        await client.updateWorkspacePreferences({
            selectedSystemCardIds: ['system-card'],
            firstSetup: {
                status: 'IN_PROGRESS',
                step: 'FAVORITES',
            },
        });
        const resumedClient = createLocalWorkspaceClient(memory.storage);
        await expect(resumedClient.read()).resolves.toMatchObject({
            workspacePreferences: {
                firstSetup: {
                    status: 'IN_PROGRESS',
                    step: 'FAVORITES',
                },
            },
        });

        await resumedClient.updateWorkspacePreferences({
            selectedSystemCardIds: ['system-card'],
            firstSetup: {
                status: 'AWAITING_RECOMMENDATION',
                step: 'RECOMMENDATION',
            },
        });
        await resumedClient.updateWorkspacePreferences({
            selectedSystemCardIds: ['system-card'],
            firstSetup: {
                status: 'COMPLETED',
                step: 'RECOMMENDATION',
                completedAt: '2026-09-04T10:00:00.000Z',
            },
        });

        await expect(createLocalWorkspaceClient(memory.storage).read()).resolves.toMatchObject({
            workspacePreferences: {
                selectedSystemCardIds: ['system-card'],
                firstSetup: {
                    status: 'COMPLETED',
                    completedAt: '2026-09-04T10:00:00.000Z',
                },
            },
        });
    });

    it('defaults legacy workspace small-benefit settings to 100 won', () => {
        const workspace = createEmptyLocalWorkspace();
        const {
            smallBenefitThreshold,
            ...legacyProfile
        } = workspace.benefitProfile;
        const legacy = { ...workspace, benefitProfile: legacyProfile };

        expect(smallBenefitThreshold).toBe(100);
        expect(parseLocalWorkspaceSnapshot(legacy).benefitProfile.smallBenefitThreshold)
            .toBe(100);
    });

    it('previews and imports an account snapshot only into an empty local workspace', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        const accountWorkspace = createAccountWorkspaceExport({
            sourceWorkspaceId: 'account-1',
            exportedAt: '2026-08-18T10:00:00.000Z',
            categories: [{ id: 'category-1', name: '계정 카테고리', userId: 'account-1' }],
            brands: [],
            cards: [{
                id: 'card-1',
                userId: 'account-1',
                name: '계정 카드',
                company: '테스트 카드사',
                color: 'bg-blue-500',
                limitTable: [],
            }],
            rules: [],
            performances: [{
                cardId: 'card-1',
                performanceMonth: '2026-07',
                amount: 300000,
            }],
            history: [{
                id: 42,
                date: '2026-08-17T09:00:00.000Z',
                brandId: 'system-brand',
                cardId: 'card-1',
                amount: 10000,
                discountAmount: 1000,
            }],
            benefitProfile: {
                telecomMemberships: [],
                subscriptions: [],
                enabledPayProviderIds: ['pay-1'],
                moneyEnabled: true,
                pointsEnabled: true,
                pointValue: 1,
                smallBenefitThreshold: 100,
            },
        });

        await expect(client.previewAccountImport(accountWorkspace)).resolves.toMatchObject({
            localHasData: false,
            summary: {
                cards: 1,
                performances: 1,
                history: 1,
                deletedRecords: 0,
                hasProfile: true,
                hasWorkspacePreferences: true,
                totalRecords: 6,
            },
        });

        const imported = await client.importAccountWorkspace(accountWorkspace);
        expect(imported.categories[0].userId).toBe(imported.workspaceId);
        expect(imported.cards[0].userId).toBe(imported.workspaceId);
        expect(imported.history).toHaveLength(1);
        expect(imported.recordMetadata['history:42'].id).toBe('account-1:history:42');

        await expect(client.importAccountWorkspace(accountWorkspace))
            .rejects.toThrow('이미 개인 데이터가 있어');
        expect((await client.read()).history).toHaveLength(1);
    });

    it('exports a local snapshot without its owner and verifies a downloaded copy', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        const category = await client.createCategory({ name: '로컬 카테고리' });
        await client.deleteCategory(category.id);
        await client.updateBenefitProfile({
            telecomMemberships: [],
            subscriptions: [],
            enabledPayProviderIds: ['pay-1'],
            moneyEnabled: true,
            pointsEnabled: true,
            pointValue: 1,
            smallBenefitThreshold: 250,
        });
        const local = await client.read();
        const exported = createAccountWorkspaceExportFromLocal(
            local,
            '2026-08-18T12:00:00.000Z'
        );

        expect(exported.sourceWorkspaceId).toBe(local.workspaceId);
        expect(exported.recordMetadata[`categories:${category.id}`].deletedAt).toBeTruthy();
        expect(exported.categories).toEqual([]);
        expect(exported.benefitProfile.smallBenefitThreshold).toBe(250);
        expect(accountWorkspaceMatchesLocal(local, exported)).toBe(true);
        expect(await client.exportAccountWorkspace('2026-08-18T12:00:00.000Z'))
            .toEqual(exported);

        const changed = structuredClone(exported);
        changed.benefitProfile.enabledPayProviderIds = [];
        expect(accountWorkspaceMatchesLocal(local, changed)).toBe(false);
    });

    it('imports an explicit merge into a non-empty workspace without changing device identity', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        await client.createCategory({ name: '기존 로컬 카테고리' });
        const current = await client.read();
        const merged = createAccountWorkspaceExport({
            sourceWorkspaceId: current.workspaceId,
            exportedAt: '2026-08-20T10:00:00.000Z',
            categories: [{
                id: 'merged-category',
                name: '병합 카테고리',
                userId: 'transport-owner',
            }],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: {
                telecomMemberships: [],
                subscriptions: [],
                enabledPayProviderIds: [],
                moneyEnabled: true,
                pointsEnabled: true,
                pointValue: 1,
                smallBenefitThreshold: 100,
            },
        });

        const preview = createLocalWorkspaceFromMergedAccountExport(current, merged);
        const imported = await client.importMergedAccountWorkspace(merged);

        expect(preview).toEqual(imported);
        expect(imported.workspaceId).toBe(current.workspaceId);
        expect(imported.deviceId).toBe(current.deviceId);
        expect(imported.categories).toEqual([{
            id: 'merged-category',
            name: '병합 카테고리',
            userId: current.workspaceId,
        }]);

        expect(() => createLocalWorkspaceFromMergedAccountExport(current, {
            ...merged,
            sourceWorkspaceId: 'another-workspace',
        })).toThrow('현재 기기와 일치하지 않습니다');
    });

    it('chooses only safe initial backup, restore, update, and conflict paths', async () => {
        const empty = createEmptyLocalWorkspace();
        const localMemory = createMemoryStorage();
        const localClient = createLocalWorkspaceClient(localMemory.storage);
        await localClient.updateBenefitProfile({
            telecomMemberships: [],
            subscriptions: [],
            enabledPayProviderIds: ['pay-1'],
            moneyEnabled: true,
            pointsEnabled: true,
            pointValue: 1,
            smallBenefitThreshold: 100,
        });
        const local = await localClient.read();
        const localExport = createAccountWorkspaceExportFromLocal(
            local,
            '2026-08-18T12:00:00.000Z'
        );
        const emptyExport = createAccountWorkspaceExport({
            sourceWorkspaceId: 'account-1',
            exportedAt: '2026-08-18T12:00:00.000Z',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: {
                telecomMemberships: [],
                subscriptions: [],
                enabledPayProviderIds: [],
                moneyEnabled: true,
                pointsEnabled: true,
                pointValue: 1,
                smallBenefitThreshold: 100,
            },
        });

        expect(getAccountWorkspaceSyncMode(local, {
            workspace: emptyExport,
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: false,
                hasWorkspacePreferences: false,
                totalRecords: 0,
            },
            revision: 0,
            source: 'legacy',
        })).toBe('upload');
        expect(getAccountWorkspaceSyncMode(empty, {
            workspace: localExport,
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: true,
                hasWorkspacePreferences: true,
                totalRecords: 2,
            },
            revision: 1,
            source: 'snapshot',
        })).toBe('restore');
        expect(getAccountWorkspaceSyncMode(local, {
            workspace: localExport,
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: true,
                hasWorkspacePreferences: true,
                totalRecords: 2,
            },
            revision: 1,
            source: 'snapshot',
        })).toBe('synced');

        const staleExport = structuredClone(localExport);
        staleExport.benefitProfile.enabledPayProviderIds = [];
        expect(getAccountWorkspaceSyncMode(local, {
            workspace: staleExport,
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: false,
                hasWorkspacePreferences: true,
                totalRecords: 1,
            },
            revision: 1,
            source: 'snapshot',
        })).toBe('update');
        staleExport.sourceWorkspaceId = 'another-workspace';
        expect(getAccountWorkspaceSyncMode(local, {
            workspace: staleExport,
            summary: {
                categories: 0,
                brands: 0,
                cards: 0,
                rules: 0,
                performances: 0,
                history: 0,
                deletedRecords: 0,
                hasProfile: false,
                hasWorkspacePreferences: true,
                totalRecords: 1,
            },
            revision: 1,
            source: 'snapshot',
        })).toBe('conflict');
    });

    it('serializes concurrent mutations without losing personal data', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);

        await Promise.all([
            client.createCategory({ name: '카페' }),
            client.createCategory({ name: '편의점' }),
        ]);

        const workspace = await client.read();
        expect(workspace.categories.map(category => category.name)).toEqual(['카페', '편의점']);
        expect(new Set(workspace.categories.map(category => category.userId)))
            .toEqual(new Set([workspace.workspaceId]));
    });

    it('persists cards, rules, profile, performance, and recommendation history', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        const category = await client.createCategory({ name: '카페' });
        const brand = await client.createBrand({
            name: '테스트 커피',
            categoryId: category.id,
            iconName: 'Coffee',
        });
        const card = await client.createCard({
            name: '테스트 카드',
            company: '테스트 카드사',
            color: 'bg-blue-500',
            limitTable: [{ threshold: 300000, limit: 10000 }],
        });
        const rule = await client.createRule({
            cardId: card.id,
            category: category.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL',
            description: '10% 할인',
            detail: '테스트 상세',
            condition: { minSpend: 5000 },
            action: { type: 'PERCENT', value: 10 },
            limitConfig: { monthlyAmount: 10000 },
        });

        await client.updatePerformance(card.id, 350000, '2026-07');
        await client.updateBenefitProfile({
            telecomMemberships: [{ providerId: 'telecom-1', tier: 'VIP' }],
            subscriptions: [],
            enabledPayProviderIds: ['pay-1'],
            moneyEnabled: true,
            pointsEnabled: false,
            pointValue: 1,
            smallBenefitThreshold: 100,
        });
        const transaction = await client.createTransaction({
            paymentTarget: { kind: 'BRAND', brandId: brand.id, label: brand.name },
            amount: 10000,
            combination: {
                ...combination,
                cardId: card.id,
                steps: combination.steps.map(step => ({
                    ...step,
                    cardId: card.id,
                    ruleId: rule.id,
                })),
            },
            catalogVersion: 'catalog-v1',
        });

        const workspace = await client.read();
        expect(workspace.cards).toContainEqual(card);
        expect(workspace.rules).toContainEqual(rule);
        expect(workspace.performances).toContainEqual({
            cardId: card.id,
            amount: 350000,
            performanceMonth: '2026-07',
        });
        expect(workspace.benefitProfile.enabledPayProviderIds).toEqual(['pay-1']);
        expect(workspace.history[0]).toEqual(transaction);
        expect(transaction).toMatchObject({
            brandId: brand.id,
            cardId: card.id,
            ruleId: rule.id,
            discountAmount: 1000,
        });
        expect(transaction.combinationSnapshot).toMatchObject({ catalogVersion: 'catalog-v1' });
    });

    it('adds a recorded card charge to the current performance goal atomically', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-20T03:00:00.000Z'));
        try {
            const memory = createMemoryStorage();
            const client = createLocalWorkspaceClient(memory.storage);
            const card = await client.createCard({
                name: '실적 카드',
                company: '테스트 카드사',
                color: 'bg-violet-500',
                limitTable: [{ threshold: 300000, limit: 10000 }],
            });
            await client.updatePerformance(card.id, 250000, '2026-08', 300000);

            const transaction = await client.createTransaction({
                paymentTarget: { kind: 'GENERAL', label: '동네 문구점' },
                amount: 10000,
                combination: {
                    ...combination,
                    cardId: card.id,
                    steps: [
                        {
                            id: 'promotion:general-payment',
                            layer: 'DISCOUNT',
                            providerName: '테스트 프로모션',
                            title: '일반 결제 할인',
                            certainty: 'CONFIRMED',
                            amountBefore: 10000,
                            benefitAmount: 500,
                            amountAfter: 9500,
                            isImmediate: true,
                            promotionId: 'general-payment-promotion',
                        },
                        ...combination.steps.map(step => ({
                            ...step,
                            cardId: card.id,
                            amountBefore: 10000,
                        })),
                    ],
                },
                catalogVersion: 'catalog-v1',
            });
            const workspace = await client.read();

            expect(transaction.performanceContributionAmount).toBe(10000);
            expect(transaction).toMatchObject({
                paymentTarget: { kind: 'GENERAL', label: '동네 문구점' },
                combinationSnapshot: {
                    paymentTarget: { kind: 'GENERAL', label: '동네 문구점' },
                },
            });
            expect(transaction.brandId).toBeUndefined();
            expect(workspace.performances).toContainEqual({
                cardId: card.id,
                performanceMonth: '2026-08',
                amount: 260000,
                targetAmount: 300000,
            });
            expect(buildPromotionUsage(workspace.history, new Date(
                '2026-08-20T03:00:00.000Z'
            ))['general-payment-promotion']).toMatchObject({
                dailyCount: 1,
                monthlyCount: 1,
                yearlyCount: 1,
                monthlyAmount: 500,
            });
            expect(workspace.recordMetadata[`performances:${card.id}:2026-08`].updatedAt)
                .toBe('2026-08-20T03:00:00.000Z');
        } finally {
            vi.useRealTimers();
        }
    });

    it('cascades local category deletion and keeps sync tombstones', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        const category = await client.createCategory({ name: '카페' });
        const brand = await client.createBrand({ name: '테스트 커피', categoryId: category.id });
        const card = await client.createCard({
            name: '테스트 카드',
            company: '테스트 카드사',
            color: 'bg-blue-500',
            limitTable: [],
        });
        const rule = await client.createRule({
            cardId: card.id,
            category: category.id,
            includedBrands: [brand.id],
            excludedBrands: [],
            platformType: 'ALL',
            description: '할인',
            detail: '',
            condition: {},
            action: { type: 'FLAT', value: 1000 },
            limitConfig: {},
        });

        await client.deleteCategory(category.id);
        const workspace = await client.read();

        expect(workspace.categories).toEqual([]);
        expect(workspace.brands).toEqual([]);
        expect(workspace.rules.find(item => item.id === rule.id)).toMatchObject({
            category: undefined,
            includedBrands: [],
        });
        expect(workspace.recordMetadata[`categories:${category.id}`].deletedAt).toBeTruthy();
        expect(workspace.recordMetadata[`brands:${brand.id}`].deletedAt).toBeTruthy();
    });

    it('validates exported workspaces before replacing local data', async () => {
        const initial = createEmptyLocalWorkspace({
            now: '2026-08-18T09:00:00.000Z',
            idFactory: (() => {
                const ids = ['workspace-id', 'profile-id', 'device-id'];
                return () => ids.shift() ?? 'unexpected-id';
            })(),
        });
        const memory = createMemoryStorage(initial);
        const client = createLocalWorkspaceClient(memory.storage);
        const exported = await client.exportJson();

        await expect(client.importJson(exported)).resolves.toEqual(initial);
        await expect(client.importJson(JSON.stringify({
            ...initial,
            schemaVersion: 2,
        }))).rejects.toThrow('지원하지 않는 로컬 workspace schema 버전');
        expect(parseLocalWorkspaceSnapshot(JSON.parse(exported))).toEqual(initial);
        expect(memory.getCurrent()).toEqual(initial);
    });

    it('purges personal data into a new workspace without retaining tombstones', async () => {
        const memory = createMemoryStorage();
        const client = createLocalWorkspaceClient(memory.storage);
        const category = await client.createCategory({ name: '삭제할 카테고리' });
        await client.deleteCategory(category.id);
        await client.updateBenefitProfile({
            telecomMemberships: [],
            subscriptions: [],
            enabledPayProviderIds: ['pay-1'],
            moneyEnabled: true,
            pointsEnabled: true,
            pointValue: 1,
            smallBenefitThreshold: 100,
        });
        const previous = await client.read();
        const ids = ['fresh-workspace', 'fresh-profile', 'fresh-device'];

        const purged = await client.purgePersonalData({
            now: '2026-08-21T09:00:00.000Z',
            idFactory: () => ids.shift() ?? 'unexpected-id',
        });

        expect(purged).toMatchObject({
            workspaceId: 'fresh-workspace',
            deviceId: 'fresh-device',
            categories: [],
            brands: [],
            cards: [],
            rules: [],
            performances: [],
            history: [],
            benefitProfile: {
                enabledPayProviderIds: [],
            },
            recordMetadata: {
                profile: {
                    id: 'fresh-profile',
                    createdAt: '2026-08-21T09:00:00.000Z',
                    updatedAt: '2026-08-21T09:00:00.000Z',
                },
            },
        });
        expect(purged.workspaceId).not.toBe(previous.workspaceId);
        expect(purged.recordMetadata[`categories:${category.id}`]).toBeUndefined();
        expect(memory.getCurrent()).toEqual(purged);
    });

    it('rejects records that claim another workspace owner', () => {
        const snapshot = createEmptyLocalWorkspace();
        snapshot.cards.push({
            id: 'foreign-card',
            userId: 'another-workspace',
            name: '외부 카드',
            company: '테스트',
            color: 'bg-gray-500',
            limitTable: [],
        });

        expect(() => parseLocalWorkspaceSnapshot(snapshot))
            .toThrow('workspace 소유권이 올바르지 않습니다');
    });
});
