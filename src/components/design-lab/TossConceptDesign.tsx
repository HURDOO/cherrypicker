'use client';

import { useState } from 'react';
import { ChevronRight, MapPin, Search, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

export function TossConceptDesign(props: BrandDesignProps) {
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
    const visibleBrands = isSearching ? searchResults : categoryBrands;
    const recent = recentBrands.length > 0 ? recentBrands.slice(0, 4) : rankedBrands.slice(0, 4);

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
                        <h3 className="text-[17px] font-black tracking-[-0.02em]">바로 찾기</h3>
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
                                <BrandLogo brand={item.brand} className="h-12 w-12 rounded-[18px]" imageClassName="p-1.5" />
                                <span className="line-clamp-1 w-full text-center text-[11px] font-bold text-[#4e5968]">
                                    {item.brand.name}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <button
                            type="button"
                            onClick={() => setCategoryId('')}
                            className={clsx(
                                'shrink-0 rounded-full px-4 py-2.5 text-[12px] font-bold transition',
                                !categoryId ? 'bg-[#191f28] text-white' : 'bg-[#f2f4f6] text-[#6b7684]'
                            )}
                        >
                            추천
                        </button>
                        {populatedCategories.map(category => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setCategoryId(category.id)}
                                className={clsx(
                                    'shrink-0 rounded-full px-4 py-2.5 text-[12px] font-bold transition',
                                    categoryId === category.id
                                        ? 'bg-[#191f28] text-white'
                                        : 'bg-[#f2f4f6] text-[#6b7684]'
                                )}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                </>
            )}

            <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[17px] font-black tracking-[-0.02em]">
                        {isSearching ? '검색 결과' : '혜택 있는 브랜드'}
                    </h3>
                    <span className="text-[12px] font-semibold text-[#8b95a1]">
                        {visibleBrands.length}개
                    </span>
                </div>
                <div className="divide-y divide-[#f2f4f6]">
                    {visibleBrands.slice(0, 7).map(item => (
                        <button
                            key={item.brand.id}
                            type="button"
                            onClick={() => props.onSelectBrand(item.brand)}
                            className="flex w-full items-center gap-3 py-3.5 text-left transition active:bg-[#f9fafb]"
                        >
                            <BrandLogo brand={item.brand} className="h-12 w-12 shrink-0 rounded-2xl" imageClassName="p-1.5" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-bold">{item.brand.name}</span>
                                <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#3182f6]">
                                    <Sparkles className="h-3 w-3" /> 최적 혜택 바로 계산
                                </span>
                            </span>
                            <ChevronRight className="h-5 w-5 text-[#b0b8c1]" />
                        </button>
                    ))}
                </div>
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
