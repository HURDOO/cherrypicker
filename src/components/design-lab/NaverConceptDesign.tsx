'use client';

import { useState } from 'react';
import { Bell, ChevronRight, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

const QUICK_CATEGORY_IDS = ['convenience', 'cafe', 'life', 'food', 'shopping'];

export function NaverConceptDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const {
        rankedBrands,
        searchResults,
        categoryBrands,
        populatedCategories,
        brandCounts,
        isSearching,
    } = useConceptDiscovery(props, searchQuery, categoryId);
    const selectedBrand = props.brands.find(brand => brand.id === props.selectedBrandId);
    const quickCategories = QUICK_CATEGORY_IDS
        .map(id => populatedCategories.find(category => category.id === id))
        .filter((category): category is NonNullable<typeof category> => Boolean(category));
    const visibleBrands = isSearching ? searchResults : categoryBrands;

    return (
        <div className="min-h-[720px] bg-[#f4f7f5] pb-7 text-[#1e1e23]">
            <header className="bg-white px-5 pb-5 pt-5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-[26px] font-black tracking-[-0.08em] text-[#03c75a]">N</span>
                        <span className="text-[18px] font-black tracking-[-0.04em]">혜택찾기</span>
                    </div>
                    <button type="button" aria-label="알림" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f5f6f7] text-[#55585c]">
                        <Bell className="h-[18px] w-[18px]" />
                    </button>
                </div>

                <label className="relative mt-5 block">
                    <input
                        aria-label="브랜드 검색"
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="결제할 브랜드를 검색하세요"
                        className="h-[54px] w-full rounded-xl border-2 border-[#03c75a] bg-white pl-4 pr-12 text-[15px] font-bold outline-none placeholder:font-medium placeholder:text-[#92979c]"
                    />
                    <Search className="absolute right-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#03c75a]" strokeWidth={2.6} />
                </label>
            </header>

            {!isSearching && (
                <section className="border-y border-[#e8ece9] bg-white px-5 py-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-[15px] font-black">자주 찾는 카테고리</h3>
                        <span className="text-[11px] font-bold text-[#8b9298]">전체 {props.brands.length}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                        {quickCategories.map((category, index) => (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setCategoryId(category.id === categoryId ? '' : category.id)}
                                className="min-w-0 text-center"
                            >
                                <span className={clsx(
                                    'mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[18px] shadow-sm transition',
                                    category.id === categoryId
                                        ? 'bg-[#03c75a] text-white'
                                        : 'bg-[#f2f8f4] text-[#03a94f]'
                                )}>
                                    {['🏪', '☕', '🛍️', '🍔', '🛒'][index]}
                                </span>
                                <span className="mt-2 line-clamp-1 block text-[10px] font-bold text-[#55585c]">
                                    {category.name.split('/')[0].replace('(OTT)', '')}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>
            )}

            <section className="mt-3 bg-white px-5 py-5">
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-[11px] font-black text-[#03a94f]">
                            {isSearching ? '검색 결과' : categoryId ? '카테고리 결과' : '지금 많이 찾는 곳'}
                        </p>
                        <h3 className="mt-0.5 text-[20px] font-black tracking-[-0.04em]">
                            {isSearching
                                ? `'${searchQuery}' 브랜드`
                                : populatedCategories.find(category => category.id === categoryId)?.name || '인기 브랜드'}
                        </h3>
                    </div>
                    {!isSearching && (
                        <button type="button" className="flex items-center text-[11px] font-bold text-[#777d82]">
                            전체보기 <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                    {visibleBrands.slice(0, 8).map((item, index) => (
                        <button
                            key={item.brand.id}
                            type="button"
                            onClick={() => props.onSelectBrand(item.brand)}
                            className={clsx(
                                'relative flex min-h-[82px] items-center gap-3 rounded-xl border bg-white p-3 text-left transition active:scale-[0.98]',
                                item.brand.id === props.selectedBrandId
                                    ? 'border-[#03c75a] ring-1 ring-[#03c75a]'
                                    : 'border-[#e8ece9]'
                            )}
                        >
                            <span className="absolute right-2 top-2 text-[10px] font-black text-[#a4aaae]">
                                {categoryId ? brandCounts.get(item.brand.categoryId) : index + 1}
                            </span>
                            <BrandLogo brand={item.brand} className="h-11 w-11 shrink-0 rounded-xl border border-[#eef1ef]" imageClassName="p-1.5" />
                            <span className="min-w-0 pr-2">
                                <span className="line-clamp-2 block text-[13px] font-black leading-snug">
                                    {item.brand.name}
                                </span>
                                <span className="mt-1 flex items-center gap-0.5 text-[9px] font-bold text-[#03a94f]">
                                    <Star className="h-2.5 w-2.5" fill="currentColor" /> 혜택 계산
                                </span>
                            </span>
                        </button>
                    ))}
                </div>

                {!isSearching && !categoryId && rankedBrands.length > 8 && (
                    <button
                        type="button"
                        onClick={() => setCategoryId(populatedCategories[0]?.id || '')}
                        className="mt-4 h-12 w-full rounded-xl border border-[#dde2df] bg-white text-[13px] font-black text-[#55585c]"
                    >
                        카테고리별로 더 찾아보기
                    </button>
                )}
            </section>

            {selectedBrand && (
                <div className="mx-5 mt-3 flex items-center gap-3 rounded-xl border border-[#bde9cd] bg-[#eafaf0] p-4">
                    <BrandLogo brand={selectedBrand} className="h-10 w-10 shrink-0 rounded-xl" imageClassName="p-1.5" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-black">{selectedBrand.name}</p>
                        <p className="mt-0.5 text-[10px] font-bold text-[#03a94f]">최대 혜택을 바로 확인하세요</p>
                    </div>
                    <button type="button" className="rounded-lg bg-[#03c75a] px-3 py-2 text-[11px] font-black text-white">
                        금액 입력
                    </button>
                </div>
            )}
        </div>
    );
}
