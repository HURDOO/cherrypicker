import { and, asc, desc, eq, gte, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    merchantRouteVerifications,
    promotionOffers,
    promotionProviders,
    transactionHistory,
    transactionBenefits,
    userBenefitProfiles,
    userCardPerformances,
} from '@/db/schema';
import type { RecommendationRequest } from '@/types';
import { calculateBestCombinations } from '@/utils/combination';
import { HttpError } from './api-server';
import { visibleToUser } from './data-access';
import {
    toBenefitProfile,
    toBrand,
    toCard,
    toMerchantRouteVerification,
    toPerformance,
    toPromotionOffer,
    toPromotionProvider,
    toRule,
    toTransaction,
} from './db-mappers';
import {
    getPreviousMonthInKst,
    getStartOfCurrentYearInKst,
} from './monthly-performance';

export function calculateRecommendationForUser(
    userId: string,
    input: RecommendationRequest,
) {
    const brand = db.select().from(brands)
        .where(and(
            eq(brands.id, input.brandId),
            visibleToUser(brands.userId, userId)
        ))
        .get();
    if (!brand) throw new HttpError(404, '브랜드를 찾을 수 없습니다.');

    const cardRows = db.select().from(cards)
        .where(or(isNull(cards.userId), eq(cards.userId, userId)))
        .orderBy(asc(cards.name))
        .all();
    const ruleRows = db.select().from(benefitRules)
        .where(or(isNull(benefitRules.userId), eq(benefitRules.userId, userId)))
        .orderBy(asc(benefitRules.cardId), asc(benefitRules.description))
        .all();
    const historyRows = db.select().from(transactionHistory)
        .where(and(
            eq(transactionHistory.userId, userId),
            gte(transactionHistory.createdAt, getStartOfCurrentYearInKst())
        ))
        .orderBy(desc(transactionHistory.createdAt))
        .all();
    const performanceRows = db.select().from(userCardPerformances)
        .where(and(
            eq(userCardPerformances.userId, userId),
            eq(userCardPerformances.performanceMonth, getPreviousMonthInKst())
        ))
        .all();
    const providerRows = db.select().from(promotionProviders)
        .where(eq(promotionProviders.isActive, true))
        .orderBy(asc(promotionProviders.sortOrder))
        .all();
    const promotionRows = db.select().from(promotionOffers)
        .where(eq(promotionOffers.status, 'PUBLISHED'))
        .orderBy(asc(promotionOffers.layer), asc(promotionOffers.title))
        .all();
    const profileRow = db.select().from(userBenefitProfiles)
        .where(eq(userBenefitProfiles.userId, userId))
        .get();
    const verificationRows = db.select().from(merchantRouteVerifications)
        .where(eq(merchantRouteVerifications.brandId, input.brandId))
        .all();
    const transactionDateById = new Map(
        historyRows.map(row => [row.id, row.createdAt])
    );
    const transactionBenefitRows = historyRows.length > 0
        ? db.select().from(transactionBenefits)
            .where(inArray(
                transactionBenefits.transactionId,
                historyRows.map(row => row.id)
            ))
            .all()
        : [];
    const now = new Date();
    const kstParts = (date: Date) => {
        const shifted = new Date(date.getTime() + 9 * 60 * 60 * 1_000);
        return {
            year: shifted.getUTCFullYear(),
            month: shifted.getUTCMonth(),
            day: shifted.getUTCDate(),
        };
    };
    const nowParts = kstParts(now);
    const promotionUsage: Record<string, {
        dailyCount: number;
        monthlyCount: number;
        yearlyCount: number;
        monthlyAmount: number;
    }> = {};
    transactionBenefitRows.forEach(row => {
        if (!row.promotionId) return;
        const transactionDate = transactionDateById.get(row.transactionId);
        if (!transactionDate) return;
        const date = kstParts(transactionDate);
        const usage = promotionUsage[row.promotionId] ?? {
            dailyCount: 0,
            monthlyCount: 0,
            yearlyCount: 0,
            monthlyAmount: 0,
        };
        if (date.year === nowParts.year) {
            usage.yearlyCount += 1;
            if (date.month === nowParts.month) {
                usage.monthlyCount += 1;
                usage.monthlyAmount += row.benefitAmount;
                if (date.day === nowParts.day) usage.dailyCount += 1;
            }
        }
        promotionUsage[row.promotionId] = usage;
    });

    return calculateBestCombinations({
        ...input,
        brand: toBrand(brand),
        cards: cardRows.map(toCard),
        rules: ruleRows.map(toRule),
        history: historyRows.map(toTransaction),
        performances: performanceRows.map(toPerformance),
        promotions: promotionRows.map(toPromotionOffer),
        providers: providerRows.map(toPromotionProvider),
        profile: toBenefitProfile(profileRow),
        routeVerifications: verificationRows.map(toMerchantRouteVerification),
        promotionUsage,
    });
}
