import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
    RecommendationRequest,
    RecommendationResponse,
    PromotionProvider,
    SubscriptionProduct,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import type {
    AccountWorkspaceExport,
    AccountWorkspaceState,
} from '@/lib/account-workspace-export';

export interface AppData {
    userId: string;
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    benefitProfile: UserBenefitProfile;
}

type CardInput = Pick<Card, 'name' | 'company' | 'color' | 'limitTable'>;

type RuleInput = {
    cardId: string;
    category?: string | null;
    includedBrands: string[];
    excludedBrands: string[];
    platformType: PlatformType;
    sharedGroupId?: string | null;
    usesCardLimit?: boolean;
    description: string;
    detail: string;
    condition: RuleCondition;
    action: RuleAction;
    limitConfig: LimitConfig;
};

type CategoryInput = Pick<Category, 'name'>;
type BrandInput = Pick<Brand, 'name' | 'categoryId' | 'iconName'>;
type TransactionInput = Pick<TransactionHistory, 'brandId' | 'cardId' | 'amount'> & {
    isOnline: boolean;
};
type CombinationTransactionInput = RecommendationRequest & {
    combinationId: string;
};

type ApiErrorBody = {
    error?: unknown;
    message?: unknown;
};

export const UNAUTHORIZED_EVENT = 'cherrypicker:unauthorized';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

export function getErrorMessage(error: unknown, fallback = '요청 처리 중 오류가 발생했습니다.'): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof error === 'string' && error.trim()) return error;

    if (isRecord(error)) {
        if (typeof error.message === 'string' && error.message.trim()) return error.message;
        if (typeof error.error === 'string' && error.error.trim()) return error.error;
        if (isRecord(error.error) && typeof error.error.message === 'string' && error.error.message.trim()) {
            return error.error.message;
        }
    }

    return fallback;
}

export class ApiRequestError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
    }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(path, {
        ...init,
        headers,
        credentials: 'same-origin',
    });

    const responseText = await response.text();
    let body: unknown;

    if (responseText) {
        try {
            body = JSON.parse(responseText);
        } catch {
            body = responseText;
        }
    }

    if (!response.ok) {
        if (response.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
        }

        const errorBody = isRecord(body) ? body as ApiErrorBody : body;
        throw new ApiRequestError(getErrorMessage(errorBody, `요청에 실패했습니다. (${response.status})`), response.status);
    }

    return body as T;
}

const jsonBody = (value: unknown) => JSON.stringify(value);
const resourcePath = (collection: string, id: string) => `/api/${collection}/${encodeURIComponent(id)}`;

export const apiClient = {
    getAppData: () => request<AppData>('/api/app-data', { cache: 'no-store' }),

    getAccountWorkspaceState: () =>
        request<AccountWorkspaceState>('/api/account/data', { cache: 'no-store' }),

    createAccountWorkspaceBackup: (workspace: AccountWorkspaceExport) =>
        request<AccountWorkspaceState>('/api/account/data', {
            method: 'POST',
            body: jsonBody({ workspace }),
        }),

    updateAccountWorkspaceBackup: (
        workspace: AccountWorkspaceExport,
        expectedRevision: number
    ) => request<AccountWorkspaceState>('/api/account/data', {
        method: 'PUT',
        body: jsonBody({ workspace, expectedRevision }),
    }),

    mergeAccountWorkspaceBackup: (
        workspace: AccountWorkspaceExport,
        expectedRevision: number
    ) => request<AccountWorkspaceState>('/api/account/data', {
        method: 'PATCH',
        body: jsonBody({ workspace, expectedRevision }),
    }),

    createTransaction: (transaction: TransactionInput) =>
        request<TransactionHistory>('/api/transactions', {
            method: 'POST',
            body: jsonBody(transaction),
        }),

    getRecommendation: (input: RecommendationRequest) =>
        request<RecommendationResponse>('/api/recommendations', {
            method: 'POST',
            body: jsonBody(input),
        }),

    createCombinationTransaction: (transaction: CombinationTransactionInput) =>
        request<TransactionHistory>('/api/transactions', {
            method: 'POST',
            body: jsonBody(transaction),
        }),

    getBenefitProfile: () =>
        request<{
            profile: UserBenefitProfile;
            providers: PromotionProvider[];
            subscriptionProducts: SubscriptionProduct[];
        }>(
            '/api/benefit-profile',
            { cache: 'no-store' }
        ),

    updateBenefitProfile: (profile: UserBenefitProfile) =>
        request<UserBenefitProfile>('/api/benefit-profile', {
            method: 'PUT',
            body: jsonBody(profile),
        }),

    deleteTransactions: () =>
        request<{ success: true }>('/api/transactions', { method: 'DELETE' }),

    updatePerformance: (cardId: string, amount: number, performanceMonth: string) =>
        request<UserCardPerformance>(resourcePath('performances', cardId), {
            method: 'PUT',
            body: jsonBody({ amount, performanceMonth }),
        }),

    resetAccountData: () =>
        request<unknown>('/api/account/data', { method: 'DELETE' }),

    createCard: (card: CardInput) =>
        request<Card>('/api/cards', {
            method: 'POST',
            body: jsonBody(card),
        }),

    updateCard: (id: string, card: CardInput) =>
        request<Card>(resourcePath('cards', id), {
            method: 'PATCH',
            body: jsonBody(card),
        }),

    createRule: (rule: RuleInput) =>
        request<BenefitRule>('/api/rules', {
            method: 'POST',
            body: jsonBody(rule),
        }),

    updateRule: (id: string, rule: RuleInput) =>
        request<BenefitRule>(resourcePath('rules', id), {
            method: 'PATCH',
            body: jsonBody(rule),
        }),

    deleteRule: (id: string) =>
        request<unknown>(resourcePath('rules', id), { method: 'DELETE' }),

    createCategory: (category: CategoryInput) =>
        request<Category>('/api/categories', {
            method: 'POST',
            body: jsonBody(category),
        }),

    updateCategory: (id: string, category: CategoryInput) =>
        request<Category>(resourcePath('categories', id), {
            method: 'PATCH',
            body: jsonBody(category),
        }),

    deleteCategory: (id: string) =>
        request<unknown>(resourcePath('categories', id), { method: 'DELETE' }),

    reorderCategories: (orderedIds: string[]) =>
        request<unknown>('/api/categories', {
            method: 'PATCH',
            body: jsonBody({ orderedIds }),
        }),

    createBrand: (brand: BrandInput) =>
        request<Brand>('/api/brands', {
            method: 'POST',
            body: jsonBody(brand),
        }),

    updateBrand: (id: string, brand: Pick<Brand, 'name'>) =>
        request<Brand>(resourcePath('brands', id), {
            method: 'PATCH',
            body: jsonBody(brand),
        }),

    deleteBrand: (id: string) =>
        request<unknown>(resourcePath('brands', id), { method: 'DELETE' }),

    reorderBrands: (categoryId: string, orderedIds: string[]) =>
        request<unknown>('/api/brands', {
            method: 'PATCH',
            body: jsonBody({ categoryId, orderedIds }),
        }),
};
