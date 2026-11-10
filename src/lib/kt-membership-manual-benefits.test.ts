import { describe, expect, it } from 'vitest';
import {
    buildKtManualOfferDraft,
    KT_MANUAL_BENEFITS,
    KT_NEW_BRANDS,
    KT_TIERS_ALL,
    ktManualSourceKey,
    ktPartnerDetailUrl,
} from './kt-membership-manual-benefits';
import { normalizePromotionDraft } from './promotion-input';
import { brandCategoryIcon, officialBrandIdFor } from './promotion-parsers';
import { getTelecomTierOptions } from '@/utils/telecomTiers';

describe('KT membership manual benefits', () => {
    it('normalizes every entry with the admin manual-candidate validator', () => {
        KT_MANUAL_BENEFITS.forEach(benefit => {
            const offer = normalizePromotionDraft(buildKtManualOfferDraft(benefit));
            expect(offer.providerId).toBe('kt');
            expect(offer.condition.applicabilityScope).not.toBe('UNKNOWN');
            expect(offer.sourceUrl).toBe(ktPartnerDetailUrl(benefit.pageCode));
            expect(offer.sourceUrl).toMatch(/^https:\/\/membership\.kt\.com\/discount\/partner\/C\d+\/\d+\/PartnerDetail\.do$/);
        });
    });

    it('uses only the KT grades the app offers', () => {
        const ktTiers = new Set(getTelecomTierOptions('kt', []));
        KT_TIERS_ALL.forEach(tier => expect(ktTiers.has(tier)).toBe(true));
        KT_MANUAL_BENEFITS.forEach(benefit => {
            expect(benefit.tiers.length).toBeGreaterThan(0);
            benefit.tiers.forEach(tier => expect(ktTiers.has(tier)).toBe(true));
        });
    });

    it('keeps the tier variants of one page apart', () => {
        const keys = KT_MANUAL_BENEFITS.map(ktManualSourceKey);
        expect(new Set(keys).size).toBe(keys.length);

        const byPage = new Map<string, string[]>();
        KT_MANUAL_BENEFITS.forEach(benefit => {
            byPage.set(benefit.pageCode, [...(byPage.get(benefit.pageCode) ?? []), ...benefit.tiers]);
        });
        byPage.forEach(tiers => expect(new Set(tiers).size).toBe(tiers.length));
    });

    it('never counts a percent discount without a cap unless the source has none', () => {
        const uncapped = KT_MANUAL_BENEFITS.filter(benefit =>
            benefit.calculationMode !== 'INFORMATION_ONLY' &&
            benefit.action.type === 'PERCENT' &&
            benefit.action.maxBenefit === undefined
        ).map(benefit => benefit.pageCode);
        // Papa John's, the tteokbokki online shop and Mr. Healing state no cap.
        expect([...new Set(uncapped)].sort()).toEqual(['C21/172', 'C21/189', 'C21/75']);
    });

    it('keeps coupon, item and app-booking benefits out of the confirmed total', () => {
        KT_MANUAL_BENEFITS.forEach(benefit => {
            const offer = normalizePromotionDraft(buildKtManualOfferDraft(benefit));
            if (benefit.requiresCoupon || benefit.scope === 'PRODUCT_SET') {
                expect(offer.condition.calculationMode).not.toBe('CALCULABLE');
            }
            if (benefit.action.valueSemantics === 'UP_TO') {
                expect(offer.condition.calculationMode).toBe('INFORMATION_ONLY');
            }
        });
    });

    it('caps the CU morning meal discount at 1,000 won on 5,000 won', () => {
        const cu = KT_MANUAL_BENEFITS.find(benefit => benefit.brandId === 'cu');
        expect(cu?.action).toMatchObject({ type: 'PERCENT', value: 20, maxBenefit: 1_000, unitAmount: 1_000 });
        expect(cu?.calculationMode).toBe('CONDITIONAL');
    });

    it('creates new brands under the shared official ID and only when a benefit uses them', () => {
        const usedBrandIds = new Set(KT_MANUAL_BENEFITS.map(benefit => benefit.brandId));
        KT_NEW_BRANDS.forEach(brand => {
            expect(brand.id).toBe(officialBrandIdFor(brand.name));
            expect(brand.iconName).toBe(brandCategoryIcon(brand.categoryId));
            expect(usedBrandIds.has(brand.id)).toBe(true);
        });
    });

    it('splits Paris Croissant at GOLD, unlike the usual VVIP/VIP split', () => {
        const parisCroissant = KT_MANUAL_BENEFITS.filter(benefit => benefit.pageCode === 'C21/73');
        expect(parisCroissant.map(benefit => [benefit.tiers, benefit.action.value])).toEqual([
            [['VVIP', 'VIP', 'GOLD'], 10],
            [['SILVER', 'WHITE', '일반'], 5],
        ]);
        expect(parisCroissant.flatMap(benefit => benefit.tiers).sort()).toEqual([...KT_TIERS_ALL].sort());
    });
});
