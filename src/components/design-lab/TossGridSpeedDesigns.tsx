'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import clsx from 'clsx';
import { IconByName } from '@/components/ui/IconByName';
import {
    BRAND_BROWSE_GROUPS,
    getBrandBrowseGroupId,
    getBrandIndexKeys,
    KOREAN_BRAND_INDEX_KEYS,
    LATIN_BRAND_INDEX_KEYS,
    type BrandBrowseGroupId,
    type RankedBrand,
} from '@/utils/brandDiscovery';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

function getBrandBadge(item: RankedBrand): string | undefined {
    if (item.meta.usedWithin7Days) return '최근';
    if (item.meta.usageCount >= 3) return '자주';
    if (item.meta.isPopular) return '인기';
    return undefined;
}

function SpeedSearch({
    value,
    onChange,
}: {
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="relative block">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b95a1]" />
            <input
                aria-label="브랜드 검색"
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder="브랜드 이름·별칭·초성 검색"
                className="h-12 w-full rounded-2xl border-0 bg-[#f2f4f6] pl-11 pr-11 text-[13px] font-semibold text-[#191f28] outline-none placeholder:text-[#8b95a1] focus:ring-2 focus:ring-[#3182f6]/20"
            />
            {value && (
                <button
                    type="button"
                    aria-label="검색어 지우기"
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[#8b95a1] hover:bg-[#e5e8eb]"
                >
                    <X className="h-4 w-4" />
                </button>
            )}
        </label>
    );
}

function SpeedHeader({
    eyebrow,
    title,
    description,
}: {
    eyebrow: string;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-end justify-between gap-3">
            <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#3182f6]">
                    {eyebrow}
                </p>
                <h2 className="mt-1 text-[27px] font-black leading-tight tracking-[-0.045em] text-[#191f28]">
                    {title}
                </h2>
                <p className="mt-1 text-[12px] font-semibold leading-relaxed text-[#8b95a1]">
                    {description}
                </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#e8f3ff] text-xl">
                🍒
            </div>
        </div>
    );
}

function CompactBrandTile({
    item,
    selectedBrandId,
    onSelect,
    density = 'compact',
    showBadge = true,
}: {
    item: RankedBrand;
    selectedBrandId: string | null;
    onSelect: BrandDesignProps['onSelectBrand'];
    density?: 'compact' | 'micro';
    showBadge?: boolean;
}) {
    const isSelected = selectedBrandId === item.brand.id;
    const badge = showBadge ? getBrandBadge(item) : undefined;

    return (
        <button
            type="button"
            onClick={() => onSelect(item.brand)}
            aria-pressed={isSelected}
            title={item.brand.name}
            className={clsx(
                'relative flex min-w-0 flex-col items-center justify-center rounded-[20px] text-center transition active:scale-[0.96]',
                density === 'compact' ? 'min-h-[94px] px-1.5 py-2.5' : 'min-h-[82px] px-1 py-2',
                isSelected
                    ? 'bg-[#e8f3ff] ring-2 ring-[#3182f6]'
                    : 'bg-[#f9fafb] hover:bg-[#f2f4f6]'
            )}
        >
            <BrandLogo
                brand={item.brand}
                className={clsx(
                    'rounded-[17px] shadow-sm ring-1 ring-black/[0.04]',
                    density === 'compact' ? 'h-10 w-10' : 'h-9 w-9'
                )}
                imageClassName="p-1.5"
            />
            <span className={clsx(
                'mt-2 line-clamp-2 w-full font-bold leading-tight text-[#333d4b] [word-break:keep-all]',
                density === 'compact' ? 'min-h-6 text-[10px]' : 'min-h-5 text-[9px]'
            )}>
                {item.brand.name}
            </span>
            {badge && density !== 'micro' && (
                <span className="mt-1 text-[9px] font-black text-[#3182f6]">{badge}</span>
            )}
        </button>
    );
}

function EmptyBrands() {
    return (
        <div className="col-span-full rounded-3xl bg-[#f9fafb] px-4 py-10 text-center">
            <p className="text-[13px] font-bold text-[#4e5968]">해당하는 브랜드가 없어요</p>
            <p className="mt-1 text-[11px] font-semibold text-[#8b95a1]">다른 조건으로 찾아보세요.</p>
        </div>
    );
}

