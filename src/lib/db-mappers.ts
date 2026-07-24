import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    TransactionHistory,
    UserCardPerformance,
} from '@/types';
import type {
    benefitRules,
    brands,
    cards,
    categories,
    transactionHistory,
    userCardPerformances,
} from '@/db/schema';

export function toCategory(row: typeof categories.$inferSelect): Category {
    return {
        id: row.id,
        name: row.name,
        ...(row.userId && { userId: row.userId }),
        order: row.sortOrder,
    };
}

export function toBrand(row: typeof brands.$inferSelect): Brand {
    return {
        id: row.id,
        name: row.name,
        categoryId: row.categoryId,
        ...(row.iconName && { iconName: row.iconName }),
        ...(row.userId && { userId: row.userId }),
        order: row.sortOrder,
    };
}

export function toCard(row: typeof cards.$inferSelect): Card {
    return {
        id: row.id,
        name: row.name,
        company: row.company,
        color: row.color,
        limitTable: row.limitTable,
        ...(row.userId && { userId: row.userId }),
    };
}

export function toRule(row: typeof benefitRules.$inferSelect): BenefitRule {
    return {
        id: row.id,
        cardId: row.cardId,
        ...(row.userId && { userId: row.userId }),
        ...(row.category && { category: row.category }),
        includedBrands: row.includedBrands,
        excludedBrands: row.excludedBrands,
        platformType: row.platformType,
        ...(row.sharedGroupId && { sharedGroupId: row.sharedGroupId }),
        usesCardLimit: row.usesCardLimit,
        description: row.description,
        detail: row.detail,
        condition: row.condition,
        action: row.action,
        limitConfig: row.limitConfig,
    };
}

export function toPerformance(
    row: typeof userCardPerformances.$inferSelect
): UserCardPerformance {
    return {
        cardId: row.cardId,
        performanceMonth: row.performanceMonth,
        amount: row.amount,
    };
}

export function toTransaction(
    row: typeof transactionHistory.$inferSelect
): TransactionHistory {
    return {
        id: row.id,
        date: row.createdAt.toISOString(),
        brandId: row.brandId,
        cardId: row.cardId,
        ...(row.ruleId && { ruleId: row.ruleId }),
        amount: row.amount,
        discountAmount: row.discountAmount,
    };
}
