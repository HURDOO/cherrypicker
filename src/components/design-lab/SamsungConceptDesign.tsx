'use client';

import { useState } from 'react';
import { ChevronRight, Grid2X2, Search, Settings2 } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

export function SamsungConceptDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryId, setCategoryId] = useState('convenience');
    const {
        rankedBrands,
        searchResults,
        categoryBrands,
        populatedCategories,
        isSearching,
    } = useConceptDiscovery(props, searchQuery, categoryId);
    const selectedBrand = props.brands.find(brand => brand.id === props.selectedBrandId);
    const visibleBrands = isSearching ? searchResults : categoryBrands;
    const activeCategory = populatedCategories.find(category => category.id === categoryId);

    return (
        <div className="min-h-[720px] bg-[#f2f6fc] pb-8 text-[#172033]">
            <header className="px-6 pb-8 pt-7">
                <div className="flex items-center justify-between">
                    <span className="text-[12px] font-black uppercase tracking-[0.14em] text-[#536174]">
                        Cherry Picker
                    </span>
                    <button type="button" aria-label="탐색 설정" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-[#536174] shadow-sm">
                        <Settings2 className="h-[18px] w-[18px]" />
                    </button>
                </div>
                <h2 className="mt-9 max-w-[290px] text-[32px] font-black leading-[1.12] tracking-[-0.045em]">
                    결제할 곳을<br />선택해 주세요
                </h2>
                <p className="mt-3 text-[13px] font-medium leading-relaxed text-[#68768a]">
                    자주 쓰는 브랜드부터 빠르게 보여드려요.
                </p>
            </header>

            <section className="rounded-t-[34px] bg-white px-5 pb-7 pt-5 shadow-[0_-12px_40px_rgba(65,93,138,0.08)]">
                <label className="relative block">
                    <Search className="absolute left-4 top-1/2 h-[19px] w-[19px] -translate-y-1/2 text-[#68768a]" />
                    <input
                        aria-label="브랜드 검색"
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="브랜드 검색"
                        className="h-14 w-full rounded-[18px] border-0 bg-[#f1f4f9] pl-12 pr-4 text-[14px] font-bold outline-none placeholder:text-[#7f8b9b] focus:ring-2 focus:ring-[#3478f6]/20"
                    />
                </label>

                {!isSearching && (
                    <>
                        <div className="mt-6 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Grid2X2 className="h-4 w-4 text-[#3478f6]" />
                                <h3 className="text-[15px] font-black">카테고리</h3>
                            </div>
                            <span className="text-[10px] font-bold text-[#8a96a6]">좌우로 탐색</span>
                        </div>
                        <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {populatedCategories.map(category => (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setCategoryId(category.id)}
                                    className={clsx(
                                        'shrink-0 rounded-[14px] border px-4 py-3 text-[12px] font-black transition',
                                        category.id === categoryId
                                            ? 'border-[#3478f6] bg-[#eaf2ff] text-[#1461d2]'
                                            : 'border-[#e5eaf1] bg-white text-[#5d6979]'
                                    )}
                                >
                                    {category.name}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <div className="mt-6 flex items-end justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#3478f6]">
                            {isSearching ? 'Search result' : 'Selected category'}
                        </p>
                        <h3 className="mt-1 text-[20px] font-black tracking-[-0.03em]">
                            {isSearching ? '검색 결과' : activeCategory?.name || '추천 브랜드'}
                        </h3>
                    </div>
                    <span className="rounded-full bg-[#f1f4f9] px-2.5 py-1 text-[10px] font-black text-[#68768a]">
                        {visibleBrands.length}
                    </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2.5">
                    {visibleBrands.slice(0, 9).map(item => (
                        <button
                            key={item.brand.id}
                            type="button"
                            onClick={() => props.onSelectBrand(item.brand)}
                            className={clsx(
                                'flex min-h-[118px] min-w-0 flex-col items-center justify-center rounded-[20px] border px-2 py-3 text-center transition active:scale-[0.97]',
                                item.brand.id === props.selectedBrandId
                                    ? 'border-[#3478f6] bg-[#edf4ff] shadow-sm'
                                    : 'border-[#e7ebf2] bg-white hover:bg-[#f8faff]'
                            )}
                        >
                            <BrandLogo brand={item.brand} className="h-12 w-12 rounded-[17px] border border-[#edf0f5]" imageClassName="p-1.5" />
                            <span className="mt-2 line-clamp-2 min-h-[32px] text-[12px] font-black leading-[1.3] [word-break:keep-all]">
                                {item.brand.name}
                            </span>
                        </button>
                    ))}
                </div>

                {!isSearching && rankedBrands.length > visibleBrands.length && (
                    <button type="button" className="mt-5 flex h-12 w-full items-center justify-center gap-1 rounded-[16px] bg-[#f1f4f9] text-[12px] font-black text-[#536174]">
                        모든 브랜드 보기 <ChevronRight className="h-4 w-4" />
                    </button>
                )}

                {selectedBrand && (
                    <div className="mt-5 rounded-[22px] bg-[#172033] p-4 text-white">
                        <div className="flex items-center gap-3">
                            <BrandLogo brand={selectedBrand} className="h-11 w-11 shrink-0 rounded-[15px]" imageClassName="p-1.5" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-[#aeb9c9]">선택 완료</p>
                                <p className="mt-0.5 truncate text-[14px] font-black">{selectedBrand.name}</p>
                            </div>
                            <button type="button" className="rounded-[13px] bg-[#3478f6] px-3.5 py-2.5 text-[11px] font-black">
                                다음
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