export function TossGridInitialDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [indexKey, setIndexKey] = useState('');
    const [indexMode, setIndexMode] = useState<'korean' | 'latin'>('korean');
    const discovery = useConceptDiscovery(props, searchQuery);
    const availableIndexKeys = useMemo(
        () => new Set(discovery.rankedBrands.flatMap(item => getBrandIndexKeys(item.brand))),
        [discovery.rankedBrands]
    );
    const indexedBrands = useMemo(
        () => indexKey
            ? discovery.rankedBrands
                .filter(item => getBrandIndexKeys(item.brand).includes(indexKey))
                .sort((left, right) => left.brand.name.localeCompare(right.brand.name, 'ko-KR'))
            : discovery.rankedBrands,
        [discovery.rankedBrands, indexKey]
    );
    const visibleBrands = discovery.isSearching ? discovery.searchResults : indexedBrands;
    const displayedBrands = discovery.isSearching || indexKey
        ? visibleBrands
        : visibleBrands.slice(0, 20);
    const handleIndex = (key: string) => setIndexKey(current => current === key ? '' : key);
    const handleIndexMode = (mode: 'korean' | 'latin') => {
        setIndexMode(mode);
        setIndexKey('');
    };

    return (
        <div className="min-h-[720px] bg-white px-5 pb-7 pt-6 text-[#191f28]">
            <SpeedHeader
                eyebrow="E4 · 이름 색인"
                title="부르는 이름으로 바로"
                description="CU는 C·ㅅ, GS25는 G·ㅈ처럼 영문명과 한국어 별칭을 함께 묶어요"
            />
            <div className="mt-5">
                <SpeedSearch value={searchQuery} onChange={setSearchQuery} />
            </div>

            {!discovery.isSearching && (
                <div className="mt-4 rounded-3xl bg-[#f7f8fa] p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="grid flex-1 grid-cols-2 rounded-xl bg-[#e5e8eb] p-1">
                            <button
                                type="button"
                                onClick={() => handleIndexMode('korean')}
                                aria-pressed={indexMode === 'korean'}
                                className={clsx(
                                    'h-8 rounded-lg text-[10px] font-black transition',
                                    indexMode === 'korean'
                                        ? 'bg-white text-[#3182f6] shadow-sm'
                                        : 'text-[#6b7684]'
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
                                        ? 'bg-white text-[#191f28] shadow-sm'
                                        : 'text-[#6b7684]'
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
                                'rounded-full px-2.5 py-1 text-[9px] font-black transition',
                                !indexKey
                                    ? 'bg-[#3182f6] text-white'
                                    : 'bg-white text-[#6b7684]'
                            )}
                        >
                            추천순
                        </button>
                    </div>

                    {indexMode === 'korean' ? (
                        <div className="mt-3 grid grid-cols-7 gap-1.5">
                            {KOREAN_BRAND_INDEX_KEYS.map(key => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => handleIndex(key)}
                                    aria-pressed={indexKey === key}
                                    className={clsx(
                                        'flex h-9 items-center justify-center rounded-xl text-[11px] font-black transition',
                                        indexKey === key
                                            ? 'bg-[#3182f6] text-white shadow-sm'
                                            : 'bg-white text-[#6b7684] hover:text-[#3182f6]'
                                    )}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-3 grid grid-cols-7 gap-1.5">
                            {LATIN_BRAND_INDEX_KEYS.map(key => {
                                const isAvailable = availableIndexKeys.has(key);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={!isAvailable}
                                        onClick={() => handleIndex(key)}
                                        aria-pressed={indexKey === key}
                                        className={clsx(
                                            'flex h-9 items-center justify-center rounded-xl text-[10px] font-black transition',
                                            indexKey === key
                                                ? 'bg-[#191f28] text-white shadow-sm'
                                                : isAvailable
                                                    ? 'bg-white text-[#4e5968] hover:text-[#3182f6]'
                                                    : 'cursor-not-allowed bg-white/40 text-[#c9cdd2]'
                                        )}
                                    >
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="mt-5 flex items-center justify-between">
                <div>
                    <h3 className="text-[16px] font-black">
                        {discovery.isSearching
                            ? '검색 결과'
                            : indexKey
                                ? `${indexKey} 이름·별칭`
                                : '추천 순서'}
                    </h3>
                    {indexKey && (
                        <p className="mt-0.5 text-[9px] font-semibold text-[#8b95a1]">
                            공식 이름과 자주 부르는 이름을 모두 포함해요
                        </p>
                    )}
                </div>
                <span className="text-[11px] font-semibold text-[#8b95a1]">
                    {discovery.isSearching || indexKey
                        ? `${visibleBrands.length}개 · 모두 표시`
                        : `추천 ${displayedBrands.length}개`}
                </span>
            </div>
            <div data-testid="brand-index-results" className="mt-3 grid grid-cols-4 gap-2">
                {displayedBrands.map(item => (
                    <CompactBrandTile
                        key={item.brand.id}
                        item={item}
                        selectedBrandId={props.selectedBrandId}
                        onSelect={props.onSelectBrand}
                        showBadge={!indexKey}
                    />
                ))}
                {displayedBrands.length === 0 && <EmptyBrands />}
            </div>
        </div>
    );
}

export function TossGridRailDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const discovery = useConceptDiscovery(props, searchQuery);
    const groupCounts = useMemo(() => {
        const counts = new Map<BrandBrowseGroupId, number>();
        discovery.rankedBrands.forEach(item => {
            const groupId = getBrandBrowseGroupId(item.brand);
            counts.set(groupId, (counts.get(groupId) || 0) + 1);
        });
        return counts;
    }, [discovery.rankedBrands]);
    const visibleGroups = useMemo(
        () => BRAND_BROWSE_GROUPS.filter(group => (groupCounts.get(group.id) || 0) > 0),
        [groupCounts]
    );
    const defaultGroupId = discovery.rankedBrands[0]
        ? getBrandBrowseGroupId(discovery.rankedBrands[0].brand)
        : visibleGroups[0]?.id ?? 'convenience';
    const [requestedGroupId, setRequestedGroupId] = useState<BrandBrowseGroupId>(defaultGroupId);
    const activeGroup = visibleGroups.find(group => group.id === requestedGroupId) ??
        visibleGroups.find(group => group.id === defaultGroupId) ??
        visibleGroups[0] ?? BRAND_BROWSE_GROUPS[0];
    const groupedBrands = useMemo(
        () => discovery.rankedBrands.filter(item =>
            getBrandBrowseGroupId(item.brand) === activeGroup.id
        ),
        [activeGroup.id, discovery.rankedBrands]
    );
    const visibleBrands = discovery.isSearching ? discovery.searchResults : groupedBrands;

    return (
        <div className="min-h-[720px] bg-white px-4 pb-6 pt-5 text-[#191f28]">
            <div className="px-1">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#3182f6]">E5 · 생활 카테고리</p>
                <h2 className="mt-1 text-[25px] font-black tracking-[-0.045em]">고민 없이 업종부터</h2>
                <p className="mt-1 text-[12px] font-semibold text-[#8b95a1]">
                    결제할 때 떠올리는 10가지 상황으로 다시 묶었어요
                </p>
            </div>
            <div className="mt-4">
                <SpeedSearch value={searchQuery} onChange={setSearchQuery} />
            </div>

            {discovery.isSearching ? (
                <div className="mt-4 grid grid-cols-4 gap-2">
                    {visibleBrands.slice(0, 20).map(item => (
                        <CompactBrandTile
                            key={item.brand.id}
                            item={item}
                            selectedBrandId={props.selectedBrandId}
                            onSelect={props.onSelectBrand}
                        />
                    ))}
                    {visibleBrands.length === 0 && <EmptyBrands />}
                </div>
            ) : (
                <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] gap-2">
                    <nav
                        aria-label="생활 카테고리 선택"
                        className="space-y-1 rounded-[22px] bg-[#f2f4f6] p-1.5"
                    >
                        {visibleGroups.map(group => {
                            const isActive = group.id === activeGroup.id;
                            return (
                                <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => setRequestedGroupId(group.id)}
                                    aria-pressed={isActive}
                                    aria-label={group.label}
                                    className={clsx(
                                        'flex min-h-[46px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[15px] px-1 text-[9px] font-black leading-tight transition',
                                        isActive
                                            ? 'bg-[#191f28] text-white shadow-sm'
                                            : 'text-[#6b7684] hover:bg-white'
                                    )}
                                >
                                    <IconByName name={group.iconName} className="h-3.5 w-3.5" />
                                    <span className="line-clamp-2 w-full text-center">{group.shortLabel}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="min-w-0">
                        <div className="min-h-12 px-1">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-[13px] font-black">{activeGroup.label}</h3>
                                <span className="shrink-0 text-[9px] font-bold text-[#8b95a1]">
                                    {visibleBrands.length}개
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-[9px] font-semibold text-[#8b95a1]">
                                {activeGroup.hint}
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                            {visibleBrands.slice(0, 18).map(item => (
                                <CompactBrandTile
                                    key={item.brand.id}
                                    item={item}
                                    selectedBrandId={props.selectedBrandId}
                                    onSelect={props.onSelectBrand}
                                    density="micro"
                                    showBadge={false}
                                />
                            ))}
                            {visibleBrands.length === 0 && <EmptyBrands />}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
