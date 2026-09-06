'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, CreditCard, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { IconByName } from '@/components/ui/IconByName';
import type { Brand } from '@/types';
import type { RankedBrand } from '@/utils/brandDiscovery';
import { BrandLogo } from './BrandLogo';
import { usesWideBrandLogo } from './brandVisuals';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

type DenseViewMode = 'popular' | 'name' | 'category';

const CATEGORY_ICONS: Record<string, string> = {
    cafe: 'Coffee',
    convenience: 'ShoppingBasket',
    food: 'Utensils',
    delivery: 'Bike',
    life: 'Sparkles',
    shopping: 'ShoppingBag',
    movie: 'Clapperboard',
    subscription: 'Tv',
    transport: 'Bus',
    etc: 'MoreHorizontal',
};

const VIEW_MODES: Array<{ id: DenseViewMode; label: string }> = [
    { id: 'popular', label: '내 인기순' },
    { id: 'name', label: '이름순' },
    { id: 'category', label: '카테고리' },
];

function comparePersonalPopularity(left: RankedBrand, right: RankedBrand): number {
    return right.meta.usageCount - left.meta.usageCount ||
        (right.meta.lastUsedAt || '').localeCompare(left.meta.lastUsedAt || '') ||
        right.meta.score - left.meta.score ||
        left.meta.popularityRank - right.meta.popularityRank ||
        left.brand.name.localeCompare(right.brand.name, 'ko-KR');
}

function DenseBrandTile({
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
    const usesWideWordmark = usesWideBrandLogo(item.brand);

    return (
        <button
            type="button"
            title={item.brand.name}
            aria-pressed={isSelected}
            onClick={() => onSelect(item.brand)}
            className={clsx(
                'relative flex min-h-[108px] min-w-0 flex-col items-center justify-center rounded-[1.1rem] border px-0.5 py-1.5 text-center transition active:scale-[0.96]',
                isSelected
                    ? 'border-blue-300 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/40'
            )}
        >
            <BrandLogo
                brand={item.brand}
                loading={eager ? 'eager' : 'lazy'}
                className={clsx(
                    'h-14 rounded-[1rem] bg-slate-50 shadow-sm ring-1 ring-black/[0.04]',
                    usesWideWordmark ? 'w-[72px]' : 'w-14'
                )}
                imageClassName={usesWideWordmark ? 'px-0.5 py-1' : 'p-0.5'}
            />
            <span className="mt-1.5 line-clamp-2 min-h-[32px] w-full break-keep text-[13px] font-black leading-[1.2] text-slate-800 [overflow-wrap:anywhere]">
                {item.brand.name}
            </span>
            {isSelected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                </span>
            )}
        </button>
    );
}

export function DenseLogoDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<DenseViewMode>('popular');
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
    const initialCategoryId = personalPopularBrands[0]?.brand.categoryId ||
        discovery.populatedCategories[0]?.id || '';
    const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
    const activeCategoryId = discovery.populatedCategories.some(
        category => category.id === selectedCategoryId
    ) ? selectedCategoryId : initialCategoryId;
    const categoryBrands = useMemo(
        () => personalPopularBrands.filter(item => item.brand.categoryId === activeCategoryId),
        [activeCategoryId, personalPopularBrands]
    );
    const visibleBrands = discovery.isSearching
        ? discovery.searchResults.slice(0, 40)
        : viewMode === 'popular'
            ? personalPopularBrands.slice(0, 24)
            : viewMode === 'name'
                ? nameSortedBrands.slice(0, 40)
                : categoryBrands;
    const visibleTitle = discovery.isSearching
        ? '검색 결과'
        : viewMode === 'popular'
            ? '자주 가는 브랜드부터'
            : viewMode === 'name'
                ? '브랜드 이름순'
                : discovery.populatedCategories.find(
                    category => category.id === activeCategoryId
                )?.name || '카테고리 브랜드';

    const selectGeneralPayment = () => {
        props.onSelectGeneralPayment?.(searchQuery.trim() || undefined);
    };

    return (
        <div className="min-h-[720px] bg-slate-50 px-3 pb-6 pt-4 text-slate-950">
            <div className="px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-600">
                    F2 · 고밀도 로고
                </p>
                <h2 className="mt-1 text-[25px] font-black tracking-[-0.045em]">
                    로고로 빠르게 찾기
                </h2>
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                    이름은 크게, 여백은 작게, 한 화면에는 더 많이
                </p>
            </div>

            <label className="relative mt-4 block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="브랜드 이름·별칭·초성 검색"
                    aria-label="브랜드 검색"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-[14px] font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery && (
                    <button
                        type="button"
                        aria-label="검색어 지우기"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </label>

            {!discovery.isSearching && (
                <div
                    role="tablist"
                    aria-label="브랜드 정렬 방식"
                    className="mt-3 grid grid-cols-3 rounded-2xl bg-slate-200/70 p-1"
                >
                    {VIEW_MODES.map(mode => (
                        <button
                            key={mode.id}
                            type="button"
                            role="tab"
                            aria-selected={viewMode === mode.id}
                            onClick={() => setViewMode(mode.id)}
                            className={clsx(
                                'h-10 rounded-xl text-[11px] font-black transition',
                                viewMode === mode.id
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-slate-500'
                            )}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            )}

            {!discovery.isSearching && viewMode === 'category' && (
                <div className="mt-3 grid grid-cols-5 gap-1">
                    {discovery.populatedCategories.map(category => {
                        const isActive = category.id === activeCategoryId;
                        return (
                            <button
                                key={category.id}
                                type="button"
                                aria-pressed={isActive}
                                onClick={() => setSelectedCategoryId(category.id)}
                                className={clsx(
                                    'flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-center transition active:scale-[0.96]',
                                    isActive
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white text-slate-500'
                                )}
                            >
                                <IconByName
                                    name={CATEGORY_ICONS[category.id] || 'LayoutGrid'}
                                    className="h-[22px] w-[22px]"
                                />
                                <span className="line-clamp-2 w-full break-keep text-[11px] font-black leading-[1.15]">
                                    {category.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="mt-4 flex items-end justify-between gap-3 px-1">
                <div>
                    <h3 className="text-[15px] font-black text-slate-900">{visibleTitle}</h3>
                    {!discovery.isSearching && viewMode === 'popular' && (
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                            사용 횟수 → 최근 사용 → 기본 인기 순
                        </p>
                    )}
                </div>
                <span className="shrink-0 text-[10px] font-black text-slate-400">
                    {visibleBrands.length}개 표시
                </span>
            </div>

            {visibleBrands.length > 0 ? (
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {visibleBrands.map((item, index) => (
                        <DenseBrandTile
                            key={item.brand.id}
                            item={item}
                            selectedBrandId={props.selectedBrandId}
                            eager={index < 12}
                            onSelect={props.onSelectBrand}
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-3 rounded-2xl bg-white px-4 py-8 text-center">
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

            {visibleBrands.length > 0 && (
                <button
                    type="button"
                    onClick={selectGeneralPayment}
                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[11px] font-black text-slate-400 hover:bg-white hover:text-blue-600"
                >
                    브랜드가 없다면 일반 결제
                    <ChevronRight className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );
}

export default DenseLogoDesign;
