import { describe, expect, it } from 'vitest';
import type {
    BenefitCatalogSnapshot,
    RecommendationResponse,
    TransactionHistory,
} from '@/types';
import {
    createAccountWorkspaceExport,
    parseAccountWorkspaceExport,
    serializeAccountWorkspace,
} from './account-workspace-export';
import { buildBenefitCatalogSnapshot } from './benefit-catalog';
import { parseBenefitCatalogSnapshot } from './benefit-catalog-contract';
import {
    RECOMMENDATION_REGRESSION_BENEFIT_MONTH,
    RECOMMENDATION_REGRESSION_GENERATED_AT,
    RECOMMENDATION_REGRESSION_GOAL_MONTH,
    RECOMMENDATION_REGRESSION_NOW,
    RECOMMENDATION_REGRESSION_PERFORMANCE_MONTH,
    recommendationRegressionBrands,
    recommendationRegressionCards,
    recommendationRegressionCategories,
    recommendationRegressionProfile,
    recommendationRegressionPromotions,
    recommendationRegressionProviders,
    recommendationRegressionRouteVerifications,
    recommendationRegressionRules,
    recommendationRegressionScenarios,
    type RecommendationRegressionScenario,
} from '@/test/fixtures/recommendation-regression';
import { selectAvailableCards } from '@/utils/availableCards';
import { calculateBestCombinations } from '@/utils/combination';
import { derivePerformanceGoals } from '@/utils/performanceGoals';
import { buildPromotionUsage } from '@/utils/promotionUsage';

const canonicalCatalog = buildBenefitCatalogSnapshot({
    categories: recommendationRegressionCategories,
    brands: recommendationRegressionBrands,
    cards: recommendationRegressionCards,
    rules: recommendationRegressionRules,
    providers: recommendationRegressionProviders,
    subscriptionProducts: [],
    promotions: recommendationRegressionPromotions,
    routeVerifications: recommendationRegressionRouteVerifications,
    cardBenefitSupports: recommendationRegressionCards.map(card => ({
        cardId: card.id,
        reviewStatus: 'NOT_REVIEWED' as const,
        supportScope: 'PARTIAL' as const,
        sources: [],
        caveats: ['대표 추천 회귀 fixture'],
    })),
}, RECOMMENDATION_REGRESSION_GENERATED_AT);

const createScenarioWorkspace = (
    scenario: RecommendationRegressionScenario,
    history: TransactionHistory[] = scenario.history,
) => createAccountWorkspaceExport({
    sourceWorkspaceId: `fixture-${scenario.id}`,
    exportedAt: RECOMMENDATION_REGRESSION_GENERATED_AT,
    categories: [],
    brands: [],
    cards: [],
    rules: [],
    performances: scenario.performances,
    history,
    benefitProfile: recommendationRegressionProfile,
});

const calculateScenario = (
    catalog: BenefitCatalogSnapshot,
    scenario: RecommendationRegressionScenario,
    workspace = createScenarioWorkspace(scenario),
): RecommendationResponse => {
    const brand = catalog.brands.find(item => item.id === scenario.request.brandId);
    if (!brand) throw new Error(`fixture 브랜드가 없습니다: ${scenario.request.brandId}`);
    const cards = selectAvailableCards({
        cards: catalog.cards,
        performances: workspace.performances,
        history: workspace.history,
    });
    const performanceGoals = derivePerformanceGoals({
        cards,
        rules: catalog.rules,
        performances: workspace.performances,
        performanceMonth: RECOMMENDATION_REGRESSION_GOAL_MONTH,
        target: { kind: 'BRAND', brand },
        amount: scenario.request.amount,
        isOnline: scenario.request.isOnline,
    });

    return calculateBestCombinations({
        ...scenario.request,
        target: { kind: 'BRAND', brand },
        priority: performanceGoals.length > 0 ? scenario.request.priority : 'BENEFIT',
        cards,
        rules: catalog.rules,
        history: workspace.history,
        performances: workspace.performances.filter(item => (
            item.performanceMonth === RECOMMENDATION_REGRESSION_PERFORMANCE_MONTH
        )),
        performanceGoals,
        performanceBenefitMonth: RECOMMENDATION_REGRESSION_BENEFIT_MONTH,
        promotions: catalog.promotions,
        providers: catalog.providers,
        profile: workspace.benefitProfile,
        routeVerifications: catalog.routeVerifications,
        promotionUsage: buildPromotionUsage(workspace.history, RECOMMENDATION_REGRESSION_NOW),
        now: RECOMMENDATION_REGRESSION_NOW,
    });
};

