import type { BenefitCatalogSnapshot } from '@/types';

type BenefitCatalogContent = Omit<
    BenefitCatalogSnapshot,
    'catalogVersion' | 'generatedAt' | 'freshness'
>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

function assertUniqueIds(label: string, rows: Array<{ id: string }>) {
    const ids = new Set<string>();
    rows.forEach(row => {
        if (ids.has(row.id)) {
            throw new Error(`공개 카탈로그의 ${label} ID가 중복되었습니다: ${row.id}`);
        }
        ids.add(row.id);
    });
}

function assertEntityArray(
    value: Record<string, unknown>,
    key: keyof BenefitCatalogContent,
    label: string,
    requiresId: boolean = true
) {
    const rows = value[key];
    if (!Array.isArray(rows)) {
        throw new Error(`공개 카탈로그의 ${label} 목록이 올바르지 않습니다.`);
    }
    rows.forEach(row => {
        if (!isRecord(row) || (requiresId && typeof row.id !== 'string')) {
            throw new Error(`공개 카탈로그의 ${label} 항목이 올바르지 않습니다.`);
        }
    });
}

function assertCardBenefitSupports(snapshot: BenefitCatalogContent) {
    const cardIds = new Set(snapshot.cards.map(card => card.id));
    const supportCardIds = new Set<string>();

    snapshot.cardBenefitSupports.forEach(support => {
        if (
            typeof support.cardId !== 'string' ||
            !['REVIEWED', 'NOT_REVIEWED'].includes(String(support.reviewStatus)) ||
            !['FULL', 'PARTIAL'].includes(String(support.supportScope)) ||
            !Array.isArray(support.sources) ||
            !Array.isArray(support.caveats)
        ) {
            throw new Error('공개 카탈로그의 카드 지원 상태가 올바르지 않습니다.');
        }
        if (!cardIds.has(support.cardId)) {
            throw new Error(
                `공개 카드 지원 상태가 없는 카드 ${support.cardId}를 참조합니다.`
            );
        }
        if (supportCardIds.has(support.cardId)) {
            throw new Error(`공개 카드 지원 상태가 중복되었습니다: ${support.cardId}`);
        }
        supportCardIds.add(support.cardId);

        if (
            support.lastVerifiedAt !== undefined &&
            (typeof support.lastVerifiedAt !== 'string' ||
                Number.isNaN(new Date(support.lastVerifiedAt).getTime()))
        ) {
            throw new Error(`공개 카드 ${support.cardId}의 공식 확인 시각이 올바르지 않습니다.`);
        }
        if (
            support.reviewStatus === 'REVIEWED' &&
            (!support.lastVerifiedAt || support.sources.length === 0)
        ) {
            throw new Error(`공개 카드 ${support.cardId}의 공식 검수 근거가 없습니다.`);
        }
        if (
            (support.reviewStatus === 'NOT_REVIEWED' && support.lastVerifiedAt !== undefined) ||
            (support.supportScope === 'FULL' && support.reviewStatus !== 'REVIEWED')
        ) {
            throw new Error(`공개 카드 ${support.cardId}의 검수 상태와 지원 범위가 일치하지 않습니다.`);
        }
        support.sources.forEach(source => {
            if (!isRecord(source) || typeof source.label !== 'string' ||
                typeof source.url !== 'string') {
                throw new Error(`공개 카드 ${support.cardId}의 공식 출처가 올바르지 않습니다.`);
            }
            try {
                if (new URL(source.url).protocol !== 'https:') throw new Error();
            } catch {
                throw new Error(`공개 카드 ${support.cardId}의 공식 출처 URL이 올바르지 않습니다.`);
            }
        });
        if (support.caveats.some(caveat => typeof caveat !== 'string')) {
            throw new Error(`공개 카드 ${support.cardId}의 지원 범위 안내가 올바르지 않습니다.`);
        }
    });

    snapshot.cards.forEach(card => {
        if (!supportCardIds.has(card.id)) {
            throw new Error(`공개 카드 ${card.id}의 지원 상태가 없습니다.`);
        }
    });
}

