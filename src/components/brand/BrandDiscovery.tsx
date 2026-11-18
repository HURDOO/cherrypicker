'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CreditCard, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from '@/components/design-lab/BrandLogo';
import { HIDE_BOTTOM_NAV_ATTRIBUTE, useIsBottomNavVisible } from '@/components/layout/BottomNav';
import type { Brand, Category, TransactionHistory } from '@/types';
import type { BenefitBrandSuggestion } from '@/utils/benefitBrandSuggestions';
import {
    searchPurchaseScenarios,
    type PurchaseScenario,
} from '@/utils/purchaseScenario';
import {
    comparePersonalPopularity,
    isBrowsableBrand,
    orderPersonalBrands,
    rankBrands,
    searchAndRankBrands,
    type BrandDiscoveryViewMode,
    type RankedBrand,
} from '@/utils/brandDiscovery';

interface BrandDiscoveryProps {
    categories: Category[];
    brands: Brand[];
    history: TransactionHistory[];
    favoriteBrandIds: string[];
    defaultViewMode: BrandDiscoveryViewMode;
    nearbyBrandIds: string[];
    hasCurrentLocation: boolean;
    isLocating: boolean;
    benefitSuggestions?: BenefitBrandSuggestion[];
    /** Brands with a discount for this user now, best first. Orders the home list. */
    benefitBrandIds?: string[];
    benefitOpportunityCount?: number;
    purchaseScenarios?: PurchaseScenario[];
    onSelectBrand: (brand: Brand) => void;
    onSelectPurchaseScenario?: (scenario: PurchaseScenario) => void;
    onSelectGeneralPayment: (label?: string) => void;
    onSelectBenefitSuggestion?: (suggestion: BenefitBrandSuggestion) => void;
    onToggleFavorite: (brandId: string) => void;
    onRequestLocation: () => Promise<boolean>;
}

const POPULAR_SCOPE = 'popular';
const ALL_SCOPE = 'all';
const INITIAL_VISIBLE_COUNT = 15;
const MORE_VISIBLE_COUNT = 24;
// Height of the home page's sticky header plus a small gap.
const STICKY_HEADER_OFFSET = 64;

function MainBrandCard({
    item,
    eager,
    onSelect,
}: {
    item: RankedBrand;
    eager: boolean;
    onSelect: (brand: Brand) => void;
}) {
    return (
        <button
            type="button"
            title={item.brand.name}
            onClick={() => onSelect(item.brand)}
            className="group flex min-w-0 flex-col items-center rounded-2xl px-0.5 py-1 text-center transition active:scale-[0.96] active:bg-slate-100"
        >
            <BrandLogo
                brand={item.brand}
                loading={eager ? 'eager' : 'lazy'}
                className="h-[72px] w-[72px] rounded-[18px] bg-white shadow-sm shadow-slate-300/70 transition after:absolute after:inset-0 after:rounded-[inherit] after:ring-1 after:ring-inset after:ring-slate-900/10 group-hover:after:ring-blue-300"
                imageClassName="p-0.5"
            />
            <span className="mt-1.5 line-clamp-2 w-full break-keep text-[14px] font-bold leading-[1.25] tracking-[-0.02em] text-slate-800 [overflow-wrap:anywhere]">
                {item.brand.name}
            </span>
        </button>
    );
}

