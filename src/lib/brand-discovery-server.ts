import 'server-only';

import { eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { benefitRules, brands, cards, promotionOffers } from '@/db/schema';
import { autoBrowsableBrandIds } from './brand-discovery-visibility';
import { publishedSystemCard } from './card-visibility';
import { toPromotionOffer, toRule } from './db-mappers';

type BrandRow = typeof brands.$inferSelect;

export const koreaDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
}).format(date);

/** `AUTO` brands that currently carry a benefit worth browsing, for responses outside the catalog. */
export function loadAutoBrowsableBrandIds(brandRows: readonly BrandRow[]) {
    const autoRows = brandRows.filter(row => row.discoveryVisibility === 'AUTO');
    if (autoRows.length === 0) return new Set<string>();
    return autoBrowsableBrandIds({
        brands: autoRows,
        publishedCardIds: new Set(db.select({ id: cards.id }).from(cards)
            .where(publishedSystemCard())
            .all()
            .map(row => row.id)),
        rules: db.select().from(benefitRules)
            .where(isNull(benefitRules.userId))
            .all()
            .map(toRule),
        promotions: db.select().from(promotionOffers)
            .where(eq(promotionOffers.status, 'PUBLISHED'))
            .all()
            .map(toPromotionOffer),
        today: koreaDate(),
    });
}

/** Stored row with an `AUTO` visibility resolved to what browse lists should do today. */
export const withResolvedDiscovery = (row: BrandRow, browsableAutoIds: ReadonlySet<string>): BrandRow => (
    row.discoveryVisibility === 'AUTO' && browsableAutoIds.has(row.id)
        ? { ...row, discoveryVisibility: 'BROWSE' }
        : row
);
