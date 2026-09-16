'use client';

import { useMemo, useRef, useState } from 'react';
import { ChevronRight, CreditCard, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from '@/components/design-lab/BrandLogo';
import { getBrandLogoUrl } from '@/components/design-lab/brandVisuals';
import type { Brand, Category, TransactionHistory } from '@/types';
import type { BenefitBrandSuggestion } from '@/utils/benefitBrandSuggestions';
import {
    searchPurchaseScenarios,
    type PurchaseScenario,
} from '@/utils/purchaseScenario';
import {
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
const INITIAL_VISIBLE_COUNT = 12;
const MORE_VISIBLE_COUNT = 24;

function comparePersonalPopularity(left: RankedBrand, right: RankedBrand): number {
    return right.meta.usageCount - left.meta.usageCount ||
        (right.meta.lastUsedAt || '').localeCompare(left.meta.lastUsedAt || '') ||
        right.meta.score - left.meta.score ||
        left.meta.popularityRank - right.meta.popularityRank ||
        left.brand.name.localeCompare(right.brand.name, 'ko-KR');
}

function MainBrandCard({
    item,
    eager,
    onSelect,
}: {
    item: RankedBrand;
    eager: boolean;
    onSelect: (brand: Brand) => void;
}) {
    const hasLogo = Boolean(getBrandLogoUrl(item.brand));

    return (
        <button
            type="button"
            title={item.brand.name}
            onClick={() => onSelect(item.brand)}
            className="group flex min-h-[132px] min-w-0 flex-col items-center justify-center rounded-[1.35rem] border border-slate-200 bg-white px-1.5 pb-3 pt-3.5 text-center shadow-sm shadow-slate-200/70 transition-all hover:border-blue-300 hover:shadow-md active:scale-[0.97]"
        >
            <BrandLogo
                brand={item.brand}
                loading={eager ? 'eager' : 'lazy'}
                className={clsx(
                    'h-[58px] max-w-full rounded-2xl bg-white shadow-sm shadow-slate-200/60 ring-1 ring-inset ring-slate-200 transition group-hover:ring-blue-200',
                    hasLogo ? 'w-[76px]' : 'w-[58px]'
                )}
                imageClassName="p-0.5"
            />
            <span className="mt-2 line-clamp-2 min-h-[38px] w-full break-keep text-[15px] font-black leading-[1.28] tracking-[-0.025em] text-slate-900 [overflow-wrap:anywhere]">
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

    const rankedBrands = useMemo(
        () => rankBrands(brands, history, favoriteBrandIds),
        [brands, favoriteBrandIds, history]
    );
    const rankedById = useMemo(
        () => new Map(rankedBrands.map(item => [item.brand.id, item])),
        [rankedBrands]
    );
    const personalPopularBrands = useMemo(() => {
        const sortedBrands = [...rankedBrands].sort(comparePersonalPopularity);
        if (benefitSuggestions.length === 0) return sortedBrands;

        const suggestedBrandIds = new Set(benefitSuggestions.map(item => item.brand.id));
        const suggestedBrands = benefitSuggestions
            .map(suggestion => rankedById.get(suggestion.brand.id))
            .filter((item): item is RankedBrand => Boolean(item));

        return [
            ...suggestedBrands,
            ...sortedBrands.filter(item => !suggestedBrandIds.has(item.brand.id)),
        ];
    }, [benefitSuggestions, rankedBrands, rankedById]);
    const nameSortedBrands = useMemo(
        () => [...rankedBrands].sort((left, right) => (
            left.brand.name.localeCompare(right.brand.name, 'ko-KR')
        )),
        [rankedBrands]
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
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[#f7f8fa] px-3 pb-7 pt-5 shadow-sm">
            <div className="px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">
                    빠른 결제 찾기
                </p>
                <h2 className="mt-1 text-[26px] font-black tracking-[-0.05em] text-slate-950">
                    어디에서 결제하나요?
                </h2>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-500">
                    브랜드나 결제 상황을 검색해 빠르게 골라보세요
                </p>
            </div>

            <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={event => changeSearchQuery(event.target.value)}
                    placeholder="브랜드·결제 상황 검색"
                    aria-label="브랜드·결제 상황 검색"
                    autoComplete="off"
                    enterKeyHint="search"
                    className="h-[52px] w-full rounded-[1.1rem] border border-slate-200 bg-white pl-11 pr-11 text-[15px] font-bold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery && (
                    <button
                        type="button"
                        aria-label="검색어 지우기"
                        onClick={() => {
                            changeSearchQuery('');
                            searchInputRef.current?.focus();
                        }}
                        className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </label>

            {!isSearching && (
                <div className="-mx-3 mt-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                                실제 결제처가 아닌 구매 대상 · 적용 조건 확인 필요
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {visibleBrands.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
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
                    className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-[13px] font-black text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-600"
                >
                    브랜드 더 보기
                </button>
            )}

            {(visibleBrands.length > 0 || matchingScenarios.length > 0) && (
                <button
                    type="button"
                    onClick={selectGeneralPayment}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-black text-slate-400 transition hover:bg-white hover:text-blue-600"
                >
                    브랜드가 없다면 일반 결제
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            )}
        </section>
    );
}
