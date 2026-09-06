import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    class HttpError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    }

    const tables = {
        transactionHistory: { table: 'transactionHistory' },
        transactionBenefits: { table: 'transactionBenefits' },
        userCardPerformances: {
            table: 'userCardPerformances',
            userId: { column: 'userId' },
            cardId: { column: 'cardId' },
            performanceMonth: { column: 'performanceMonth' },
            amount: { column: 'amount' },
        },
    };

    return {
        HttpError,
        tables,
        input: {} as Record<string, unknown>,
        recommendation: {} as Record<string, unknown>,
        inserts: [] as Array<{ table: unknown; values: unknown }>,
        upsert: undefined as unknown,
        requireUser: vi.fn(),
        assertCanCreateTransaction: vi.fn(),
        transaction: vi.fn(),
    };
});

vi.mock('@/db', () => ({
    db: {
        transaction: mocks.transaction,
    },
}));
vi.mock('@/db/schema', () => ({
    benefitRules: {},
    brands: {},
    cards: {},
    transactionHistory: mocks.tables.transactionHistory,
    transactionBenefits: mocks.tables.transactionBenefits,
    userCardPerformances: mocks.tables.userCardPerformances,
}));
vi.mock('@/lib/api-server', () => ({
    HttpError: mocks.HttpError,
    requireUser: mocks.requireUser,
    readJsonObject: vi.fn(async () => mocks.input),
    handleRouteError: (error: unknown) => error instanceof mocks.HttpError
        ? Response.json({ error: error.message }, { status: error.status })
        : Response.json({ error: 'server error' }, { status: 500 }),
}));
vi.mock('@/lib/data-access', () => ({
    assertCanCreateTransaction: mocks.assertCanCreateTransaction,
    visibleToUser: vi.fn(),
}));
vi.mock('@/lib/card-visibility', () => ({ cardVisibleToUser: vi.fn() }));
vi.mock('@/lib/recommendation-server', () => ({
    calculateRecommendationForUser: vi.fn(() => mocks.recommendation),
}));
vi.mock('@/lib/db-mappers', () => ({
    toBrand: vi.fn(),
    toCard: vi.fn(),
    toPerformance: vi.fn(),
    toRule: vi.fn(),
    toTransaction: (row: Record<string, unknown>) => ({
        id: row.id,
        date: (row.createdAt as Date).toISOString(),
        brandId: row.brandId,
        cardId: row.cardId,
        amount: row.amount,
        discountAmount: row.discountAmount,
        confirmedValue: row.confirmedValue,
        payableAmount: row.payableAmount,
        combinationSnapshot: row.combinationSnapshot,
    }),
}));

import { POST } from './route';

const confirmedCombination = {
    id: 'combination-1',
    fundingType: 'CARD',
    cardId: 'card-1',
    cardName: '테스트 카드',
    cardChargeAmount: 9_000,
    steps: [{
        id: 'card:card-1:rule-1',
        layer: 'PAYMENT_METHOD',
        providerName: '테스트 카드사',
        title: '1천원 할인',
        certainty: 'CONFIRMED',
        amountBefore: 9_000,
        benefitAmount: 1_000,
        amountAfter: 8_000,
        isImmediate: true,
        cardId: 'card-1',
        ruleId: 'rule-1',
    }],
    confirmedValue: 1_000,
    conditionalValue: 0,
    estimatedValue: 0,
    immediateDiscount: 1_000,
    laterReward: 0,
    payableAmount: 9_000,
    warnings: [],
    requiredChecks: [],
};

describe('combination transaction route', () => {
    beforeEach(() => {
        mocks.inserts.length = 0;
        mocks.upsert = undefined;
        mocks.requireUser.mockReset();
        mocks.assertCanCreateTransaction.mockReset();
        mocks.transaction.mockReset();
        mocks.requireUser.mockResolvedValue({ id: 'user-1' });
        mocks.input = {
            brandId: 'brand-1',
            amount: 10_000,
            isOnline: false,
            combinationId: confirmedCombination.id,
            confirmedConditionIds: [],
        };
        mocks.recommendation = { combinations: [confirmedCombination] };
        mocks.transaction.mockImplementation(callback => callback({
            insert: (table: unknown) => ({
                values: (values: unknown) => {
                    mocks.inserts.push({ table, values });
                    if (table === mocks.tables.transactionHistory) {
                        return {
                            returning: () => ({
                                get: () => ({
                                    id: 1,
                                    ...(values as Record<string, unknown>),
                                }),
                            }),
                        };
                    }
                    if (table === mocks.tables.userCardPerformances) {
                        return {
                            onConflictDoUpdate: (upsert: unknown) => {
                                mocks.upsert = upsert;
                                return { run: () => undefined };
                            },
                        };
                    }
                    return { run: () => undefined };
                },
            }),
        }));
    });

    it('writes the transaction, benefit steps, and current performance atomically', async () => {
        const response = await POST(new Request('http://localhost/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }));

        expect(response.status).toBe(201);
        expect(mocks.transaction).toHaveBeenCalledOnce();
        expect(mocks.inserts.map(insert => insert.table)).toEqual([
            mocks.tables.transactionHistory,
            mocks.tables.transactionBenefits,
            mocks.tables.userCardPerformances,
        ]);
        expect(mocks.inserts[2].values).toMatchObject({
            userId: 'user-1',
            cardId: 'card-1',
            amount: 9_000,
        });
        expect(mocks.upsert).toBeDefined();
        await expect(response.json()).resolves.toMatchObject({
            confirmedValue: 1_000,
            payableAmount: 9_000,
            performanceContributionAmount: 9_000,
        });
    });

    it('rejects an unresolved conditional combination before writing anything', async () => {
        mocks.recommendation = {
            combinations: [{
                ...confirmedCombination,
                confirmedValue: 0,
                conditionalValue: 1_000,
                steps: confirmedCombination.steps.map(step => ({
                    ...step,
                    certainty: 'CONDITIONAL',
                })),
            }],
        };

        const response = await POST(new Request('http://localhost/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        }));

        expect(response.status).toBe(409);
        await expect(response.json()).resolves.toEqual({
            error: '확인하지 않은 혜택 조건이 있습니다. 조건을 확인한 뒤 다시 기록해주세요.',
        });
        expect(mocks.assertCanCreateTransaction).not.toHaveBeenCalled();
        expect(mocks.transaction).not.toHaveBeenCalled();
    });
});
