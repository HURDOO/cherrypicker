'use client';

import { useMemo } from 'react';
import type { BrandDesignProps } from './types';
import { rankBrands, searchAndRankBrands } from '@/utils/brandDiscovery';

export function useConceptDiscovery(
    props: BrandDesignProps,
    searchQuery: string,
    categoryId?: string
) {
    const { brands, categories, history } = props;
    const rankedBrands = useMemo(
        () => rankBrands(brands, history, []),
        [brands, history]
    );
    const searchResults = useMemo(
        () => searchAndRankBrands(rankedBrands, searchQuery),
        [rankedBrands, searchQuery]
    );
    const categoryBrands = useMemo(
        () => categoryId
            ? rankedBrands.filter(item => item.brand.categoryId === categoryId)
            : rankedBrands,
        [categoryId, rankedBrands]
    );
    const brandCounts = useMemo(() => {
        const counts = new Map<string, number>();
        brands.forEach(brand => {
            counts.set(brand.categoryId, (counts.get(brand.categoryId) || 0) + 1);
        });
        return counts;
    }, [brands]);
    const populatedCategories = useMemo(
        () => categories.filter(category => (brandCounts.get(category.id) || 0) > 0),
        [brandCounts, categories]
    );
    const recentBrands = useMemo(
        () => [...rankedBrands]
            .filter(item => item.meta.lastUsedAt)
            .sort((left, right) => right.meta.lastUsedAt!.localeCompare(left.meta.lastUsedAt!)),
        [rankedBrands]
    );

    return {
        rankedBrands,
        searchResults,
        categoryBrands,
        populatedCategories,
        brandCounts,
        recentBrands,
        isSearching: searchQuery.trim().length > 0,
    };
}
