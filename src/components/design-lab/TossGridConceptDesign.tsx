'use client';

import { useState } from 'react';
import {
    Bike,
    Bus,
    Check,
    Clapperboard,
    Coffee,
    Ellipsis,
    MapPin,
    Search,
    ShoppingBag,
    Sparkles,
    Store,
    Tv,
    Utensils,
} from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

const CATEGORY_META = {
    cafe: { label: '카페', icon: Coffee },
    convenience: { label: '편의점', icon: Store },
    food: { label: '외식', icon: Utensils },
    delivery: { label: '배달', icon: Bike },
    life: { label: '생활', icon: Sparkles },
    shopping: { label: '쇼핑', icon: ShoppingBag },
    movie: { label: '영화', icon: Clapperboard },
    subscription: { label: '구독', icon: Tv },
    transport: { label: '교통', icon: Bus },
    etc: { label: '기타', icon: Ellipsis },
} as const;

export function TossGridConceptDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const {
        rankedBrands,
        searchResults,
        categoryBrands,
        populatedCategories,
        recentBrands,
        isSearching,
    } = useConceptDiscovery(props, searchQuery, categoryId);
    const selectedBrand = props.brands.find(brand => brand.id === props.selectedBrandId);
    const selectedCategory = populatedCategories.find(category => category.id === categoryId);
    const visibleBrands = isSearching ? searchResults : categoryBrands;
    const recent = recentBrands.length > 0 ? recentBrands.slice(0, 4) : rankedBrands.slice(0, 4);

    const getBadge = (item: (typeof visibleBrands)[number]) => {
        if (item.meta.usedWithin7Days) return '최근';
        if (item.meta.usageCount >= 3) return '자주';
        if (item.meta.isPopular) return '인기';
        return undefined;
    };

    return (
        <div className="min-h-[720px] bg-white px-5 pb-7 pt-6 text-[#191f28]">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[13px] font-semibold text-[#8b95a1]">오늘도 놓치지 않게</p>
                    <h2 className="mt-1 text-[29px] font-black leading-tight tracking-[-0.045em]">
                        어디서 결제해요?
                    </h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f3ff] text-xl">
                    🍒
                </div>
            </div>

            <label className="relative mt-6 block">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8b95a1]" />
                <input
                    aria-label="브랜드 검색"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="브랜드 이름을 검색해보세요"
                    className="h-14 w-full rounded-2xl border-0 bg-[#f2f4f6] pl-12 pr-4 text-[15px] font-semibold outline-none placeholder:text-[#8b95a1] focus:ring-2 focus:ring-[#3182f6]/20"
                />
            </label>

            {!isSearching && (
                <>
                    <div className="mt-7 flex items-center justify-between">
                        <h3 className="text-[17px] font-black tracking-[-0.02em]">최근 찾은 곳</h3>
                        <button type="button" className="flex items-center gap-1 text-[12px] font-bold text-[#3182f6]">
                            <MapPin className="h-3.5 w-3.5" /> 주변
                        </button>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {recent.map(item => (
                            <button
                                key={item.brand.id}
                                type="button"
                                onClick={() => props.onSelectBrand(item.brand)}
                                className="flex min-w-0 flex-col items-center gap-2 rounded-2xl py-2 transition active:scale-95"
                            >
                                <BrandLogo
                                    brand={item.brand}
                                    className="h-12 w-12 rounded-[18px]"
                                    imageClassName="p-1.5"
                                />
                                <span className="line-clamp-1 w-full text-center text-[11px] font-bold text-[#4e5968]">
                                    {item.brand.name}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="mt-7 flex items-end justify-between">
                        <div>
                            <h3 className="text-[17px] font-black tracking-[-0.02em]">업종으로 바로 찾기</h3>
                            <p className="mt-1 text-[11px] font-semibold text-[#8b95a1]">스크롤 없이 한 번에 골라보세요</p>
                        </div>
                        {categoryId && (
                            <button
                                type="button"
                                onClick={() => setCategoryId('')}
                                className="pb-0.5 text-[11px] font-bold text-[#3182f6]"
                            >
                                추천 보기
                            </button>
                        )}
                    </div>
                    <div className="mt-3 grid grid-cols-5 gap-2">
                        {populatedCategories.map(category => (
                            (() => {
                                const meta = CATEGORY_META[category.id as keyof typeof CATEGORY_META] ?? {
                                    label: category.name,
                                    icon: Ellipsis,
                                };
                                const Icon = meta.icon;
                                const isActive = categoryId === category.id;

                                return (
                                    <button
                                        key={category.id}
                                        type="button"
                                        onClick={() => setCategoryId(current =>
                                            current === category.id ? '' : category.id
                                        )}
                                        aria-pressed={isActive}
                                        aria-label={`${category.name} 브랜드 보기`}
                                        className={clsx(
                                            'flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2.5 text-[10px] font-bold transition active:scale-95',
                                            isActive
                                                ? 'bg-[#191f28] text-white shadow-sm'
                                                : 'bg-[#f2f4f6] text-[#6b7684] hover:bg-[#e5e8eb]'
                                        )}
                                    >
                                        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                        <span className="w-full truncate text-center">{meta.label}</span>
                                    </button>
                                );
                            })()
                        ))}
                    </div>
                </>
            )}

            <div className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[17px] font-black tracking-[-0.02em]">
                        {isSearching
                            ? '검색 결과'
                            : selectedCategory
                                ? `${selectedCategory.name} 브랜드`
                                : '추천 브랜드'}
                    </h3>
                    <span className="text-[12px] font-semibold text-[#8b95a1]">
                        {visibleBrands.length}개
                    </span>
                </div>

                {visibleBrands.length > 0 ? (
                    <div className="grid grid-cols-3 gap-x-2 gap-y-3">
                        {visibleBrands.slice(0, 12).map(item => {
                            const isSelected = item.brand.id === props.selectedBrandId;
                            const badge = getBadge(item);

                            return (
                                <button
                                    key={item.brand.id}
                                    type="button"
                                    onClick={() => props.onSelectBrand(item.brand)}
                                    aria-pressed={isSelected}
                                    className={clsx(
                                        'relative flex min-h-[126px] min-w-0 flex-col items-center justify-center rounded-[22px] px-2 py-3 transition active:scale-[0.97]',
                                        isSelected
                                            ? 'bg-[#e8f3ff] ring-2 ring-[#3182f6]'
                                            : 'bg-[#f9fafb] hover:bg-[#f2f4f6]'
                                    )}
                                >
                                    {isSelected && (
                                        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#3182f6] text-white">
                                            <Check className="h-3 w-3" strokeWidth={3} />
                                        </span>
                                    )}
                                    <BrandLogo
                                        brand={item.brand}
                                        className="h-14 w-14 rounded-[20px] shadow-sm ring-1 ring-black/[0.04]"
                                        imageClassName="p-2"
                                    />
                                    <span className="mt-2 line-clamp-1 w-full text-center text-[12px] font-bold text-[#333d4b]">
                                        {item.brand.name}
                                    </span>
                                    <span className={clsx(
                                        'mt-1 min-h-4 text-[10px] font-bold',
                                        badge ? 'text-[#3182f6]' : 'text-transparent'
                                    )}>
                                        {badge ?? '추천'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="rounded-3xl bg-[#f9fafb] px-5 py-12 text-center">
                        <p className="text-[14px] font-bold text-[#4e5968]">검색 결과가 없어요</p>
                        <p className="mt-1 text-[12px] font-medium text-[#8b95a1]">다른 브랜드 이름을 입력해보세요.</p>
                    </div>
                )}
            </div>

            {selectedBrand && (
                <button
                    type="button"
                    className="mt-6 flex w-full items-center justify-between rounded-2xl bg-[#3182f6] px-5 py-4 text-left text-white shadow-lg shadow-blue-200"
                >
                    <span>
                        <span className="block text-[11px] font-semibold text-blue-100">선택한 브랜드</span>
                        <span className="mt-0.5 block text-[16px] font-black">{selectedBrand.name}</span>
                    </span>
                    <span className="text-[13px] font-black">금액 입력하기</span>
                </button>
            )}
        </div>
    );
}
