'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
    BadgePercent,
    Clock3,
    Flame,
    LayoutGrid,
    LocateFixed,
    LoaderCircle,
    Search,
    Sparkles,
    Star,
    X,
} from 'lucide-react';
import { BrandLogo } from '@/components/design-lab/BrandLogo';
import { IconByName } from '@/components/ui/IconByName';
import type { Brand, Category, TransactionHistory } from '@/types';
import type { BenefitBrandSuggestion } from '@/utils/benefitBrandSuggestions';
import {
    BRAND_BROWSE_GROUPS,
    getBrandBrowseGroupId,
    getBrandIndexKeys,
    KOREAN_BRAND_INDEX_KEYS,
    LATIN_BRAND_INDEX_KEYS,
    POPULAR_BRAND_IDS,
    rankBrands,
    searchAndRankBrands,
    type BrandBrowseGroupId,
    type BrandDiscoveryViewMode,
    type RankedBrand,
} from '@/utils/brandDiscovery';

type QuickMode = 'recommended' | 'favorites' | 'recent' | 'frequent' | 'popular' | 'nearby';

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
    onSelectBrand: (brand: Brand) => void;
    onSelectBenefitSuggestion?: (suggestion: BenefitBrandSuggestion) => void;
    onToggleFavorite: (brandId: string) => void;
    onRequestLocation: () => Promise<boolean>;
}

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

const QUICK_MODES: Array<{
    id: QuickMode;
    label: string;
    icon: typeof Sparkles;
}> = [
    { id: 'recommended', label: '추천', icon: Sparkles },
    { id: 'favorites', label: '고정', icon: Star },
    { id: 'recent', label: '최근', icon: Clock3 },
    { id: 'frequent', label: '자주', icon: Flame },
    { id: 'popular', label: '인기', icon: Flame },
    { id: 'nearby', label: '주변 기록', icon: LocateFixed },
];

const VIEW_MODES: Array<{
    id: BrandDiscoveryViewMode;
    label: string;
    ariaLabel: string;
}> = [
    { id: 'default', label: '기본', ariaLabel: '기본 보기' },
    { id: 'name', label: '이름순', ariaLabel: '이름순 보기' },
    { id: 'category', label: '카테고리', ariaLabel: '카테고리별 보기' },
];

function getQuickBadge(item: RankedBrand, mode: QuickMode): string | undefined {
    if (mode === 'nearby') return '이 주변';
    if (item.meta.isFavorite) return '고정';
    if (item.meta.usedWithin7Days) return '최근';
    if (item.meta.usageCount >= 3) return '자주';
    if (item.meta.isPopular) return '인기';
    return undefined;
}

function FavoriteButton({
    brand,
    isFavorite,
    onToggle,
}: {
    brand: Brand;
    isFavorite: boolean;
    onToggle: (brandId: string) => void;
}) {
    return (
        <button
            type="button"
            aria-label={`${brand.name} ${isFavorite ? '고정 해제' : '고정'}`}
            aria-pressed={isFavorite}
            onClick={event => {
                event.stopPropagation();
                onToggle(brand.id);
            }}
            className={clsx(
                'absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 shadow-sm transition active:scale-90',
                isFavorite
                    ? 'border-amber-200 text-amber-500'
                    : 'border-gray-100 text-gray-300 hover:text-amber-500'
            )}
        >
            <Star className="h-3.5 w-3.5" fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
    );
}

