import { describe, expect, it } from 'vitest';
import {
    officialLguplusRows,
    officialNaverPayRows,
    officialParisKtHtmlExcerpt,
    officialParisSktHtmlExcerpt,
    officialSktCuHtmlExcerpt,
    officialTousLesJoursHtmlExcerpt,
    promotionOfficialFixtureMetadata,
} from '@/test/fixtures/promotion-official-sources';
import { createPromotionCandidateAudit } from './promotion-candidate-audit';
import {
    parseLguplusBenefits,
    parseNaverPayPromotions,
    parseSktMembershipHtml,
    parseParisMembershipHtml,
    parseTousLesJoursHtml,
    htmlToText,
} from './promotion-parsers';
import {
    applyPromotionSemanticAnalysis,
    classifyPromotionWithRules,
} from './promotion-semantic-classifier';
import {
    removalCandidateMatchesObservedPromotion,
    shouldRejectPendingCandidateMissingFromSource,
} from './promotion-removal-policy';

describe('preserved official promotion response fixtures', () => {
    it('keeps the official SKT CU tier split stable', () => {
        const offers = parseSktMembershipHtml(
            officialSktCuHtmlExcerpt,
            promotionOfficialFixtureMetadata.sources.skt,
        );

        expect(offers).toHaveLength(2);
        expect(offers.map(offer => ({
            tiers: offer.offer.condition.telecomTiers,
            value: offer.offer.action.value,
        }))).toEqual([
            { tiers: ['VIP', 'GOLD'], value: 10 },
            { tiers: ['SILVER'], value: 5 },
        ]);
        expect(offers.every(offer => offer.autoPublish)).toBe(true);
    });

    it('keeps both official Paris Baguette membership pages calculable', () => {
        const ktOffers = parseParisMembershipHtml(
            officialParisKtHtmlExcerpt,
            'kt',
            promotionOfficialFixtureMetadata.sources.parisKt,
        );
        const sktOffers = parseParisMembershipHtml(
            officialParisSktHtmlExcerpt,
            'skt',
            promotionOfficialFixtureMetadata.sources.parisSkt,
        );

        expect(ktOffers.map(item => ({
            tiers: item.offer.condition.telecomTiers,
            value: item.offer.action.value,
        }))).toEqual([
            { tiers: ['VVIP', 'VIP', 'GOLD'], value: 10 },
            { tiers: ['SILVER', 'WHITE', '일반'], value: 5 },
        ]);
        expect(sktOffers.map(item => ({
            tiers: item.offer.condition.telecomTiers,
            value: item.offer.action.value,
        }))).toEqual([
            { tiers: ['VIP', 'GOLD'], value: 10 },
            { tiers: ['SILVER'], value: 5 },
        ]);
        expect([...ktOffers, ...sktOffers].every(item => (
            item.offer.action.maxBenefit === item.offer.action.value * 2_000
            && item.offer.limitConfig.dailyCount === 1
            && item.autoPublish
        ))).toBe(true);
    });

    it('keeps all seven official Tous Les Jours telecom tiers and evidence', () => {
        const offers = parseTousLesJoursHtml(
            officialTousLesJoursHtmlExcerpt,
            promotionOfficialFixtureMetadata.sources.tousLesJours,
        );
        const ktVip = offers.find(item => (
            item.offer.providerId === 'kt'
            && item.offer.condition.telecomTiers?.includes('VIP')
        ))!;
        const lguplusVvip = offers.find(item => (
            item.offer.providerId === 'lguplus'
            && item.offer.condition.telecomTiers?.includes('VVIP')
        ))!;
        const classified = applyPromotionSemanticAnalysis(
            ktVip,
            classifyPromotionWithRules(ktVip),
        );
        const audit = createPromotionCandidateAudit({
            candidate: classified.offer as unknown as Record<string, unknown>,
            baseline: classified.offer as unknown as Record<string, unknown>,
            evidenceTexts: [classified.evidence],
            documents: [{
                id: 'official-tous-les-jours-membership',
                sourceUrl: promotionOfficialFixtureMetadata.sources.tousLesJours,
                extractedText: htmlToText(officialTousLesJoursHtmlExcerpt),
            }],
        });

        expect(offers).toHaveLength(7);
        expect(offers.map(item => [
            item.offer.providerId,
            item.offer.condition.telecomTiers,
            item.offer.action.value,
        ])).toEqual([
            ['skt', ['VIP', 'GOLD'], 15],
            ['skt', ['SILVER'], 5],
            ['kt', ['VIP', 'GOLD'], 15],
            ['kt', ['SILVER', 'WHITE', '일반'], 10],
            ['lguplus', ['VVIP'], 15],
            ['lguplus', ['VIP'], 10],
            ['lguplus', ['우수'], 5],
        ]);
        expect(lguplusVvip.offer).toMatchObject({
            action: { maxBenefit: 3_000 },
            limitConfig: { dailyCount: 1, monthlyAmount: 15_000 },
        });
        expect(offers.filter(item => item.offer.providerId === 'lguplus').map(item => ({
            maxBenefit: item.offer.action.maxBenefit,
            monthlyAmount: item.offer.limitConfig.monthlyAmount,
        }))).toEqual([
            { maxBenefit: 3_000, monthlyAmount: 15_000 },
            { maxBenefit: 2_000, monthlyAmount: 10_000 },
            { maxBenefit: 1_000, monthlyAmount: 5_000 },
        ]);
        expect(audit.summary.missingFields).toBe(0);
        expect(audit.blockingErrors).toEqual([]);
    });

    it('links a parsed U+ GS25 discount to its preserved official evidence', () => {
        const parsed = parseLguplusBenefits(
            officialLguplusRows,
            promotionOfficialFixtureMetadata.sources.lguplus,
        )[0];
        const classified = applyPromotionSemanticAnalysis(
            parsed,
            classifyPromotionWithRules(parsed),
        );
        const officialText = officialLguplusRows.flatMap(row => [
            row.jncoBnftThumCntn,
            row.jncoBnftDetlCntn,
            row.urcBnftTadvMthdCntn,
        ]).join('\n');
        const audit = createPromotionCandidateAudit({
            candidate: classified.offer as unknown as Record<string, unknown>,
            baseline: classified.offer as unknown as Record<string, unknown>,
            evidenceTexts: [classified.evidence],
            documents: [{
                id: 'official-lguplus-gs25',
                sourceUrl: promotionOfficialFixtureMetadata.sources.lguplus,
                extractedText: officialText,
            }],
        });

        expect(classified.offer).toMatchObject({
            brandIds: ['gs25'],
            action: { type: 'PERCENT', value: 10 },
            condition: {
                applicabilityScope: 'PRODUCT_SET',
                headlineEligible: false,
            },
        });
        expect(audit.summary.missingFields).toBe(0);
        expect(audit.blockingErrors).toEqual([]);
        expect(audit.coverage.every(item => item.evidence.length > 0)).toBe(true);
    });

    it('keeps safe and review-required Npay rows distinct', () => {
        const parsed = parseNaverPayPromotions(
            officialNaverPayRows,
            'DOMESTIC_INSTORE',
            promotionOfficialFixtureMetadata.sources.naverpay,
        );
        const twosome = parsed.find(item => item.offer.title.startsWith('투썸플레이스'));
        const electrolandBase = parsed.find(item => item.offer.title.startsWith('전자랜드'));
        expect(twosome).toBeDefined();
        expect(electrolandBase).toBeDefined();
        expect(electrolandBase?.discoveredBrand).toMatchObject({
            name: '전자랜드',
            categoryId: 'shopping',
        });

        const electroland = applyPromotionSemanticAnalysis(
            electrolandBase!,
            classifyPromotionWithRules(electrolandBase!),
        );
        expect(twosome).toMatchObject({
            autoPublish: true,
            offer: {
                action: { type: 'FLAT', value: 3_000 },
                condition: { minSpend: 15_000 },
                compatibility: { allowedFundingTypes: ['MONEY', 'POINTS'] },
            },
        });
        expect(electroland).toMatchObject({
            autoPublish: false,
            offer: {
                action: { type: 'FLAT', value: 50_000 },
                condition: {
                    applicabilityScope: 'PRODUCT_SET',
                    calculationMode: 'CONDITIONAL',
                    headlineEligible: false,
                    confirmationRequired: true,
                    eligibleItemSummary: '갤럭시 폴더블 행사모델 결제 시 혜택 적용 가능',
                },
            },
        });
    });

    it('uses actual adapter keys for disappearance and reappearance decisions', () => {
        const parsed = parseNaverPayPromotions(
            officialNaverPayRows,
            'DOMESTIC_INSTORE',
            promotionOfficialFixtureMetadata.sources.naverpay,
        );
        const twosome = parsed.find(item => item.offer.title.startsWith('투썸플레이스'))!;
        const electroland = parsed.find(item => item.offer.title.startsWith('전자랜드'))!;
        const latestWithoutElectroland = new Set([
            `naverpay:${twosome.sourceKey}`,
        ]);
        const pendingElectroland = {
            status: 'PENDING' as const,
            providerId: 'naverpay',
            diff: { sourceKey: electroland.sourceKey },
        };

        expect(shouldRejectPendingCandidateMissingFromSource(
            pendingElectroland,
            latestWithoutElectroland,
        )).toBe(true);
        expect(shouldRejectPendingCandidateMissingFromSource(
            pendingElectroland,
            new Set([...latestWithoutElectroland, `naverpay:${electroland.sourceKey}`]),
        )).toBe(false);
        expect(removalCandidateMatchesObservedPromotion({
            status: 'PENDING',
            providerId: 'naverpay',
            linkedPromotionId: 'expired-electroland',
            diff: {
                removedFromSource: true,
                sourceKey: electroland.sourceKey,
                collectionSourceId: 'naverpay-benefits',
            },
        }, {
            providerId: 'naverpay',
            promotionId: 'new-electroland-id',
            sourceKey: electroland.sourceKey,
            collectionSourceId: 'naverpay-benefits',
        })).toBe(true);
    });
});
