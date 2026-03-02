import { create } from 'zustand';
import {
    Card, BenefitRule, Brand, Category,
    TransactionHistory, UserCardPerformance
} from '@/types';

interface AppState {
    // Master Data
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];

    // User Data
    performances: UserCardPerformance[];
    history: TransactionHistory[];

    // UI State
    isLoading: boolean;

    // Actions
    setInitialData: (data: {
        categories: Category[];
        brands: Brand[];
        cards: Card[];
        rules: BenefitRule[];
        performances: UserCardPerformance[];
        history: TransactionHistory[];
    }) => void;

    addTransaction: (transaction: TransactionHistory) => void;
    updatePerformance: (perf: UserCardPerformance) => void;
    setLoading: (loading: boolean) => void;

    // Data Management Actions
    addCard: (card: Card) => void;
    updateCard: (card: Card) => void;
    addRule: (rule: BenefitRule) => void;
    updateRule: (rule: BenefitRule) => void;
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
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    performances: [],
    history: [],
    isLoading: true, // Default to loading until sync completes

    setInitialData: (data) => set({
        categories: data.categories,
        brands: data.brands,
        cards: data.cards,
        rules: data.rules,
        performances: data.performances,
        history: data.history,
        isLoading: false
    }),

    addTransaction: (transaction) => set((state) => ({
        history: [transaction, ...state.history]
    })),

    updatePerformance: (perf) => set((state) => {
        const existingIndex = state.performances.findIndex(p => p.cardId === perf.cardId);
        let newPerformances = [...state.performances];
        if (existingIndex >= 0) {
            newPerformances[existingIndex] = perf;
        } else {
            newPerformances.push(perf);
        }
        return { performances: newPerformances };
    }),

    setLoading: (loading) => set({ isLoading: loading }),

    addCard: (card) => set(state => ({ cards: [...state.cards, card] })),
    updateCard: (card) => set(state => ({
        cards: state.cards.map(c => c.id === card.id ? card : c)
    })),

    addRule: (rule) => set(state => ({ rules: [...state.rules, rule] })),
    updateRule: (rule) => set(state => ({
        rules: state.rules.map(r => r.id === rule.id ? rule : r)
    })),

    addBrand: (brand) => set(state => ({ brands: [...state.brands, brand] })),
    updateBrand: (brand) => set(state => ({
        brands: state.brands.map(b => b.id === brand.id ? brand : b)
    })),
    removeBrand: (id) => set(state => ({
        brands: state.brands.filter(b => b.id !== id)
    })),
    reorderBrands: (brands) => set({ brands }),

    addCategory: (category) => set(state => ({ categories: [...state.categories, category] })),
    updateCategory: (category) => set(state => ({
        categories: state.categories.map(c => c.id === category.id ? category : c)
    })),
    removeCategory: (id) => set(state => ({
        categories: state.categories.filter(c => c.id !== id)
    })),
    reorderCategories: (categories) => set({ categories }),

    selectedBrandId: '',
    setSelectedBrandId: (id) => set({ selectedBrandId: id }),
}));
