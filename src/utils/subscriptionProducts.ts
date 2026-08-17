import type { SubscriptionProduct } from '@/types';

export type SubscriptionProductCatalogItem = Pick<
    SubscriptionProduct,
    'providerId' | 'name' | 'aliases' | 'benefitSummary'
>;

export const T_UNIVERSE_PROVIDER_ID = 't-universe';

export const normalizeSubscriptionProductName = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s·&＋+/_-]+/g, '');

export const getSubscriptionProducts = (
    products: SubscriptionProductCatalogItem[],
    providerId: string,
) => products.filter(product => product.providerId === providerId);

export const findSubscriptionProduct = (
    products: SubscriptionProductCatalogItem[],
    providerId: string,
    productName: string,
) => {
    const normalized = normalizeSubscriptionProductName(productName);
    return getSubscriptionProducts(products, providerId).find(product => (
        [product.name, ...product.aliases].some(name => (
            normalizeSubscriptionProductName(name) === normalized
        ))
    ));
};

export const canonicalizeSubscriptionProductName = (
    products: SubscriptionProductCatalogItem[],
    providerId: string,
    productName: string,
) => findSubscriptionProduct(products, providerId, productName)?.name ?? productName.trim();
