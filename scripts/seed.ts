import './load-env';
import { db, databasePath } from '../src/db';
import {
    benefitRules,
    brands,
    cards,
    categories,
} from '../src/db/schema';
import type {
    LimitConfig,
    PlatformType,
    RuleAction,
    RuleCondition,
} from '../src/types';
import {
    INITIAL_BRANDS,
    INITIAL_CARDS,
    INITIAL_CATEGORIES,
    INITIAL_RULES,
} from '../src/utils/seedData';

type SeedRecord = Record<string, unknown>;

interface SeedBrand {
    id: string;
    name: string;
    categoryId: string;
    iconName?: string;
}

interface SeedCard {
    id: string;
    name: string;
    company: string;
    color: string;
    limitTable: Array<{ threshold: number; limit: number }>;
}

interface SeedRule {
    id: string;
    cardId: string;
    category?: string;
    includedBrands?: string[];
    excludedBrands?: string[];
    platformType?: PlatformType;
    sharedGroupId?: string;
    usesCardLimit?: boolean;
    description: string;
    detail?: string;
    condition?: RuleCondition;
    action: RuleAction;
    limitConfig?: LimitConfig;
}

function camelizeKey(key: string) {
    return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camelize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(camelize);
    }

    if (value && typeof value === 'object') {
        return Object.entries(value as SeedRecord).reduce<SeedRecord>((result, [key, item]) => {
            result[camelizeKey(key)] = camelize(item);
            return result;
        }, {});
    }

    return value;
}

const seedBrands = camelize(INITIAL_BRANDS) as SeedBrand[];
const seedCards = camelize(INITIAL_CARDS) as SeedCard[];
const seedRules = camelize(INITIAL_RULES) as SeedRule[];

db.transaction((tx) => {
    INITIAL_CATEGORIES.forEach((category, sortOrder) => {
        tx.insert(categories)
            .values({
                id: category.id,
                name: category.name,
                userId: null,
                sortOrder,
            })
            .onConflictDoUpdate({
                target: categories.id,
                set: {
                    name: category.name,
                    userId: null,
                    sortOrder,
                },
            })
            .run();
    });

    seedBrands.forEach((brand, sortOrder) => {
        tx.insert(brands)
            .values({
                id: brand.id,
                name: brand.name,
                categoryId: brand.categoryId,
                iconName: brand.iconName || null,
                userId: null,
                sortOrder,
            })
            .onConflictDoUpdate({
                target: brands.id,
                set: {
                    name: brand.name,
                    categoryId: brand.categoryId,
                    iconName: brand.iconName || null,
                    userId: null,
                    sortOrder,
                },
            })
            .run();
    });

    seedCards.forEach((card) => {
        tx.insert(cards)
            .values({
                id: card.id,
                name: card.name,
                company: card.company,
                color: card.color,
                limitTable: card.limitTable,
                userId: null,
            })
            .onConflictDoUpdate({
                target: cards.id,
                set: {
                    name: card.name,
                    company: card.company,
                    color: card.color,
                    limitTable: card.limitTable,
                    userId: null,
                },
            })
            .run();
    });

    seedRules.forEach((rule) => {
        tx.insert(benefitRules)
            .values({
                id: rule.id,
                cardId: rule.cardId,
                userId: null,
                category: rule.category || null,
                includedBrands: rule.includedBrands || [],
                excludedBrands: rule.excludedBrands || [],
                platformType: rule.platformType || 'ALL',
                sharedGroupId: rule.sharedGroupId || null,
                usesCardLimit: rule.usesCardLimit ?? true,
                description: rule.description,
                detail: rule.detail || '',
                condition: rule.condition || {},
                action: rule.action,
                limitConfig: rule.limitConfig || {},
            })
            .onConflictDoUpdate({
                target: benefitRules.id,
                set: {
                    cardId: rule.cardId,
                    userId: null,
                    category: rule.category || null,
                    includedBrands: rule.includedBrands || [],
                    excludedBrands: rule.excludedBrands || [],
                    platformType: rule.platformType || 'ALL',
                    sharedGroupId: rule.sharedGroupId || null,
                    usesCardLimit: rule.usesCardLimit ?? true,
                    description: rule.description,
                    detail: rule.detail || '',
                    condition: rule.condition || {},
                    action: rule.action,
                    limitConfig: rule.limitConfig || {},
                },
            })
            .run();
    });
});

console.log(
    `Seeded ${INITIAL_CATEGORIES.length} categories, ${seedBrands.length} brands, ` +
    `${seedCards.length} cards, and ${seedRules.length} rules into ${databasePath}.`
);
