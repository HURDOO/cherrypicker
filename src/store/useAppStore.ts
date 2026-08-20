import { create } from 'zustand';
import {
    Card, BenefitRule, Brand, Category,
    TransactionHistory, UserBenefitProfile, UserCardPerformance
} from '@/types';

const createEmptyBenefitProfile = (): UserBenefitProfile => ({
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
});

interface AppState {
    userId: string;
    storageMode: 'guest' | 'account';

    // Master Data
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];

    // User Data
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    benefitProfile: UserBenefitProfile;

    // UI State
    isLoading: boolean;

    // Actions
    setInitialData: (data: {
        userId: string;
        storageMode: 'guest' | 'account';
        categories: Category[];
        brands: Brand[];
        cards: Card[];
        rules: BenefitRule[];
        performances: UserCardPerformance[];
        history: TransactionHistory[];
        benefitProfile: UserBenefitProfile;
    }) => void;

    addTransaction: (transaction: TransactionHistory) => void;
    clearHistory: () => void;
    updatePerformance: (perf: UserCardPerformance) => void;
    setBenefitProfile: (profile: UserBenefitProfile) => void;
    setLoading: (loading: boolean) => void;
    resetData: () => void;

    // Data Management Actions
    addCard: (card: Card) => void;
    updateCard: (card: Card) => void;
    addRule: (rule: BenefitRule) => void;
    updateRule: (rule: BenefitRule) => void;
    removeRule: (id: string) => void;
    addBrand: (brand: Brand) => void;
    updateBrand: (brand: Brand) => void;
    removeBrand: (id: string) => void;
    reorderBrands: (brands: Brand[]) => void;

    addCategory: (category: Category) => void;
    updateCategory: (category: Category) => void;
    removeCategory: (id: string) => void;
    reorderCategories: (categories: Category[]) => void;

    // Navigation State
    selectedBrandId: string;
    setSelectedBrandId: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
    userId: '',
    storageMode: 'guest',
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    performances: [],
    history: [],
    benefitProfile: createEmptyBenefitProfile(),
    isLoading: true, // Default to loading until sync completes

    setInitialData: (data) => set({
        userId: data.userId,
        storageMode: data.storageMode,
        categories: data.categories,
        brands: data.brands,
        cards: data.cards,
        rules: data.rules,
        performances: data.performances,
        history: data.history,
        benefitProfile: data.benefitProfile,
        isLoading: false
    }),

    addTransaction: (transaction) => set((state) => ({
        history: [transaction, ...state.history]
    })),
    clearHistory: () => set({ history: [] }),

    updatePerformance: (perf) => set((state) => {
        const existingIndex = state.performances.findIndex(p =>
            p.cardId === perf.cardId && p.performanceMonth === perf.performanceMonth
        );
        const newPerformances = [...state.performances];
        if (existingIndex >= 0) {
            newPerformances[existingIndex] = perf;
        } else {
            newPerformances.push(perf);
        }
        return { performances: newPerformances };
    }),
    setBenefitProfile: (benefitProfile) => set({ benefitProfile }),

    setLoading: (loading) => set({ isLoading: loading }),
    resetData: () => set({
        userId: '',
        storageMode: 'guest',
        categories: [],
        brands: [],
        cards: [],
        rules: [],
        performances: [],
        history: [],
        benefitProfile: createEmptyBenefitProfile(),
        selectedBrandId: '',
        isLoading: false,
    }),

    addCard: (card) => set(state => ({ cards: [...state.cards, card] })),
    updateCard: (card) => set(state => ({
        cards: state.cards.map(c => c.id === card.id ? card : c)
    })),

    addRule: (rule) => set(state => ({ rules: [...state.rules, rule] })),
    updateRule: (rule) => set(state => ({
        rules: state.rules.map(r => r.id === rule.id ? rule : r)
    })),
    removeRule: (id) => set(state => ({
        rules: state.rules.filter(rule => rule.id !== id)
    })),

    addBrand: (brand) => set(state => ({ brands: [...state.brands, brand] })),
    updateBrand: (brand) => set(state => ({
        brands: state.brands.map(b => b.id === brand.id ? brand : b)
    })),
    removeBrand: (id) => set(state => ({
        brands: state.brands.filter(b => b.id !== id),
        rules: state.rules.map(rule => ({
            ...rule,
            includedBrands: (rule.includedBrands ?? []).filter(brandId => brandId !== id),
            excludedBrands: (rule.excludedBrands ?? []).filter(brandId => brandId !== id),
        })),
    })),
    reorderBrands: (brands) => set({ brands }),

    addCategory: (category) => set(state => ({ categories: [...state.categories, category] })),
    updateCategory: (category) => set(state => ({
        categories: state.categories.map(c => c.id === category.id ? category : c)
    })),
    removeCategory: (id) => set(state => {
        const removedBrandIds = new Set(
            state.brands.filter(brand => brand.categoryId === id).map(brand => brand.id)
        );
        return {
            categories: state.categories.filter(category => category.id !== id),
            brands: state.brands.filter(brand => brand.categoryId !== id),
            rules: state.rules.map(rule => ({
                ...rule,
                ...(rule.category === id ? { category: undefined } : {}),
                includedBrands: (rule.includedBrands ?? []).filter(
                    brandId => !removedBrandIds.has(brandId)
                ),
                excludedBrands: (rule.excludedBrands ?? []).filter(
                    brandId => !removedBrandIds.has(brandId)
                ),
            })),
        };
    }),
    reorderCategories: (categories) => set({ categories }),

    selectedBrandId: '',
    setSelectedBrandId: (id) => set({ selectedBrandId: id }),
}));