const summarizeRecommendation = (result: RecommendationResponse) => ({
    brandId: result.brandId,
    amount: result.amount,
    combinations: result.combinations.slice(0, 5).map(combination => ({
        id: combination.id,
        fundingType: combination.fundingType,
        ...(combination.payProviderId && { payProviderId: combination.payProviderId }),
        ...(combination.cardId && { cardId: combination.cardId }),
        confirmedValue: combination.confirmedValue,
        conditionalValue: combination.conditionalValue,
        estimatedValue: combination.estimatedValue,
        immediateDiscount: combination.immediateDiscount,
        laterReward: combination.laterReward,
        payableAmount: combination.payableAmount,
        ...(combination.performanceProgress && {
            performanceProgress: combination.performanceProgress,
        }),
        steps: combination.steps.map(step => ({
            layer: step.layer,
            ...(step.promotionId && { promotionId: step.promotionId }),
            ...(step.ruleId && { ruleId: step.ruleId }),
            benefitAmount: step.benefitAmount,
            certainty: step.certainty,
        })),
        warnings: combination.warnings,
        requiredChecks: combination.requiredChecks,
    })),
    itemSpecificOffers: result.itemSpecificOffers,
    informationalOffers: result.informationalOffers,
});

describe('recommendation regression contract', () => {
    it.each(recommendationRegressionScenarios)(
        'keeps the $id representative recommendation stable',
        scenario => {
            expect(summarizeRecommendation(calculateScenario(canonicalCatalog, scenario)))
                .toMatchSnapshot(scenario.id);
        },
    );

    it('keeps browser JSON transport and server canonical calculation in parity', () => {
        const browserCatalog = parseBenefitCatalogSnapshot(
            JSON.parse(JSON.stringify(canonicalCatalog)),
        );

        recommendationRegressionScenarios.forEach(scenario => {
            const serverWorkspace = createScenarioWorkspace(scenario);
            const browserWorkspace = parseAccountWorkspaceExport(
                JSON.parse(serializeAccountWorkspace(serverWorkspace)),
            );

            expect(calculateScenario(browserCatalog, scenario, browserWorkspace))
                .toEqual(calculateScenario(canonicalCatalog, scenario, serverWorkspace));
        });
    });

    it('round-trips a selected promotion and card combination in payment history', () => {
        const scenario = recommendationRegressionScenarios[0];
        const recommendation = calculateScenario(canonicalCatalog, scenario);
        const selected = recommendation.combinations[0];
        const cardSteps = selected.steps.filter(step => step.cardId);
        const history: TransactionHistory[] = [{
            id: 'fixture-transaction-1',
            date: RECOMMENDATION_REGRESSION_NOW.toISOString(),
            brandId: scenario.request.brandId,
            ...(selected.cardId && { cardId: selected.cardId }),
            ...(cardSteps[0]?.ruleId && { ruleId: cardSteps[0].ruleId }),
            amount: scenario.request.amount,
            discountAmount: cardSteps.reduce((sum, step) => sum + step.benefitAmount, 0),
            ...(selected.payProviderId && { payProviderId: selected.payProviderId }),
            fundingType: selected.fundingType,
            combinationId: selected.id,
            confirmedValue: selected.confirmedValue,
            conditionalValue: selected.conditionalValue,
            estimatedValue: selected.estimatedValue,
            payableAmount: selected.payableAmount,
            laterReward: selected.laterReward,
            combinationSnapshot: {
                ...selected,
                catalogVersion: canonicalCatalog.catalogVersion,
            },
        }];
        const workspace = createScenarioWorkspace(scenario, history);
        const serialized = serializeAccountWorkspace(workspace);
        const restored = parseAccountWorkspaceExport(JSON.parse(serialized));

        expect(restored).toEqual(workspace);
        expect(restored.history[0].combinationSnapshot).toEqual({
            ...selected,
            catalogVersion: canonicalCatalog.catalogVersion,
        });
        expect(restored.history[0]).toMatchObject({
            cardId: selected.cardId,
            payProviderId: 'naverpay',
            combinationId: selected.id,
            fundingType: 'CARD',
        });
        expect(serializeAccountWorkspace(restored)).toBe(serialized);
    });
});
