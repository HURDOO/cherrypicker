'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, Clock3, Search, X } from 'lucide-react';
import clsx from 'clsx';
import type { Brand } from '@/types';
import { getBrandMonogram, getBrandTone } from './brandVisuals';
import type { BrandDesignProps } from './types';

const ALL_CATEGORIES = 'all';

interface RecentBrand {
    brand: Brand;
    usedAt: string;
}

interface BrandRowProps {
    brand: Brand;
    categoryName: string;
    detail?: string;
    isSelected: boolean;
    onSelect: (brand: Brand) => void;
}

const recentDateFormatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
});

function formatRecentDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '최근 이용';
    return `${recentDateFormatter.format(date)} 이용`;
}

function BrandRow({
    brand,
    categoryName,
    detail,
    isSelected,
    onSelect,
}: BrandRowProps) {
    const tone = getBrandTone(brand);

    return (
        <button
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(brand)}
            className={clsx(
                'flex h-[84px] w-full items-center gap-3 rounded-[1.35rem] border px-3 py-2 text-left transition-all active:scale-[0.99]',
                isSelected
                    ? 'border-blue-300 bg-blue-50/80 shadow-sm ring-2 ring-blue-100'
                    : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/70'
            )}
        >
            <span
                className={clsx(
                    'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-[15px] font-black tracking-tight transition-colors',
                    isSelected ? tone.strong : tone.soft
                )}
            >
                {getBrandMonogram(brand.name)}
            </span>

            <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-keep text-base font-black leading-snug text-gray-900">
                    {brand.name}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-medium text-gray-400">
                    <span className="truncate">{categoryName}</span>
                    {detail && (
                        <>
                            <span aria-hidden="true" className="text-gray-300">·</span>
                            <span className="truncate">{detail}</span>
                        </>
                    )}
                </span>
            </span>

            <span
                className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
                    isSelected ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-300'
                )}
            >
                {isSelected
                    ? <Check className="h-4 w-4" strokeWidth={3} />
                    : <ChevronRight className="h-4 w-4" />}
            </span>
        </button>
    );
}

export function SearchListDesign({
    categories,
    brands,
    history,
    selectedBrandId,
    onSelectBrand,
}: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategoryId, setSelectedCategoryId] = useState(ALL_CATEGORIES);

    const categoryNameById = useMemo(
        () => new Map(categories.map(category => [category.id, category.name])),
        [categories]
    );

    const availableCategories = useMemo(() => {
        const categoryIds = new Set(brands.map(brand => brand.categoryId));
        return categories.filter(category => categoryIds.has(category.id));
    }, [brands, categories]);

    const recentBrands = useMemo<RecentBrand[]>(() => {
        const brandById = new Map(brands.map(brand => [brand.id, brand]));
        const seenBrandIds = new Set<string>();
        const sortedHistory = [...history].sort(
            (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
        );
        const result: RecentBrand[] = [];

        for (const transaction of sortedHistory) {
            if (!transaction.brandId) continue;
            if (seenBrandIds.has(transaction.brandId)) continue;

            const brand = brandById.get(transaction.brandId);
            if (!brand) continue;

            seenBrandIds.add(transaction.brandId);
            result.push({ brand, usedAt: transaction.date });
            if (result.length === 3) break;
        }

        return result;
    }, [brands, history]);

    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR');
    const visibleBrands = useMemo(() => brands.filter(brand => {
        const categoryName = categoryNameById.get(brand.categoryId) || '';
        const matchesCategory = selectedCategoryId === ALL_CATEGORIES
            || brand.categoryId === selectedCategoryId;
        const matchesQuery = !normalizedQuery
            || brand.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
            || categoryName.toLocaleLowerCase('ko-KR').includes(normalizedQuery);

        return matchesCategory && matchesQuery;
    }), [brands, categoryNameById, normalizedQuery, selectedCategoryId]);

    const showRecent = !normalizedQuery && selectedCategoryId === ALL_CATEGORIES && recentBrands.length > 0;

    return (
        <section className="min-h-[680px] bg-gray-50 px-4 pb-8 pt-5 text-gray-900">
            <div className="px-1">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-600">
                    Search first
                </p>
                <h2 className="mt-2 break-keep text-2xl font-black tracking-tight text-gray-950">
                    어디에서 결제하시나요?
                </h2>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-gray-500">
                    브랜드 이름을 검색하거나 최근 이용 내역에서 골라보세요.
                </p>
            </div>

            <div className="relative mt-5">
                <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="브랜드 또는 카테고리 검색"
                    aria-label="브랜드 또는 카테고리 검색"
                    className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-12 text-base font-bold text-gray-900 shadow-sm outline-none transition placeholder:font-medium placeholder:text-gray-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
                {searchQuery && (
                    <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="검색어 지우기"
                        className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {showRecent && (
                <div className="mt-7">
                    <div className="mb-3 flex items-center gap-2 px-1">
                        <Clock3 className="h-4 w-4 text-blue-500" />
                        <h3 className="text-sm font-black text-gray-900">최근 이용</h3>
                        <span className="text-xs font-bold text-gray-400">빠른 선택</span>
                    </div>
                    <div className="space-y-2">
                        {recentBrands.map(({ brand, usedAt }) => (
                            <BrandRow
                                key={brand.id}
                                brand={brand}
                                categoryName={categoryNameById.get(brand.categoryId) || '기타'}
                                detail={formatRecentDate(usedAt)}
                                isSelected={selectedBrandId === brand.id}
                                onSelect={onSelectBrand}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8">
                <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                        <p className="text-xs font-bold text-gray-400">둘러보기</p>
                        <h3 className="mt-0.5 text-lg font-black text-gray-900">
                            {normalizedQuery ? '검색 결과' : '전체 브랜드'}
                        </h3>
                    </div>
                    <span className="text-xs font-black tabular-nums text-gray-400">
                        {visibleBrands.length}개
                    </span>
                </div>

                <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-2">
                    <div className="flex w-max gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedCategoryId(ALL_CATEGORIES)}
                            aria-pressed={selectedCategoryId === ALL_CATEGORIES}
                            className={clsx(
                                'h-10 rounded-full border px-4 text-sm font-bold transition-colors',
                                selectedCategoryId === ALL_CATEGORIES
                                    ? 'border-gray-900 bg-gray-900 text-white'
                                    : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                            )}
                        >
                            전체
                        </button>
                        {availableCategories.map(category => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setSelectedCategoryId(category.id)}
                                aria-pressed={selectedCategoryId === category.id}
                                className={clsx(
                                    'h-10 rounded-full border px-4 text-sm font-bold transition-colors',
                                    selectedCategoryId === category.id
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                                )}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                </div>

                {visibleBrands.length > 0 ? (
                    <div className="mt-2 space-y-2">
                        {visibleBrands.map(brand => (
                            <BrandRow
                                key={brand.id}
                                brand={brand}
                                categoryName={categoryNameById.get(brand.categoryId) || '기타'}
                                isSelected={selectedBrandId === brand.id}
                                onSelect={onSelectBrand}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="mt-4 rounded-[1.35rem] border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
                        <Search className="mx-auto h-7 w-7 text-gray-300" />
                        <p className="mt-3 text-sm font-black text-gray-700">검색 결과가 없어요</p>
                        <p className="mt-1 text-xs font-medium text-gray-400">
                            다른 브랜드 이름이나 카테고리로 검색해보세요.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

export default SearchListDesign;
