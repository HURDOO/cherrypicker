'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, CreditCard, Search, X } from 'lucide-react';
import clsx from 'clsx';
import type { Brand } from '@/types';
import type { RankedBrand } from '@/utils/brandDiscovery';
import { BrandLogo } from './BrandLogo';
import { getBrandLogoUrl } from './brandVisuals';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

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

function LargeBrandCard({
    item,
    selectedBrandId,
    eager,
    onSelect,
}: {
    item: RankedBrand;
    selectedBrandId: string | null;
    eager: boolean;
    onSelect: (brand: Brand) => void;
}) {
    const isSelected = selectedBrandId === item.brand.id;
    const hasLogo = Boolean(getBrandLogoUrl(item.brand));

    return (
        <button
            type="button"
            title={item.brand.name}
            aria-pressed={isSelected}
            onClick={() => onSelect(item.brand)}
            className={clsx(
                'relative flex min-h-[132px] min-w-0 flex-col items-center justify-center rounded-[1.35rem] border bg-white px-1.5 pb-3 pt-3.5 text-center transition-all active:scale-[0.97]',
                isSelected
                    ? 'border-blue-500 shadow-md shadow-blue-100 ring-2 ring-blue-100'
                    : 'border-slate-200 shadow-sm shadow-slate-200/70 hover:border-blue-300'
            )}
        >
            <BrandLogo
                brand={item.brand}
                loading={eager ? 'eager' : 'lazy'}
                className={clsx(
                    'h-[58px] max-w-full rounded-2xl bg-white shadow-sm shadow-slate-200/60 ring-1 ring-inset ring-slate-200',
                    hasLogo ? 'w-[76px]' : 'w-[58px]'
                )}
                imageClassName="p-0.5"
            />
            <span className="mt-2 line-clamp-2 min-h-[38px] w-full break-keep text-[15px] font-black leading-[1.28] tracking-[-0.025em] text-slate-900 [overflow-wrap:anywhere]">
                {item.brand.name}
            </span>
            {isSelected && (
                <span className="absolute right-2 top-2 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
            )}
        </button>
    );
}

export function LargeBrandCardDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedScope, setSelectedScope] = useState(POPULAR_SCOPE);
    const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE_COUNT);
    const discovery = useConceptDiscovery(props, searchQuery);
    const personalPopularBrands = useMemo(
        () => [...discovery.rankedBrands].sort(comparePersonalPopularity),
        [discovery.rankedBrands]
    );
    const nameSortedBrands = useMemo(
        () => [...discovery.rankedBrands].sort((left, right) => (
            left.brand.name.localeCompare(right.brand.name, 'ko-KR')
        )),
        [discovery.rankedBrands]
    );
    const scopedBrands = useMemo(() => {
        if (selectedScope === POPULAR_SCOPE) return personalPopularBrands;
        if (selectedScope === ALL_SCOPE) return nameSortedBrands;
        return personalPopularBrands.filter(item => item.brand.categoryId === selectedScope);
    }, [nameSortedBrands, personalPopularBrands, selectedScope]);
    const sourceBrands = discovery.isSearching ? discovery.searchResults : scopedBrands;
    const currentLimit = discovery.isSearching ? MORE_VISIBLE_COUNT : visibleLimit;
    const visibleBrands = sourceBrands.slice(0, currentLimit);
    const activeCategory = discovery.populatedCategories.find(
        category => category.id === selectedScope
    );
    const visibleTitle = discovery.isSearching
        ? '검색 결과'
        : selectedScope === POPULAR_SCOPE
            ? '자주 찾는 브랜드'
            : selectedScope === ALL_SCOPE
                ? '전체 브랜드'
                : activeCategory?.name || '카테고리 브랜드';

    const changeScope = (scope: string) => {
        setSelectedScope(scope);
        setVisibleLimit(INITIAL_VISIBLE_COUNT);
    };
    const changeSearchQuery = (value: string) => {
        setSearchQuery(value);
        setVisibleLimit(INITIAL_VISIBLE_COUNT);
    };
    const selectGeneralPayment = () => {
        props.onSelectGeneralPayment?.(searchQuery.trim() || undefined);
    };

    return (
        <div className="min-h-[760px] bg-[#f7f8fa] px-3 pb-7 pt-4 text-slate-950">
            <div className="px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">
                    F3 · 3열 브랜드 카드
                </p>
                <h2 className="mt-1 text-[26px] font-black tracking-[-0.05em]">
                    브랜드 고르기
                </h2>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-500">
                    혜택 숫자 없이, 로고와 이름을 더 크고 선명하게
                </p>
            </div>

            <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input
                    value={searchQuery}
                    onChange={event => changeSearchQuery(event.target.value)}
                    placeholder="브랜드 이름·별칭·초성 검색"
                    aria-label="브랜드 검색"
                    className="h-[52px] w-full rounded-[1.1rem] border border-slate-200 bg-white pl-11 pr-11 text-[15px] font-bold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery && (
                    <button
                        type="button"
                        aria-label="검색어 지우기"
                        onClick={() => changeSearchQuery('')}
                        className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </label>

            {!discovery.isSearching && (
                <div className="-mx-3 mt-3 overflow-x-auto px-3 pb-1">
                    <div
                        role="tablist"
                        aria-label="브랜드 범위"
                        className="flex w-max gap-2"
                    >
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
                        {discovery.populatedCategories.map(category => (
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
                    {!discovery.isSearching && selectedScope === POPULAR_SCOPE && (
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                            사용 횟수와 최근 이용을 먼저 반영해요
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-[11px] font-black text-slate-400">
                    {visibleBrands.length}개
                </span>
            </div>

            {visibleBrands.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {visibleBrands.map((item, index) => (
                        <LargeBrandCard
                            key={item.brand.id}
                            item={item}
                            selectedBrandId={props.selectedBrandId}
                            eager={index < 9}
                            onSelect={props.onSelectBrand}
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-3 rounded-[1.35rem] border border-slate-100 bg-white px-4 py-8 text-center shadow-sm">
                    <p className="text-sm font-black text-slate-700">일치하는 브랜드가 없어요</p>
                    <button
                        type="button"
                        onClick={selectGeneralPayment}
                        className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-xs font-black text-white"
                    >
                        <CreditCard className="h-4 w-4" />
                        일반 결제로 추천받기
                    </button>
                </div>
            )}

            {!discovery.isSearching && visibleBrands.length < sourceBrands.length && (
                <button
                    type="button"
                    onClick={() => setVisibleLimit(current => current + MORE_VISIBLE_COUNT)}
                    className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-[13px] font-black text-slate-600 shadow-sm hover:border-blue-200 hover:text-blue-600"
                >
                    브랜드 더 보기
                </button>
            )}

            {visibleBrands.length > 0 && (
                <button
                    type="button"
                    onClick={selectGeneralPayment}
                    className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[12px] font-black text-slate-400 hover:bg-white hover:text-blue-600"
                >
                    브랜드가 없다면 일반 결제
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

export default LargeBrandCardDesign;
