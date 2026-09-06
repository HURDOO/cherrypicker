import { describe, expect, it } from 'vitest';
import {
    createAccountWorkspaceExport,
    parseAccountWorkspaceExport,
    summarizeAccountWorkspace,
} from './account-workspace-export';

const createExport = () => createAccountWorkspaceExport({
    sourceWorkspaceId: 'account-1',
    exportedAt: '2026-08-18T10:00:00.000Z',
    categories: [{ id: 'category-1', name: '내 카테고리', userId: 'account-1' }],
    brands: [{
        id: 'brand-1',
        name: '내 브랜드',
        categoryId: 'category-1',
        userId: 'account-1',
    }],
    cards: [{
        id: 'card-1',
        userId: 'account-1',
        name: '내 카드',
        company: '테스트 카드사',
        color: 'bg-blue-500',
        limitTable: [],
    }],
    rules: [{
        id: 'rule-1',
        userId: 'account-1',
        cardId: 'card-1',
        category: 'category-1',
        includedBrands: ['brand-1'],
        excludedBrands: [],
        description: '할인',
        detail: '',
        condition: {},
        action: { type: 'FLAT', value: 1000 },
        limitConfig: {},
    }],
    performances: [{
        cardId: 'card-1',
        performanceMonth: '2026-07',
        amount: 300000,
        targetAmount: 500000,
    }],
    history: [{
        id: 42,
        date: '2026-08-17T09:00:00.000Z',
        brandId: 'brand-1',
        cardId: 'card-1',
        ruleId: 'rule-1',
        amount: 10000,
        discountAmount: 1000,
        performanceContributionAmount: 10000,
    }],
    benefitProfile: {
        telecomMemberships: [{ providerId: 'telecom-1', tier: 'VIP' }],
        subscriptions: [],
        enabledPayProviderIds: [],
        moneyEnabled: true,
        pointsEnabled: true,
        pointValue: 1,
        smallBenefitThreshold: 100,
    },
    profileUpdatedAt: '2026-08-16T09:00:00.000Z',
    performanceUpdatedAt: {
        'card-1:2026-07': '2026-08-15T09:00:00.000Z',
    },
});

describe('account workspace export', () => {
    it('exports only personal records and removes the server owner field', () => {
        const workspace = createExport();

        expect(workspace.categories[0]).not.toHaveProperty('userId');
        expect(workspace.brands[0]).not.toHaveProperty('userId');
        expect(workspace.cards[0]).not.toHaveProperty('userId');
        expect(workspace.rules[0]).not.toHaveProperty('userId');
        expect(workspace.recordMetadata.profile.updatedAt)
            .toBe('2026-08-16T09:00:00.000Z');
        expect(workspace.recordMetadata['performances:card-1:2026-07'].updatedAt)
            .toBe('2026-08-15T09:00:00.000Z');
        expect(workspace.recordMetadata['history:42'].createdAt)
            .toBe('2026-08-17T09:00:00.000Z');
        expect(workspace.sourceWorkspaceId).toBe('account-1');
        expect(workspace.performances[0].targetAmount).toBe(500000);
        expect(workspace.history[0].performanceContributionAmount).toBe(10000);
        expect(workspace.benefitProfile.smallBenefitThreshold).toBe(100);
    });

    it('summarizes preview counts and validates the transport contract', () => {
        const workspace = createExport();

        expect(parseAccountWorkspaceExport(workspace)).toEqual(workspace);
        expect(summarizeAccountWorkspace(workspace)).toEqual({
            categories: 1,
            brands: 1,
            cards: 1,
            rules: 1,
            performances: 1,
            history: 1,
            deletedRecords: 0,
            hasProfile: true,
            hasWorkspacePreferences: true,
            totalRecords: 8,
        });
    });

    it('defaults legacy exports without a small-benefit setting to 100 won', () => {
        const workspace = createExport();
        const {
            smallBenefitThreshold,
            ...legacyProfile
        } = workspace.benefitProfile;
        const legacy = { ...workspace, benefitProfile: legacyProfile };

        expect(smallBenefitThreshold).toBe(100);
        expect(parseAccountWorkspaceExport(legacy).benefitProfile.smallBenefitThreshold)
            .toBe(100);
    });

    it('round-trips a general payment target without a catalog brand', () => {
        const workspace = createExport();
        workspace.history[0] = {
            ...workspace.history[0],
            brandId: undefined,
            paymentTarget: { kind: 'GENERAL', label: '동네 문구점' },
        };

        const parsed = parseAccountWorkspaceExport(workspace).history[0];
        expect(parsed).toMatchObject({
            paymentTarget: { kind: 'GENERAL', label: '동네 문구점' },
        });
        expect(parsed.brandId).toBeUndefined();
    });

    it('preserves selected cards and completed onboarding in account backups', () => {
        const workspace = createExport();
        workspace.workspacePreferences = {
            selectedSystemCardIds: ['system-a', 'system-b'],
            firstSetup: {
                status: 'COMPLETED',
                step: 'RECOMMENDATION',
                completedAt: '2026-08-18T10:05:00.000Z',
            },
        };

        expect(parseAccountWorkspaceExport(workspace).workspacePreferences).toEqual(
            workspace.workspacePreferences
        );
    });

    it('rejects unsupported versions and server ownership leakage', () => {
        const workspace = createExport();

        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            schemaVersion: 2,
        })).toThrow('지원하지 않는 계정 workspace schema 버전');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            cards: [{ ...workspace.cards[0], userId: 'account-1' }],
        })).toThrow('서버 소유자 정보가 포함');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            workspacePreferences: {
                selectedSystemCardIds: ['system-a'],
                firstSetup: {
                    status: 'AWAITING_RECOMMENDATION',
                    step: 'PERFORMANCE',
                },
            },
        })).toThrow('첫 설정 단계 조합');
    });

    it('preserves deletion metadata and counts it as backup data', () => {
        const workspace = createExport();
        workspace.recordMetadata['categories:deleted'] = {
            id: 'deleted-category',
            createdAt: '2026-08-17T09:00:00.000Z',
            updatedAt: '2026-08-18T09:00:00.000Z',
            deletedAt: '2026-08-18T09:00:00.000Z',
        };

        const parsed = parseAccountWorkspaceExport(workspace);

        expect(parsed.recordMetadata['categories:deleted'].deletedAt)
            .toBe('2026-08-18T09:00:00.000Z');
        expect(summarizeAccountWorkspace(parsed)).toMatchObject({
            deletedRecords: 1,
            totalRecords: 9,
        });
    });

    it('rejects duplicate IDs and malformed nested calculation data', () => {
        const workspace = createExport();

        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            cards: [workspace.cards[0], workspace.cards[0]],
        })).toThrow('카드 ID가 중복');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            performances: [workspace.performances[0], workspace.performances[0]],
        })).toThrow('카드 실적 ID가 중복');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            rules: [{
                ...workspace.rules[0],
                action: { type: 'PERCENT', value: 101 },
            }],
        })).toThrow('혜택 계산 값이 올바르지 않습니다');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            sourceWorkspaceId: '',
        })).toThrow('원본 ID');
        expect(() => parseAccountWorkspaceExport({
            ...workspace,
            performances: [{ ...workspace.performances[0], targetAmount: 0 }],
        })).toThrow('카드 실적 목표');
    });
});
