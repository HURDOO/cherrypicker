import { createHash } from 'node:crypto';
import type {
    BenefitCatalogSnapshot,
    BenefitCatalogFreshness,
    BenefitRule,
    Brand,
    Card,
    CatalogBenefitRule,
    CatalogBrand,
    CatalogCard,
    CatalogCategory,
    CatalogPromotionOffer,
    CatalogPromotionProvider,
    CatalogSubscriptionProduct,
    Category,
    MerchantRouteVerification,
    PromotionOffer,
    PromotionProvider,
    SubscriptionProduct,
} from '@/types';
import { assertBenefitCatalogReferences } from './benefit-catalog-contract';

export const BENEFIT_CATALOG_SCHEMA_VERSION = 1 as const;

export interface BenefitCatalogSource {
    categories: Category[];
    brands: Brand[];
    cards: Card[];
    rules: BenefitRule[];
    providers: PromotionProvider[];
    subscriptionProducts: SubscriptionProduct[];
    promotions: PromotionOffer[];
    routeVerifications: MerchantRouteVerification[];
    freshness?: BenefitCatalogFreshness;
}

const compareText = (left: string, right: string) => {
    if (left === right) return 0;
    return left < right ? -1 : 1;
};

const clone = <T>(value: T): T => structuredClone(value);

const toCatalogCategory = (category: Category): CatalogCategory => ({
    id: category.id,
    name: category.name,
    ...(category.order !== undefined && { order: category.order }),
});

const toCatalogBrand = (brand: Brand): CatalogBrand => ({
    id: brand.id,
    name: brand.name,
    categoryId: brand.categoryId,
    ...(brand.iconName && { iconName: brand.iconName }),
    ...(brand.order !== undefined && { order: brand.order }),
});

const toCatalogCard = (card: Card): CatalogCard => ({
    id: card.id,
    name: card.name,
    company: card.company,
    color: card.color,
    limitTable: clone(card.limitTable),
});

const toCatalogRule = (rule: BenefitRule): CatalogBenefitRule => ({
    id: rule.id,
    cardId: rule.cardId,
    ...(rule.category && { category: rule.category }),
    includedBrands: [...(rule.includedBrands ?? [])],
    excludedBrands: [...(rule.excludedBrands ?? [])],
    ...(rule.platformType && { platformType: rule.platformType }),
    ...(rule.sharedGroupId && { sharedGroupId: rule.sharedGroupId }),
    ...(rule.usesCardLimit !== undefined && { usesCardLimit: rule.usesCardLimit }),
    description: rule.description,
    detail: rule.detail,
    condition: clone(rule.condition),
    action: clone(rule.action),
    limitConfig: clone(rule.limitConfig),
});

const toCatalogProvider = (
    provider: PromotionProvider
): CatalogPromotionProvider => ({
    id: provider.id,
    name: provider.name,
    kind: provider.kind,
    ...(provider.sourceUrl && { sourceUrl: provider.sourceUrl }),
    isActive: true,
    sortOrder: provider.sortOrder,
});

const toCatalogSubscriptionProduct = (
    product: SubscriptionProduct
): CatalogSubscriptionProduct => ({
    id: product.id,
    providerId: product.providerId,
    name: product.name,
    aliases: [...product.aliases],
    benefitSummary: product.benefitSummary,
    sourceUrl: product.sourceUrl,
    isActive: true,
});

const toCatalogPromotion = (offer: PromotionOffer): CatalogPromotionOffer => ({
    id: offer.id,
    providerId: offer.providerId,
    layer: offer.layer,
    title: offer.title,
    description: offer.description,
    brandIds: [...offer.brandIds],
    categoryIds: [...offer.categoryIds],
    channels: [...offer.channels],
    ...(offer.startsAt && { startsAt: offer.startsAt }),
    ...(offer.endsAt && { endsAt: offer.endsAt }),
    action: clone(offer.action),
    condition: clone(offer.condition),
    compatibility: clone(offer.compatibility),
    limitConfig: clone(offer.limitConfig),
    certainty: offer.certainty,
    status: 'PUBLISHED',
    sourceUrl: offer.sourceUrl,
});