function BrandTile({
    item,
    badge,
    compact = false,
    onSelect,
    onToggleFavorite,
}: {
    item: RankedBrand;
    badge?: string;
    compact?: boolean;
    onSelect: (brand: Brand) => void;
    onToggleFavorite: (brandId: string) => void;
}) {
    return (
        <div className="relative min-w-0">
            <button
                type="button"
                title={item.brand.name}
                onClick={() => onSelect(item.brand)}
                className={clsx(
                    'group flex w-full min-w-0 flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white px-1.5 text-center transition-all hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm active:scale-[0.97]',
                    compact ? 'min-h-[98px] py-2.5' : 'min-h-[116px] py-3'
                )}
            >
                <BrandLogo
                    brand={item.brand}
                    className={clsx(
                        'rounded-2xl border border-gray-100 shadow-sm transition group-hover:border-blue-100',
                        compact ? 'h-10 w-10' : 'h-12 w-12'
                    )}
                    imageClassName="p-1.5"
                />
                <span className={clsx(
                    'line-clamp-2 w-full font-black leading-[1.25] text-gray-700 [overflow-wrap:anywhere] [word-break:keep-all]',
                    compact ? 'mt-1.5 min-h-[27px] text-[10px]' : 'mt-2 min-h-[35px] text-[13px]'
                )}>
                    {item.brand.name}
                </span>
                {badge && (
                    <span className="mt-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] font-black text-blue-600">
                        {badge}
                    </span>
                )}
            </button>
            <FavoriteButton
                brand={item.brand}
                isFavorite={item.meta.isFavorite}
                onToggle={onToggleFavorite}
            />
        </div>
    );
}

