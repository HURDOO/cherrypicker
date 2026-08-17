import type {
    BenefitRule,
    Brand,
    Card,
    Category,
    MerchantRouteVerification,
    PromotionOffer,
    PromotionProvider,
    SubscriptionProduct,
    TransactionHistory,
    UserBenefitProfile,
    UserCardPerformance,
} from '@/types';
import type {
    benefitRules,
    brands,
    cards,
    categories,
    merchantRouteVerifications,
    promotionOffers,
    promotionProviders,
    subscriptionProducts,
    transactionHistory,
    userBenefitProfiles,
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
        ...(row.cardId && { cardId: row.cardId }),
        ...(row.ruleId && { ruleId: row.ruleId }),
        amount: row.amount,
        discountAmount: row.discountAmount,
        ...(row.eligibleItemAmount !== null && { eligibleItemAmount: row.eligibleItemAmount }),
        ...(row.payProviderId && { payProviderId: row.payProviderId }),
        fundingType: row.fundingType,
        ...(row.combinationId && { combinationId: row.combinationId }),
        confirmedValue: row.confirmedValue,
        conditionalValue: row.conditionalValue,
        estimatedValue: row.estimatedValue,
        payableAmount: row.payableAmount,
        laterReward: row.laterReward,
        combinationSnapshot: row.combinationSnapshot,
    };
}

export function toPromotionProvider(
    row: typeof promotionProviders.$inferSelect
): PromotionProvider {
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        ...(row.sourceUrl && { sourceUrl: row.sourceUrl }),
        isActive: row.isActive,
        sortOrder: row.sortOrder,
    };
}

export function toSubscriptionProduct(
    row: typeof subscriptionProducts.$inferSelect
): SubscriptionProduct {
    return {
        id: row.id,
        providerId: row.providerId,
        name: row.name,
        aliases: row.aliases,
        benefitSummary: row.benefitSummary,
        sourceUrl: row.sourceUrl,
        isActive: row.isActive,
        ...(row.collectedAt && { collectedAt: row.collectedAt.toISOString() }),
    };
}

export function toPromotionOffer(
    row: typeof promotionOffers.$inferSelect
): PromotionOffer {
    return {
        id: row.id,
        providerId: row.providerId,
        layer: row.layer,
        title: row.title,
        description: row.description,
        brandIds: row.brandIds,
        categoryIds: row.categoryIds,
        channels: row.channels,
        ...(row.startsAt && { startsAt: row.startsAt.toISOString() }),
        ...(row.endsAt && { endsAt: row.endsAt.toISOString() }),
        action: row.action,
        condition: row.condition,
        compatibility: row.compatibility,
        limitConfig: row.limitConfig,
        certainty: row.certainty,
        status: row.status,
        sourceUrl: row.sourceUrl,
        ...(row.sourceHash && { sourceHash: row.sourceHash }),
        ...(row.collectedAt && { collectedAt: row.collectedAt.toISOString() }),
        ...(row.reviewedAt && { reviewedAt: row.reviewedAt.toISOString() }),
        ...(row.publishedAt && { publishedAt: row.publishedAt.toISOString() }),
    };
}

export function toBenefitProfile(
    row: typeof userBenefitProfiles.$inferSelect | undefined
): UserBenefitProfile {
    return {
        telecomMemberships: row?.telecomMemberships ?? [],
        subscriptions: row?.subscriptions ?? [],
        enabledPayProviderIds: row?.enabledPayProviderIds ?? [],
        moneyEnabled: row?.moneyEnabled ?? true,
        pointsEnabled: row?.pointsEnabled ?? true,
        pointValue: row?.pointValue ?? 1,
    };
}

export function toMerchantRouteVerification(
    row: typeof merchantRouteVerifications.$inferSelect
): MerchantRouteVerification {
    return {
        brandId: row.brandId,
        ...(row.payProviderId && { payProviderId: row.payProviderId }),
        ...(row.cardCompany && { cardCompany: row.cardCompany }),
        channel: row.channel,
        cardBenefitEligible: row.cardBenefitEligible,
        certainty: row.certainty,
        evidenceUrl: row.evidenceUrl,
        verifiedAt: row.verifiedAt.toISOString(),
    };
}