const toCatalogRouteVerification = (
    verification: MerchantRouteVerification
): MerchantRouteVerification => ({
    brandId: verification.brandId,
    ...(verification.payProviderId && { payProviderId: verification.payProviderId }),
    ...(verification.cardCompany && { cardCompany: verification.cardCompany }),
    channel: verification.channel,
    cardBenefitEligible: verification.cardBenefitEligible,
    certainty: verification.certainty,
    evidenceUrl: verification.evidenceUrl,
    verifiedAt: verification.verifiedAt,
});

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }

    if (Array.isArray(value)) {
        return `[${value.map(item => stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => compareText(left, right));
    return `{${entries.map(([key, item]) => (
        `${JSON.stringify(key)}:${stableStringify(item)}`
    )).join(',')}}`;
}

function toGeneratedAt(value: Date | string) {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
        throw new Error('공개 카탈로그 생성 시각이 올바르지 않습니다.');
    }
    return date.toISOString();
}

export function buildBenefitCatalogSnapshot(
    source: BenefitCatalogSource,
    generatedAt: Date | string = new Date()
): BenefitCatalogSnapshot {
    const categories = source.categories
        .filter(category => !category.userId)
        .map(toCatalogCategory)
        .sort((left, right) => (
            (left.order ?? 0) - (right.order ?? 0) ||
            compareText(left.name, right.name) ||
            compareText(left.id, right.id)
        ));
    const brands = source.brands
        .filter(brand => !brand.userId)
        .map(toCatalogBrand)
        .sort((left, right) => (
            (left.order ?? 0) - (right.order ?? 0) ||
            compareText(left.name, right.name) ||
            compareText(left.id, right.id)
        ));
    const cards = source.cards
        .filter(card => !card.userId)
        .map(toCatalogCard)
        .sort((left, right) => (
            compareText(left.name, right.name) || compareText(left.id, right.id)
        ));
    const rules = source.rules
        .filter(rule => !rule.userId)
        .map(toCatalogRule)
        .sort((left, right) => (
            compareText(left.cardId, right.cardId) ||
            compareText(left.description, right.description) ||
            compareText(left.id, right.id)
        ));
    const providers = source.providers
        .filter(provider => provider.isActive)
        .map(toCatalogProvider)
        .sort((left, right) => (
            left.sortOrder - right.sortOrder || compareText(left.id, right.id)
        ));
    const providerIds = new Set(providers.map(provider => provider.id));
    const subscriptionProducts = source.subscriptionProducts
        .filter(product => product.isActive && providerIds.has(product.providerId))
        .map(toCatalogSubscriptionProduct)
        .sort((left, right) => (
            compareText(left.name, right.name) || compareText(left.id, right.id)
        ));
    const promotions = source.promotions
        .filter(offer => offer.status === 'PUBLISHED' && providerIds.has(offer.providerId))
        .map(toCatalogPromotion)
        .sort((left, right) => (
            compareText(left.layer, right.layer) ||
            compareText(left.title, right.title) ||
            compareText(left.id, right.id)
        ));
    const routeVerifications = source.routeVerifications
        .filter(verification => (
            (!verification.payProviderId || providerIds.has(verification.payProviderId))
        ))
        .map(toCatalogRouteVerification)
        .sort((left, right) => (
            compareText(left.brandId, right.brandId) ||
            compareText(left.payProviderId ?? '', right.payProviderId ?? '') ||
            compareText(left.cardCompany ?? '', right.cardCompany ?? '') ||
            compareText(left.channel, right.channel) ||
            compareText(left.verifiedAt, right.verifiedAt)
        ));

    const versionedContent = {
        schemaVersion: BENEFIT_CATALOG_SCHEMA_VERSION,
        categories,
        brands,
        cards,
        rules,
        providers,
        subscriptionProducts,
        promotions,
        routeVerifications,
    };
    assertBenefitCatalogReferences(versionedContent);

    const catalogVersion = createHash('sha256')
        .update(stableStringify(versionedContent))
        .digest('hex');

    return {
        schemaVersion: BENEFIT_CATALOG_SCHEMA_VERSION,
        catalogVersion,
        generatedAt: toGeneratedAt(generatedAt),
        ...(source.freshness && { freshness: clone(source.freshness) }),
        categories,
        brands,
        cards,
        rules,
        providers,
        subscriptionProducts,
        promotions,
        routeVerifications,
    };
}