export function BrandDiscovery({
    categories,
    brands,
    history,
    favoriteBrandIds,
    defaultViewMode,
    nearbyBrandIds,
    hasCurrentLocation,
    isLocating,
    benefitSuggestions = [],
    benefitOpportunityCount = benefitSuggestions.length,
    onSelectBrand,
    onSelectBenefitSuggestion,
    onToggleFavorite,
    onRequestLocation,
}: BrandDiscoveryProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [quickMode, setQuickMode] = useState<QuickMode>('recommended');
    const [viewMode, setViewMode] = useState<BrandDiscoveryViewMode>(defaultViewMode);
    const [indexMode, setIndexMode] = useState<'korean' | 'latin'>('korean');
    const [indexKey, setIndexKey] = useState('');
    const [requestedBrowseGroupId, setRequestedBrowseGroupId] = useState<BrandBrowseGroupId>();
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setViewMode(defaultViewMode);
    }, [defaultViewMode]);

    const rankedBrands = useMemo(
        () => rankBrands(brands, history, favoriteBrandIds),
        [brands, favoriteBrandIds, history]
    );
    const rankedById = useMemo(
        () => new Map(rankedBrands.map(item => [item.brand.id, item])),
        [rankedBrands]
    );
    const brandCounts = useMemo(() => {
        const counts = new Map<string, number>();
        brands.forEach(brand => {
            counts.set(brand.categoryId, (counts.get(brand.categoryId) || 0) + 1);
        });
        return counts;
    }, [brands]);
    const initialCategoryId = rankedBrands[0]?.brand.categoryId || categories[0]?.id || '';
    const [requestedCategoryId, setRequestedCategoryId] = useState(initialCategoryId);
    const activeCategoryId = categories.some(category => category.id === requestedCategoryId)
        ? requestedCategoryId
        : initialCategoryId;
    const activeCategory = categories.find(category => category.id === activeCategoryId);

    const recentBrands = useMemo(
        () => [...rankedBrands]
            .filter(item => item.meta.lastUsedAt)
            .sort((left, right) => (
                right.meta.lastUsedAt!.localeCompare(left.meta.lastUsedAt!)
            )),
        [rankedBrands]
    );
    const frequentBrands = useMemo(
        () => [...rankedBrands]
            .filter(item => item.meta.usageCount > 0)
            .sort((left, right) =>
                right.meta.usageCount - left.meta.usageCount ||
                right.meta.score - left.meta.score
            ),
        [rankedBrands]
    );
    const favoriteBrands = useMemo(
        () => rankedBrands.filter(item => item.meta.isFavorite),
        [rankedBrands]
    );
    const popularBrands = useMemo(
        () => POPULAR_BRAND_IDS
            .map(id => rankedById.get(id))
            .filter((item): item is RankedBrand => Boolean(item)),
        [rankedById]
    );
    const nearbyBrands = useMemo(
        () => nearbyBrandIds
            .map(id => rankedById.get(id))
            .filter((item): item is RankedBrand => Boolean(item)),
        [nearbyBrandIds, rankedById]
    );
    const quickBrands = useMemo(() => {
        const source = {
            recommended: rankedBrands,
            favorites: favoriteBrands,
            recent: recentBrands,
            frequent: frequentBrands,
            popular: popularBrands,
            nearby: nearbyBrands,
        }[quickMode];
        return source.slice(0, 12);
    }, [favoriteBrands, frequentBrands, nearbyBrands, popularBrands, quickMode, rankedBrands, recentBrands]);
    const categoryBrands = useMemo(
        () => rankedBrands.filter(item => item.brand.categoryId === activeCategoryId),
        [activeCategoryId, rankedBrands]
    );
    const searchResults = useMemo(
        () => searchAndRankBrands(rankedBrands, searchQuery),
        [rankedBrands, searchQuery]
    );
    const availableIndexKeys = useMemo(
        () => new Set(rankedBrands.flatMap(item => getBrandIndexKeys(item.brand))),
        [rankedBrands]
    );
    const indexedBrands = useMemo(
        () => indexKey
            ? rankedBrands
                .filter(item => getBrandIndexKeys(item.brand).includes(indexKey))
                .sort((left, right) => left.brand.name.localeCompare(right.brand.name, 'ko-KR'))
            : rankedBrands,
        [indexKey, rankedBrands]
    );
    const displayedNameBrands = indexKey ? indexedBrands : indexedBrands.slice(0, 20);
    const browseGroupCounts = useMemo(() => {
        const counts = new Map<BrandBrowseGroupId, number>();
        rankedBrands.forEach(item => {
            const groupId = getBrandBrowseGroupId(item.brand);
            counts.set(groupId, (counts.get(groupId) || 0) + 1);
        });
        return counts;
    }, [rankedBrands]);
    const visibleBrowseGroups = useMemo(
        () => BRAND_BROWSE_GROUPS.filter(group => (browseGroupCounts.get(group.id) || 0) > 0),
        [browseGroupCounts]
    );
    const defaultBrowseGroupId = rankedBrands[0]
        ? getBrandBrowseGroupId(rankedBrands[0].brand)
        : visibleBrowseGroups[0]?.id ?? 'convenience';
    const activeBrowseGroup = visibleBrowseGroups.find(
        group => group.id === requestedBrowseGroupId
    ) ?? visibleBrowseGroups.find(
        group => group.id === defaultBrowseGroupId
    ) ?? visibleBrowseGroups[0] ?? BRAND_BROWSE_GROUPS[0];
    const browseGroupBrands = useMemo(
        () => rankedBrands.filter(item => (
            getBrandBrowseGroupId(item.brand) === activeBrowseGroup.id
        )),
        [activeBrowseGroup.id, rankedBrands]
    );
    const isSearching = searchQuery.trim().length > 0;

    const handleQuickMode = async (mode: QuickMode) => {
        setQuickMode(mode);
        if (mode === 'nearby' && !hasCurrentLocation && !isLocating) {
            await onRequestLocation();
        }
    };

    const handleIndexMode = (mode: 'korean' | 'latin') => {
        setIndexMode(mode);
        setIndexKey('');
    };

    return (
        <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 pb-5 pt-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                    빠른 결제 찾기
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900">
                    어디에서 결제하나요?
                </h2>
                <div className="relative mt-4">
                    <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="배라, ㅂㅅㅋ, GS 25도 검색돼요"
                        autoComplete="off"
                        enterKeyHint="search"
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-10 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            aria-label="검색어 지우기"
                            onClick={() => {
                                setSearchQuery('');
                                searchInputRef.current?.focus();
                            }}
                            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
                <div
                    role="tablist"
                    aria-label="브랜드 보기 방식"
                    className="mt-3 grid grid-cols-3 rounded-2xl bg-gray-100 p-1"
                >
                    {VIEW_MODES.map(mode => {
                        const isActive = viewMode === mode.id;
                        return (
                            <button
                                key={mode.id}
                                type="button"
                                role="tab"
                                aria-label={mode.ariaLabel}
                                aria-selected={isActive}
                                onClick={() => setViewMode(mode.id)}
                                className={clsx(
                                    'h-9 rounded-xl text-[11px] font-black transition active:scale-[0.97]',
                                    isActive
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-800'
                                )}
                            >
                                {mode.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {!isSearching && benefitSuggestions.length > 0 && (
                <div className="border-b border-emerald-100 bg-emerald-50/70 p-4 sm:p-5">
                    <div className="flex items-start gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                            <BadgePercent className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-emerald-950">
                                지금 놓치고 있던 혜택 {benefitOpportunityCount.toLocaleString()}개
                            </h3>
                            <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-emerald-800/70">
                                내 멤버십·구독·페이·카드로 바로 계산되는 곳이에요. 실제 결제 금액 예시도 함께 보여드려요.
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {benefitSuggestions.map(suggestion => (
                            <button
                                key={suggestion.brand.id}
                                type="button"
                                onClick={() => {
                                    if (onSelectBenefitSuggestion) {
                                        onSelectBenefitSuggestion(suggestion);
                                        return;
                                    }
                                    onSelectBrand(suggestion.brand);
                                }}
                                aria-label={`${suggestion.brand.name}, ${suggestion.sampleAmount.toLocaleString()}원 결제 시 확정 혜택 ${suggestion.benefitAmount.toLocaleString()}원`}
                                className="flex min-h-[116px] min-w-0 flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 active:scale-[0.97]"
                            >
                                <BrandLogo
                                    brand={suggestion.brand}
                                    className="h-10 w-10 rounded-xl border border-gray-100 shadow-sm"
                                    imageClassName="p-1.5"
                                />
                                <span className="mt-1.5 line-clamp-1 w-full text-[11px] font-black text-gray-900">
                                    {suggestion.brand.name}
                                </span>
                                <span className="mt-1 line-clamp-1 w-full text-[9px] font-bold text-emerald-700">
                                    {suggestion.sampleAmount.toLocaleString()}원 결제 시 {suggestion.benefitAmount.toLocaleString()}원 혜택
                                </span>
                                <span className="mt-0.5 line-clamp-1 w-full text-[8px] font-bold text-gray-400">
                                    {suggestion.methodSummary}
                                    {suggestion.benefitCount > 1 && ` · ${suggestion.benefitCount}개 조합`}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {isSearching ? (
                <div className="p-4 sm:p-5">
                    <div className="mb-3 flex items-center justify-between px-1">
                        <h3 className="text-sm font-black text-gray-900">검색 결과</h3>
                        <span className="text-[10px] font-black text-gray-400">
                            {searchResults.length}개
                        </span>
                    </div>
                    {searchResults.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2.5">
                            {searchResults.map(item => (
                                <BrandTile
                                    key={item.brand.id}
                                    item={item}
                                    badge={getQuickBadge(item, 'recommended')}
                                    onSelect={onSelectBrand}
                                    onToggleFavorite={onToggleFavorite}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
                            <p className="text-sm font-black text-gray-500">일치하는 브랜드가 없어요</p>
                            <p className="mt-1 text-[11px] text-gray-400">브랜드명이나 초성으로 다시 찾아보세요.</p>
                        </div>
                    )}
                </div>
            ) : viewMode === 'default' ? (
                <div className="space-y-6 p-4 sm:p-5">
                    <div>
                        <div className="mb-3 flex items-center justify-between px-1">
                            <div>
                                <h3 className="text-sm font-black text-gray-900">바로 찾기</h3>
                                <p className="mt-0.5 text-[11px] text-gray-400">
                                    내 사용 기록과 즐겨찾기를 먼저 보여줘요
                                </p>
                            </div>
                            <Sparkles className="h-4 w-4 text-blue-500" />
                        </div>

                        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {QUICK_MODES.map(mode => {
                                const Icon = mode.icon;
                                const isActive = quickMode === mode.id;
                                return (
                                    <button
                                        key={mode.id}
                                        type="button"
                                        aria-pressed={isActive}
                                        onClick={() => void handleQuickMode(mode.id)}
                                        className={clsx(
                                            'flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-[10px] font-black transition active:scale-95',
                                            isActive
                                                ? 'border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-200'
                                                : 'border-gray-200 bg-white text-gray-500 hover:border-blue-200'
                                        )}
                                    >
                                        {mode.id === 'nearby' && isLocating ? (
                                            <LoaderCircle className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Icon className="h-3 w-3" fill={mode.id === 'favorites' && isActive ? 'currentColor' : 'none'} />
                                        )}
                                        {mode.label}
                                    </button>
                                );
                            })}
                        </div>

                        {quickBrands.length > 0 ? (
                            <div className="mt-1 grid grid-cols-4 gap-2">
                                {quickBrands.slice(0, 8).map(item => (
                                    <BrandTile
                                        key={item.brand.id}
                                        item={item}
                                        compact
                                        badge={getQuickBadge(item, quickMode)}
                                        onSelect={onSelectBrand}
                                        onToggleFavorite={onToggleFavorite}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="mt-1 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-7 text-center">
                                {quickMode === 'nearby' ? (
                                    <>
                                        <LocateFixed className="mx-auto h-6 w-6 text-gray-300" />
                                        <p className="mt-2 text-xs font-black text-gray-500">
                                            {hasCurrentLocation
                                                ? '이 주변에서 기록한 브랜드가 아직 없어요'
                                                : isLocating ? '현재 위치를 확인하고 있어요' : '위치를 허용하면 주변 기록을 보여줘요'}
                                        </p>
                                        <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                                            이곳에서 결제를 기록하면 다음 방문부터 빠르게 찾을 수 있어요.
                                        </p>
                                        {!hasCurrentLocation && !isLocating && (
                                            <button
                                                type="button"
                                                onClick={() => void onRequestLocation()}
                                                className="mt-3 rounded-full bg-gray-900 px-4 py-2 text-[10px] font-black text-white"
                                            >
                                                현재 위치 사용
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Star className="mx-auto h-6 w-6 text-gray-300" />
                                        <p className="mt-2 text-xs font-black text-gray-500">
                                            아직 표시할 사용 기록이 없어요
                                        </p>
                                        <p className="mt-1 text-[10px] text-gray-400">
                                            브랜드의 별을 눌러 여기에 고정해 보세요.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-gray-100 pt-5">
                        <div className="mb-3 flex items-end justify-between px-1">
                            <div>
                                <h3 className="flex items-center gap-1.5 text-sm font-black text-gray-900">
                                    <LayoutGrid className="h-4 w-4 text-blue-500" />
                                    카테고리로 찾기
                                </h3>
                                <p className="mt-0.5 text-[11px] text-gray-400">
                                    {categories.length}개 영역 · {brands.length}개 브랜드
                                </p>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">영역을 먼저 선택</span>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                            {categories.map(category => {
                                const count = brandCounts.get(category.id) || 0;
                                const isActive = category.id === activeCategoryId;
                                return (
                                    <button
                                        key={category.id}
                                        type="button"
                                        aria-pressed={isActive}
                                        disabled={count === 0}
                                        onClick={() => setRequestedCategoryId(category.id)}
                                        className={clsx(
                                            'group flex aspect-square min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border p-1.5 text-center transition-all active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40',
                                            isActive
                                                ? 'border-blue-300 bg-blue-50 shadow-sm ring-2 ring-blue-100/80'
                                                : 'border-gray-100 bg-gray-50/70 hover:border-blue-100 hover:bg-blue-50/40'
                                        )}
                                    >
                                        <span className={clsx(
                                            'flex h-8 w-8 items-center justify-center rounded-xl transition-colors',
                                            isActive
                                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                                                : 'bg-white text-gray-400 shadow-sm group-hover:text-blue-600'
                                        )}>
                                            <IconByName
                                                name={CATEGORY_ICONS[category.id] || 'LayoutGrid'}
                                                className="h-[18px] w-[18px]"
                                            />
                                        </span>
                                        <span className="w-full min-w-0">
                                            <span className={clsx(
                                                'line-clamp-2 block min-h-[24px] text-[10px] font-black leading-3 [overflow-wrap:anywhere] [word-break:keep-all]',
                                                isActive ? 'text-blue-950' : 'text-gray-700'
                                            )}>
                                                {category.name}
                                            </span>
                                            <span className={clsx(
                                                'mt-0.5 block text-[9px] font-bold',
                                                isActive ? 'text-blue-600' : 'text-gray-400'
                                            )}>
                                                {count}개
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-gray-100 pt-5">
                        <div className="mb-3 flex items-end justify-between px-1">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-500">
                                    선택한 카테고리
                                </p>
                                <h3 className="mt-1 text-base font-black text-gray-900">
                                    {activeCategory?.name || '브랜드'}
                                </h3>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-500">
                                {categoryBrands.length}개
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5">
                            {categoryBrands.map(item => (
                                <BrandTile
                                    key={item.brand.id}
                                    item={item}
                                    badge={getQuickBadge(item, 'recommended')}
                                    onSelect={onSelectBrand}
                                    onToggleFavorite={onToggleFavorite}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            ) : viewMode === 'name' ? (
                <div className="p-4 sm:p-5">
                    <div className="mb-3 flex items-end justify-between gap-3 px-1">
                        <div>
                            <h3 className="text-sm font-black text-gray-900">이름 색인으로 찾기</h3>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
                                영문명도 한국어로 부르는 이름에 함께 넣었어요
                            </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-black text-gray-400">
                            {brands.length}개
                        </span>
                    </div>

                    <div className="rounded-3xl bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="grid flex-1 grid-cols-2 rounded-xl bg-gray-200 p-1">
                                <button
                                    type="button"
                                    onClick={() => handleIndexMode('korean')}
                                    aria-pressed={indexMode === 'korean'}
                                    className={clsx(
                                        'h-8 rounded-lg text-[10px] font-black transition',
                                        indexMode === 'korean'
                                            ? 'bg-white text-blue-600 shadow-sm'
                                            : 'text-gray-500'
                                    )}
                                >
                                    한글 ㄱ–ㅎ
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleIndexMode('latin')}
                                    aria-pressed={indexMode === 'latin'}
                                    className={clsx(
                                        'h-8 rounded-lg text-[10px] font-black transition',
                                        indexMode === 'latin'
                                            ? 'bg-white text-gray-900 shadow-sm'
                                            : 'text-gray-500'
                                    )}
                                >
                                    영문 A–Z
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIndexKey('')}
                                aria-pressed={!indexKey}
                                className={clsx(
                                    'shrink-0 rounded-full px-2.5 py-1 text-[9px] font-black transition',
                                    !indexKey
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-gray-500'
                                )}
                            >
                                추천순
                            </button>
                        </div>

                        <div className="mt-3 grid grid-cols-7 gap-1.5">
                            {(indexMode === 'korean'
                                ? KOREAN_BRAND_INDEX_KEYS
                                : LATIN_BRAND_INDEX_KEYS
                            ).map(key => {
                                const isAvailable = availableIndexKeys.has(key);
                                const isActive = indexKey === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={!isAvailable}
                                        onClick={() => setIndexKey(current => current === key ? '' : key)}
                                        aria-pressed={isActive}
                                        className={clsx(
                                            'flex h-9 items-center justify-center rounded-xl text-[10px] font-black transition',
                                            isActive
                                                ? indexMode === 'korean'
                                                    ? 'bg-blue-600 text-white shadow-sm'
                                                    : 'bg-gray-900 text-white shadow-sm'
                                                : isAvailable
                                                    ? 'bg-white text-gray-600 hover:text-blue-600'
                                                    : 'cursor-not-allowed bg-white/50 text-gray-300'
                                        )}
                                    >
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="mb-3 mt-5 flex items-end justify-between gap-3 px-1">
                        <div>
                            <h3 className="text-sm font-black text-gray-900">
                                {indexKey ? `${indexKey} 이름·별칭` : '추천 브랜드'}
                            </h3>
                            {indexKey && (
                                <p className="mt-0.5 text-[10px] text-gray-400">
                                    공식 이름과 자주 부르는 이름을 모두 포함해요
                                </p>
                            )}
                        </div>
                        <span className="shrink-0 text-[10px] font-black text-gray-400">
                            {indexKey
                                ? `${displayedNameBrands.length}개 · 모두 표시`
                                : `추천 ${displayedNameBrands.length}개`}
                        </span>
                    </div>

                    {displayedNameBrands.length > 0 ? (
                        <div data-testid="brand-index-results" className="grid grid-cols-4 gap-2">
                            {displayedNameBrands.map(item => (
                                <BrandTile
                                    key={item.brand.id}
                                    item={item}
                                    compact
                                    badge={indexKey ? undefined : getQuickBadge(item, 'recommended')}
                                    onSelect={onSelectBrand}
                                    onToggleFavorite={onToggleFavorite}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center">
                            <p className="text-sm font-black text-gray-500">해당하는 브랜드가 없어요</p>
                            <p className="mt-1 text-[11px] text-gray-400">다른 글자를 선택해 보세요.</p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-4 sm:p-5">
                    <div className="mb-4 flex items-end justify-between gap-3 px-1">
                        <div>
                            <h3 className="text-sm font-black text-gray-900">결제 상황으로 찾기</h3>
                            <p className="mt-0.5 text-[11px] text-gray-400">
                                고민하기 쉬운 10가지 생활 카테고리로 묶었어요
                            </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-black text-gray-400">
                            {brands.length}개
                        </span>
                    </div>

                    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                        <nav
                            aria-label="생활 카테고리 선택"
                            className="space-y-1 rounded-[22px] bg-gray-100 p-1.5"
                        >
                            {visibleBrowseGroups.map(group => {
                                const isActive = group.id === activeBrowseGroup.id;
                                return (
                                    <button
                                        key={group.id}
                                        type="button"
                                        onClick={() => setRequestedBrowseGroupId(group.id)}
                                        aria-pressed={isActive}
                                        aria-label={group.label}
                                        className={clsx(
                                            'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[15px] px-1 text-[9px] font-black leading-tight transition active:scale-[0.97]',
                                            isActive
                                                ? 'bg-gray-900 text-white shadow-sm'
                                                : 'text-gray-500 hover:bg-white'
                                        )}
                                    >
                                        <IconByName name={group.iconName} className="h-3.5 w-3.5" />
                                        <span className="line-clamp-2 w-full text-center">
                                            {group.shortLabel}
                                        </span>
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="min-w-0">
                            <div className="min-h-12 px-1">
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-[13px] font-black text-gray-900">
                                        {activeBrowseGroup.label}
                                    </h3>
                                    <span className="shrink-0 text-[9px] font-bold text-gray-400">
                                        {browseGroupBrands.length}개
                                    </span>
                                </div>
                                <p className="mt-0.5 truncate text-[9px] font-semibold text-gray-400">
                                    {activeBrowseGroup.hint}
                                </p>
                            </div>

                            {browseGroupBrands.length > 0 ? (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {browseGroupBrands.map(item => (
                                        <BrandTile
                                            key={item.brand.id}
                                            item={item}
                                            compact
                                            onSelect={onSelectBrand}
                                            onToggleFavorite={onToggleFavorite}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center">
                                    <p className="text-xs font-black text-gray-500">브랜드가 없어요</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
