import 'server-only';

import { asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    categories,
    merchantRouteVerifications,
    promotionOffers,
    promotionCollectionRuns,
    promotionProviders,
    subscriptionProducts,
} from '@/db/schema';
import {
    toBrand,
    toCard,
    toCategory,
    toMerchantRouteVerification,
    toPromotionOffer,
    toPromotionProvider,
    toRule,
    toSubscriptionProduct,
} from '@/lib/db-mappers';
import type { BenefitCatalogFreshness, BenefitCatalogSnapshot } from '@/types';
import { buildBenefitCatalogSnapshot } from './benefit-catalog';

type CatalogServerGlobal = typeof globalThis & {
    cherryPickerBenefitCatalog?: BenefitCatalogSnapshot;
};

const catalogServerGlobal = globalThis as CatalogServerGlobal;

export function getBenefitCatalogSnapshot(): BenefitCatalogSnapshot {
    const cached = catalogServerGlobal.cherryPickerBenefitCatalog;

    try {
        const source = db.transaction(tx => {
            const latestRun = tx.select().from(promotionCollectionRuns)
                .orderBy(desc(promotionCollectionRuns.finishedAt))
                .get();
            const latestSuccessfulRun = tx.select().from(promotionCollectionRuns)
                .where(eq(promotionCollectionRuns.status, 'SUCCEEDED'))
                .orderBy(desc(promotionCollectionRuns.finishedAt))
                .get();
            const latestPublishedOffer = tx.select({
                publishedAt: promotionOffers.publishedAt,
            }).from(promotionOffers)
                .where(eq(promotionOffers.status, 'PUBLISHED'))
                .orderBy(desc(promotionOffers.publishedAt))
                .get();
            const freshness: BenefitCatalogFreshness = {
                collectionStatus: latestRun?.status ?? 'UNKNOWN',
                sourceCount: latestRun?.sourceCount ?? 0,
                failedSourceCount: latestRun?.failedSourceCount ?? 0,
                ...(latestRun && { lastAttemptAt: latestRun.finishedAt.toISOString() }),
                ...(latestSuccessfulRun && {
                    lastSuccessfulAt: latestSuccessfulRun.finishedAt.toISOString(),
                }),
                ...(latestPublishedOffer?.publishedAt && {
                    lastPublishedAt: latestPublishedOffer.publishedAt.toISOString(),
                }),
            };

            return {
                categories: tx.select().from(categories)
                    .where(isNull(categories.userId))
                    .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id))
                    .all()
                    .map(toCategory),
                brands: tx.select().from(brands)
                    .where(isNull(brands.userId))
                    .orderBy(asc(brands.sortOrder), asc(brands.name), asc(brands.id))
                    .all()
                    .map(toBrand),
                cards: tx.select().from(cards)
                    .where(isNull(cards.userId))
                    .orderBy(asc(cards.name), asc(cards.id))
                    .all()
                    .map(toCard),
                rules: tx.select().from(benefitRules)
                    .where(isNull(benefitRules.userId))
                    .orderBy(
                        asc(benefitRules.cardId),
                        asc(benefitRules.description),
                        asc(benefitRules.id)
                    )
                    .all()
                    .map(toRule),
                providers: tx.select().from(promotionProviders)
                    .where(eq(promotionProviders.isActive, true))
                    .orderBy(asc(promotionProviders.sortOrder), asc(promotionProviders.id))
                    .all()
                    .map(toPromotionProvider),
                subscriptionProducts: tx.select().from(subscriptionProducts)
                    .where(eq(subscriptionProducts.isActive, true))
                    .orderBy(asc(subscriptionProducts.name), asc(subscriptionProducts.id))
                    .all()
                    .map(toSubscriptionProduct),
                promotions: tx.select().from(promotionOffers)
                    .where(eq(promotionOffers.status, 'PUBLISHED'))
                    .orderBy(
                        asc(promotionOffers.layer),
                        asc(promotionOffers.title),
                        asc(promotionOffers.id)
                    )
                    .all()
                    .map(toPromotionOffer),
                routeVerifications: tx.select().from(merchantRouteVerifications)
                    .orderBy(
                        asc(merchantRouteVerifications.brandId),
                        asc(merchantRouteVerifications.payProviderId),
                        asc(merchantRouteVerifications.cardCompany),
                        asc(merchantRouteVerifications.channel),
                        asc(merchantRouteVerifications.id)
                    )
                    .all()
                    .map(toMerchantRouteVerification),
                freshness,
            };
        });
        const candidate = buildBenefitCatalogSnapshot(source);

        if (
            cached?.catalogVersion === candidate.catalogVersion &&
            JSON.stringify(cached.freshness) === JSON.stringify(candidate.freshness)
        ) return cached;

        catalogServerGlobal.cherryPickerBenefitCatalog = candidate;
        return candidate;
    } catch (error) {
        if (cached) {
            console.error(
                '새 공개 혜택 카탈로그를 만들지 못해 마지막 정상 snapshot을 사용합니다.',
                error
            );
            return cached;
        }

        throw error;
    }
}