export function BrandDiscovery(props: BrandDiscoveryProps) {
    const {
        categories,
        brands,
        history,
        favoriteBrandIds,
        benefitSuggestions = [],
        benefitBrandIds,
        purchaseScenarios = [],
        onSelectBrand,
        onSelectPurchaseScenario,
        onSelectGeneralPayment,
        onSelectBenefitSuggestion,
    } = props;
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedScope, setSelectedScope] = useState(POPULAR_SCOPE);
    const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_COUNT);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const sectionRef = useRef<HTMLElement>(null);
    const isBottomNavVisible = useIsBottomNavVisible();

    const rankedBrands = useMemo(
        () => rankBrands(brands, history, favoriteBrandIds),
        [brands, favoriteBrandIds, history]
    );
    const rankedById = useMemo(
        () => new Map(rankedBrands.map(item => [item.brand.id, item])),
        [rankedBrands]
    );
    const browsableBrands = useMemo(() => {
        const suggestedBrandIds = new Set(benefitSuggestions.map(item => item.brand.id));
        return rankedBrands.filter(item => isBrowsableBrand(item, suggestedBrandIds));
    }, [benefitSuggestions, rankedBrands]);
    const personalPopularBrands = useMemo(() => {
        if (benefitSuggestions.length === 0) return orderPersonalBrands(browsableBrands, benefitBrandIds);

        const sortedBrands = [...browsableBrands].sort(comparePersonalPopularity);

        const suggestedBrandIds = new Set(benefitSuggestions.map(item => item.brand.id));
        const suggestedBrands = benefitSuggestions
            .map(suggestion => rankedById.get(suggestion.brand.id))
            .filter((item): item is RankedBrand => Boolean(item));

        return [
            ...suggestedBrands,
            ...sortedBrands.filter(item => !suggestedBrandIds.has(item.brand.id)),
        ];
    }, [benefitBrandIds, benefitSuggestions, browsableBrands, rankedById]);
    const nameSortedBrands = useMemo(
        () => [...browsableBrands].sort((left, right) => (
            left.brand.name.localeCompare(right.brand.name, 'ko-KR')
        )),
        [browsableBrands]
    );
    const brandCounts = useMemo(() => {
        const counts = new Map<string, number>();
        browsableBrands.forEach(({ brand }) => {
            counts.set(brand.categoryId, (counts.get(brand.categoryId) || 0) + 1);
        });
        return counts;
    }, [browsableBrands]);
    const populatedCategories = useMemo(
        () => categories.filter(category => (brandCounts.get(category.id) || 0) > 0),
        [brandCounts, categories]
    );
    const searchResults = useMemo(
        () => searchAndRankBrands(rankedBrands, searchQuery),
        [rankedBrands, searchQuery]
    );
    const matchingScenarios = useMemo(
        () => searchPurchaseScenarios(purchaseScenarios, searchQuery),
        [purchaseScenarios, searchQuery]
    );
    const scopedBrands = useMemo(() => {
        if (selectedScope === POPULAR_SCOPE) return personalPopularBrands;
        if (selectedScope === ALL_SCOPE) return nameSortedBrands;
        return personalPopularBrands.filter(item => item.brand.categoryId === selectedScope);
    }, [nameSortedBrands, personalPopularBrands, selectedScope]);
    const isSearching = searchQuery.trim().length > 0;
    const sourceBrands = isSearching ? searchResults : scopedBrands;
    const currentLimit = isSearching ? MORE_VISIBLE_COUNT : visibleLimit;
    const visibleBrands = sourceBrands.slice(0, currentLimit);
    const activeCategory = populatedCategories.find(category => category.id === selectedScope);
    const visibleTitle = isSearching
        ? '검색 결과'
        : selectedScope === POPULAR_SCOPE
            ? '자주 찾는 브랜드'
            : selectedScope === ALL_SCOPE
                ? '전체 브랜드'
                : activeCategory?.name || '카테고리 브랜드';
    const suggestionByBrandId = useMemo(
        () => new Map(benefitSuggestions.map(item => [item.brand.id, item])),
        [benefitSuggestions]
    );

    const changeScope = (scope: string) => {
        setSelectedScope(scope);
        setVisibleLimit(INITIAL_VISIBLE_COUNT);
    };
    const changeSearchQuery = (value: string) => {
        setSearchQuery(value);
        setVisibleLimit(INITIAL_VISIBLE_COUNT);
        // Results render at the top of the list, so bring that into view while typing.
        const section = sectionRef.current;
        if (!section) return;
        const listTop = section.getBoundingClientRect().top + window.scrollY - STICKY_HEADER_OFFSET;
        if (window.scrollY > listTop) window.scrollTo({ top: listTop });
    };
    const selectBrand = (brand: Brand) => {
        const suggestion = suggestionByBrandId.get(brand.id);
        if (suggestion && onSelectBenefitSuggestion) {
            onSelectBenefitSuggestion(suggestion);
            return;
        }
        onSelectBrand(brand);
    };
    const selectGeneralPayment = () => {
        onSelectGeneralPayment(searchQuery.trim() || undefined);
    };

    return (
        <section ref={sectionRef} aria-label="빠른 결제 찾기" className="pb-32">
            {/* Pinned above the bottom nav so search stays in thumb reach while browsing. */}
            <div
                className="fixed inset-x-0 z-40 mx-auto max-w-md border-t border-slate-200 bg-white px-5 pb-3 pt-4 shadow-[0_-8px_20px_rgba(15,23,42,0.08)]"
                style={{
                    bottom: isBottomNavVisible
                        ? 'calc(3.5rem + env(safe-area-inset-bottom))'
                        : 'env(safe-area-inset-bottom)',
                }}
            >
                <label className="relative block">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-600" />
                    <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={event => changeSearchQuery(event.target.value)}
                        placeholder="브랜드·결제 상황 검색"
                        aria-label="브랜드·결제 상황 검색"
                        autoComplete="off"
                        enterKeyHint="search"
                        {...{ [HIDE_BOTTOM_NAV_ATTRIBUTE]: '' }}
                        className="h-11 w-full rounded-full border border-slate-300 bg-slate-50 pl-11 pr-11 text-[14px] font-bold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            aria-label="검색어 지우기"
                            // Keep focus in the input so the nav does not flash back in.
                            onPointerDown={event => event.preventDefault()}
                            onClick={() => {
                                changeSearchQuery('');
                                searchInputRef.current?.focus();
                            }}
                            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </label>
                {(visibleBrands.length > 0 || matchingScenarios.length > 0) && (
                    <button
                        type="button"
                        onClick={selectGeneralPayment}
                        className="mb-0.5 mt-2.5 flex h-8 w-full items-center justify-center gap-1 rounded-lg text-[12px] font-semibold text-slate-500 transition hover:text-blue-600"
                    >
                        브랜드가 없다면 일반 결제
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>

            {!isSearching && (
                <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div role="tablist" aria-label="브랜드 범위" className="flex w-max gap-2">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selectedScope === POPULAR_SCOPE}
                            onClick={() => changeScope(POPULAR_SCOPE)}
                            className={clsx(
                                'h-10 rounded-full border px-4 text-[13px] font-black transition-colors',
                                selectedScope === POPULAR_SCOPE
                                    ? 'border-slate-950 bg-slate-950 text-white'
                                    : 'border-slate-200 bg-white text-slate-500'
                            )}
                        >
                            내 인기순
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selectedScope === ALL_SCOPE}
                            onClick={() => changeScope(ALL_SCOPE)}
                            className={clsx(
                                'h-10 rounded-full border px-4 text-[13px] font-black transition-colors',
                                selectedScope === ALL_SCOPE
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-500'
                            )}
                        >
                            전체
                        </button>
                        {populatedCategories.map(category => (
                            <button
                                key={category.id}
                                type="button"
                                role="tab"
                                aria-selected={selectedScope === category.id}
                                onClick={() => changeScope(category.id)}
                                className={clsx(
                                    'h-10 rounded-full border px-4 text-[13px] font-black transition-colors',
                                    selectedScope === category.id
                                        ? 'border-blue-600 bg-blue-600 text-white'
                                        : 'border-slate-200 bg-white text-slate-500'
                                )}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-4 flex items-end justify-between gap-3 px-1">
                <div>
                    <h3 className="text-[17px] font-black tracking-[-0.025em] text-slate-950">
                        {visibleTitle}
                    </h3>
                    {!isSearching && selectedScope === POPULAR_SCOPE && (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                            사용 횟수와 최근 이용을 먼저 반영해요
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-[11px] font-black text-slate-400">
                    {visibleBrands.length + (isSearching ? matchingScenarios.length : 0)}개
                </span>
            </div>

            {isSearching && matchingScenarios.length > 0 && (
                <div className="mt-3 space-y-2">
                    <p className="px-1 text-[11px] font-black text-blue-600">결제 상황</p>
                    {matchingScenarios.map(scenario => (
                        <button
                            key={scenario.id}
                            type="button"
                            onClick={() => onSelectPurchaseScenario?.(scenario)}
                            className="flex min-h-14 w-full flex-col justify-center rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-left transition hover:bg-blue-100"
                        >
                            <span className="text-sm font-black text-slate-900">{scenario.label}</span>
                            <span className="mt-0.5 text-[11px] font-semibold text-blue-700">
                                {scenario.requiredChecks.length > 0
                                    ? '실제 결제처가 아닌 구매 대상 · 적용 조건 확인 필요'
                                    : '실제 결제처가 아닌 구매 대상'}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {visibleBrands.length > 0 ? (
                <div className="mt-3 grid grid-cols-[repeat(3,116px)] justify-center gap-y-3">
                    {visibleBrands.map((item, index) => (
                        <MainBrandCard
                            key={item.brand.id}
                            item={item}
                            eager={index < 9}
                            onSelect={selectBrand}
                        />
                    ))}
                </div>
            ) : matchingScenarios.length === 0 ? (
                <div className="mt-3 rounded-[1.35rem] border border-slate-200 bg-white px-4 py-8 text-center shadow-sm">
                    <p className="text-sm font-black text-slate-700">일치하는 브랜드가 없어요</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        일반 결제로 카드 혜택을 비교할 수 있어요
                    </p>
                    <button
                        type="button"
                        onClick={selectGeneralPayment}
                        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98]"
                    >
                        <CreditCard className="h-4 w-4" />
                        {searchQuery.trim()
                            ? `‘${searchQuery.trim()}’ 일반 결제로 추천받기`
                            : '일반 결제로 추천받기'}
                    </button>
                </div>
            ) : null}

            {!isSearching && visibleBrands.length < sourceBrands.length && (
                <button
                    type="button"
                    onClick={() => setVisibleLimit(current => current + MORE_VISIBLE_COUNT)}
                    className="mx-auto mt-2 flex min-h-11 items-center justify-center gap-1 px-4 text-[13px] font-bold text-slate-500 transition hover:text-blue-600"
                >
                    더보기
                    <ChevronDown className="h-4 w-4" />
                </button>
            )}
        </section>
    );
}
