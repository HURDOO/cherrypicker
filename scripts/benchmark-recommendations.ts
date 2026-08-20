import type {
    BenefitCatalogSnapshot,
    PromotionOffer,
    UserBenefitProfile,
} from '../src/types';
import { parseBenefitCatalogSnapshot } from '../src/lib/benefit-catalog-contract';
import {
    calculateBestCombinations,
    type CombinationEngineMetrics,
} from '../src/utils/combination';

const catalogUrl = process.env.CATALOG_URL ?? 'http://localhost:3000/api/catalog';
const requestedRuns = Number(process.env.BENCHMARK_RUNS ?? 100);
const runCount = Number.isFinite(requestedRuns)
    ? Math.min(10_000, Math.max(1, Math.floor(requestedRuns)))
    : 100;

async function main() {
    const response = await fetch(catalogUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`카탈로그 요청에 실패했습니다. (${response.status})`);
    }
    const catalog = parseBenefitCatalogSnapshot(await response.json());

    const matchesBrand = (
        offer: PromotionOffer,
        brand: BenefitCatalogSnapshot['brands'][number],
    ) => offer.brandIds.includes(brand.id) ||
        offer.categoryIds.includes(brand.categoryId) ||
        (offer.brandIds.length === 0 && offer.categoryIds.length === 0);

    const matchesChannel = (offer: PromotionOffer, isOnline: boolean) =>
        offer.channels.includes('ALL') || (isOnline
            ? offer.channels.includes('ONLINE') || offer.channels.includes('OFFICIAL_SITE')
            : offer.channels.includes('OFFLINE'));

    const benchmarkTarget = catalog.brands.flatMap(brand => [false, true].map(isOnline => ({
        brand,
        isOnline,
        offerCount: catalog.promotions.filter(offer =>
            matchesBrand(offer, brand) && matchesChannel(offer, isOnline)
        ).length,
    }))).sort((a, b) => b.offerCount - a.offerCount)[0];

    if (!benchmarkTarget) throw new Error('벤치마크할 브랜드가 없습니다.');

    const subscriptions = catalog.providers
        .filter(provider => provider.kind === 'SUBSCRIPTION')
        .flatMap(provider => {
            const productNames = new Set(catalog.promotions
                .filter(offer => offer.providerId === provider.id)
                .flatMap(offer => offer.condition.requiredSubscriptionProducts ?? []));
            if (productNames.size === 0) productNames.add(provider.name);
            return [...productNames].map(productName => ({
                providerId: provider.id,
                productName,
            }));
        });
    const profile: UserBenefitProfile = {
        telecomMemberships: catalog.providers
            .filter(provider => provider.kind === 'TELECOM')
            .map(provider => ({ providerId: provider.id, tier: 'VIP' })),
        subscriptions,
        enabledPayProviderIds: catalog.providers
            .filter(provider => provider.kind === 'PAY' || provider.kind === 'GOODDEAL')
            .map(provider => provider.id),
        moneyEnabled: true,
        pointsEnabled: true,
        pointValue: 1,
        smallBenefitThreshold: 100,
    };

    const durations: number[] = [];
    let latestMetrics: CombinationEngineMetrics | undefined;
    let combinationCount = 0;
    const calculate = () => {
        const result = calculateBestCombinations({
            brandId: benchmarkTarget.brand.id,
            brand: benchmarkTarget.brand,
            amount: 100_000,
            eligibleItemAmount: 50_000,
            isOnline: benchmarkTarget.isOnline,
            cards: catalog.cards,
            rules: catalog.rules,
            history: [],
            performances: [],
            promotions: catalog.promotions,
            providers: catalog.providers,
            profile,
            routeVerifications: catalog.routeVerifications,
            promotionUsage: {},
        }, {
            onMetrics: metrics => {
                latestMetrics = metrics;
            },
        });
        combinationCount = result.combinations.length;
    };

    for (let index = 0; index < Math.min(5, runCount); index += 1) calculate();
    for (let index = 0; index < runCount; index += 1) {
        const startedAt = performance.now();
        calculate();
        durations.push(performance.now() - startedAt);
    }

    durations.sort((a, b) => a - b);
    const percentile = (value: number) => durations[
        Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)
    ];
    const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;

    console.log(JSON.stringify({
        catalogVersion: catalog.catalogVersion,
        target: {
            brandId: benchmarkTarget.brand.id,
            brandName: benchmarkTarget.brand.name,
            channel: benchmarkTarget.isOnline ? 'ONLINE' : 'OFFLINE',
            matchingOfferCount: benchmarkTarget.offerCount,
            cardCount: catalog.cards.length,
            ruleCount: catalog.rules.length,
        },
        runs: runCount,
        timingMs: {
            average: Number(average.toFixed(3)),
            p50: Number(percentile(0.5).toFixed(3)),
            p95: Number(percentile(0.95).toFixed(3)),
            max: Number(durations.at(-1)?.toFixed(3)),
        },
        combinationCount,
        engineMetrics: latestMetrics,
    }, null, 2));
}

void main();