export function assertBenefitCatalogReferences(snapshot: BenefitCatalogContent) {
    assertUniqueIds('카테고리', snapshot.categories);
    assertUniqueIds('브랜드', snapshot.brands);
    assertUniqueIds('카드', snapshot.cards);
    assertUniqueIds('카드 혜택', snapshot.rules);
    assertUniqueIds('혜택 제공자', snapshot.providers);
    assertUniqueIds('구독 상품', snapshot.subscriptionProducts);
    assertUniqueIds('프로모션', snapshot.promotions);

    const categoryIds = new Set(snapshot.categories.map(category => category.id));
    const brandIds = new Set(snapshot.brands.map(brand => brand.id));
    const cardIds = new Set(snapshot.cards.map(card => card.id));
    const providerIds = new Set(snapshot.providers.map(provider => provider.id));

    snapshot.brands.forEach(brand => {
        if (!categoryIds.has(brand.categoryId)) {
            throw new Error(
                `공개 브랜드 ${brand.id}가 없는 카테고리 ${brand.categoryId}를 참조합니다.`
            );
        }
    });

    snapshot.rules.forEach(rule => {
        if (!cardIds.has(rule.cardId)) {
            throw new Error(`공개 카드 혜택 ${rule.id}가 없는 카드 ${rule.cardId}를 참조합니다.`);
        }
        if (rule.category && !categoryIds.has(rule.category)) {
            throw new Error(
                `공개 카드 혜택 ${rule.id}가 없는 카테고리 ${rule.category}를 참조합니다.`
            );
        }
        [...(rule.includedBrands ?? []), ...(rule.excludedBrands ?? [])].forEach(brandId => {
            if (!brandIds.has(brandId)) {
                throw new Error(
                    `공개 카드 혜택 ${rule.id}가 없는 브랜드 ${brandId}를 참조합니다.`
                );
            }
        });
    });

    snapshot.subscriptionProducts.forEach(product => {
        if (!providerIds.has(product.providerId)) {
            throw new Error(
                `공개 구독 상품 ${product.id}가 없는 제공자 ${product.providerId}를 참조합니다.`
            );
        }
    });

    snapshot.promotions.forEach(offer => {
        if (!providerIds.has(offer.providerId)) {
            throw new Error(
                `공개 프로모션 ${offer.id}가 없는 제공자 ${offer.providerId}를 참조합니다.`
            );
        }
        if (!Array.isArray(offer.brandIds) || !Array.isArray(offer.categoryIds)) {
            throw new Error(`공개 프로모션 ${offer.id}의 적용 대상이 올바르지 않습니다.`);
        }
        offer.brandIds.forEach(brandId => {
            if (!brandIds.has(brandId)) {
                throw new Error(
                    `공개 프로모션 ${offer.id}가 없는 브랜드 ${brandId}를 참조합니다.`
                );
            }
        });
        offer.categoryIds.forEach(categoryId => {
            if (!categoryIds.has(categoryId)) {
                throw new Error(
                    `공개 프로모션 ${offer.id}가 없는 카테고리 ${categoryId}를 참조합니다.`
                );
            }
        });
        (offer.compatibility.requiredPayProviderIds ?? []).forEach(providerId => {
            if (!providerIds.has(providerId)) {
                throw new Error(
                    `공개 프로모션 ${offer.id}가 없는 결제 제공자 ${providerId}를 참조합니다.`
                );
            }
        });
    });

    snapshot.routeVerifications.forEach(verification => {
        if (!brandIds.has(verification.brandId)) {
            throw new Error(
                `공개 승인 경로가 없는 브랜드 ${verification.brandId}를 참조합니다.`
            );
        }
        if (verification.payProviderId && !providerIds.has(verification.payProviderId)) {
            throw new Error(
                `공개 승인 경로가 없는 제공자 ${verification.payProviderId}를 참조합니다.`
            );
        }
    });

    assertCardBenefitSupports(snapshot);
}

export function parseBenefitCatalogSnapshot(value: unknown): BenefitCatalogSnapshot {
    if (!isRecord(value)) {
        throw new Error('공개 카탈로그 응답이 객체가 아닙니다.');
    }
    if (value.schemaVersion !== 2) {
        throw new Error('지원하지 않는 공개 카탈로그 schema 버전입니다.');
    }
    if (
        typeof value.catalogVersion !== 'string' ||
        !/^[a-f0-9]{64}$/.test(value.catalogVersion)
    ) {
        throw new Error('공개 카탈로그 content 버전이 올바르지 않습니다.');
    }
    if (
        typeof value.generatedAt !== 'string' ||
        Number.isNaN(new Date(value.generatedAt).getTime())
    ) {
        throw new Error('공개 카탈로그 생성 시각이 올바르지 않습니다.');
    }
    if (value.freshness !== undefined) {
        if (!isRecord(value.freshness)) {
            throw new Error('공개 카탈로그 freshness가 올바르지 않습니다.');
        }
        const freshness = value.freshness;
        if (
            !['SUCCEEDED', 'PARTIAL', 'FAILED', 'UNKNOWN'].includes(
                String(freshness.collectionStatus)
            ) ||
            !Number.isInteger(freshness.sourceCount) ||
            Number(freshness.sourceCount) < 0 ||
            !Number.isInteger(freshness.failedSourceCount) ||
            Number(freshness.failedSourceCount) < 0 ||
            Number(freshness.failedSourceCount) > Number(freshness.sourceCount)
        ) {
            throw new Error('공개 카탈로그 freshness 값이 올바르지 않습니다.');
        }
        ['lastAttemptAt', 'lastSuccessfulAt', 'lastPublishedAt'].forEach(key => {
            const timestamp = freshness[key];
            if (
                timestamp !== undefined &&
                (typeof timestamp !== 'string' || Number.isNaN(new Date(timestamp).getTime()))
            ) {
                throw new Error(`공개 카탈로그 freshness ${key} 시각이 올바르지 않습니다.`);
            }
        });
    }

    assertEntityArray(value, 'categories', '카테고리');
    assertEntityArray(value, 'brands', '브랜드');
    assertEntityArray(value, 'cards', '카드');
    assertEntityArray(value, 'rules', '카드 혜택');
    assertEntityArray(value, 'providers', '혜택 제공자');
    assertEntityArray(value, 'subscriptionProducts', '구독 상품');
    assertEntityArray(value, 'promotions', '프로모션');
    assertEntityArray(value, 'routeVerifications', '승인 경로', false);
    assertEntityArray(value, 'cardBenefitSupports', '카드 지원 상태', false);

    const snapshot = value as unknown as BenefitCatalogSnapshot;
    assertBenefitCatalogReferences(snapshot);
    return snapshot;
}
