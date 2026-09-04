'use client';

import clsx from 'clsx';
import { Flame, LayoutGrid, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Brand } from '@/types';
import {
    BRAND_BROWSE_GROUPS,
    getBrandBrowseGroupId,
    rankBrands,
    searchAndRankBrands,
    type BrandBrowseGroupId,
} from '@/utils/brandDiscovery';

type FavoriteBrowseMode = 'popular' | 'category';

export function FavoriteBrandSelector({
    brands,
    selectedBrandIds,
    disabled = false,
    showDefaultHint = false,
    onToggle,
}: {
    brands: Brand[];
    selectedBrandIds: string[];
    disabled?: boolean;
    showDefaultHint?: boolean;
    onToggle: (brandId: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [browseMode, setBrowseMode] = useState<FavoriteBrowseMode>('popular');
    const [requestedGroupId, setRequestedGroupId] =
        useState<BrandBrowseGroupId>('convenience');
    const rankedBrands = useMemo(() => rankBrands(brands, [], []), [brands]);
    const selectedIds = useMemo(() => new Set(selectedBrandIds), [selectedBrandIds]);
    const availableBrandIds = useMemo(() => new Set(brands.map(brand => brand.id)), [brands]);
    const selectedCount = selectedBrandIds.filter(id => availableBrandIds.has(id)).length;
    const groupCounts = useMemo(() => {
        const counts = new Map<BrandBrowseGroupId, number>();
        brands.forEach(brand => {
            const groupId = getBrandBrowseGroupId(brand);
            counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
        });
        return counts;
    }, [brands]);
    const visibleGroups = useMemo(
        () => BRAND_BROWSE_GROUPS.filter(group => (groupCounts.get(group.id) ?? 0) > 0),
        [groupCounts]
    );
    const activeGroup = visibleGroups.find(group => group.id === requestedGroupId)
        ?? visibleGroups[0];
    const isSearching = query.trim().length > 0;
    const displayedBrands = useMemo(() => {
        if (isSearching) return searchAndRankBrands(rankedBrands, query).slice(0, 40);
        if (browseMode === 'popular') return rankedBrands.slice(0, 24);
        if (!activeGroup) return [];
        return rankedBrands.filter(item => (
            getBrandBrowseGroupId(item.brand) === activeGroup.id
        ));
    }, [activeGroup, browseMode, isSearching, query, rankedBrands]);

    return (
        <div>
            {showDefaultHint && (
                <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-amber-800">
                    자주 찾는 인기 브랜드 6개를 먼저 골라뒀어요. 원하지 않는 곳은 별을 눌러 해제하세요.
                </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-1.5 text-xs font-black text-amber-700" aria-live="polite">
                    <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    {selectedCount}개 선택됨
                </div>
                <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1" aria-label="즐겨찾기 브랜드 보기 방식">
                    {([
                        ['popular', '인기순', Flame],
                        ['category', '카테고리', LayoutGrid],
                    ] as const).map(([id, label, Icon]) => (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={!isSearching && browseMode === id}
                            disabled={disabled}
                            onClick={() => {
                                setQuery('');
                                setBrowseMode(id);
                            }}
                            className={clsx(
                                'flex min-h-11 items-center justify-center gap-1 rounded-lg px-3 text-[10px] font-black transition disabled:opacity-60',
                                !isSearching && browseMode === id
                                    ? 'bg-white text-blue-700 shadow-sm'
                                    : 'text-gray-500'
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <label className="relative mt-3 block">
                <span className="sr-only">즐겨찾기 브랜드 검색</span>
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    value={query}
                    disabled={disabled}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="브랜드 이름·별칭 검색"
                    className="min-h-11 w-full rounded-2xl border border-gray-200 pl-10 pr-4 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-60"
                />
            </label>

            {!isSearching && browseMode === 'category' && (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="즐겨찾기 브랜드 카테고리">
                    {visibleGroups.map(group => (
                        <button
                            key={group.id}
                            type="button"
                            aria-pressed={activeGroup?.id === group.id}
                            disabled={disabled}
                            onClick={() => setRequestedGroupId(group.id)}
                            className={clsx(
                                'min-h-11 shrink-0 rounded-full border px-3 text-[10px] font-black transition disabled:opacity-60',
                                activeGroup?.id === group.id
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-white text-gray-600'
                            )}
                        >
                            {group.shortLabel} · {groupCounts.get(group.id)}
                        </button>
                    ))}
                </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2" aria-live="polite">
                {displayedBrands.map(({ brand, meta }) => {
                    const selected = selectedIds.has(brand.id);
                    return (
                        <button
                            key={brand.id}
                            type="button"
                            aria-pressed={selected}
                            disabled={disabled}
                            onClick={() => onToggle(brand.id)}
                            className={clsx(
                                'flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:opacity-60',
                                selected
                                    ? 'border-amber-400 bg-amber-50 text-amber-900'
                                    : 'border-gray-200 bg-white text-gray-600'
                            )}
                        >
                            <Star
                                className={clsx('h-4 w-4 shrink-0', selected && 'fill-current')}
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 break-words">{brand.name}</span>
                            {!isSearching && browseMode === 'popular' && meta.isPopular && (
                                <span className="shrink-0 text-[9px] font-black text-orange-500">인기</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {displayedBrands.length === 0 && (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-500">
                    일치하는 브랜드가 없어요. 검색어를 지우거나 다른 카테고리를 골라보세요.
                </div>
            )}
        </div>
    );
}
