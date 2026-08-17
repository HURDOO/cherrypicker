'use client';

import { useState } from 'react';
import { ChevronRight, MapPin, Search } from 'lucide-react';
import clsx from 'clsx';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';
import { useConceptDiscovery } from './useConceptDiscovery';

type AppleSegment = 'suggested' | 'recent' | 'category';

export function AppleConceptDesign(props: BrandDesignProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [segment, setSegment] = useState<AppleSegment>('suggested');
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
    const segmentBrands = segment === 'recent' && recentBrands.length > 0
        ? recentBrands
        : segment === 'category'
            ? categoryBrands
            : rankedBrands;
    const visibleBrands = isSearching ? searchResults : segmentBrands;

    return (
        <div className="relative min-h-[720px] overflow-hidden bg-[#f5f5f7] pb-8 text-[#1d1d1f]">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-300/30 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 top-72 h-56 w-56 rounded-full bg-purple-200/35 blur-3xl" />

            <header className="relative px-5 pb-4 pt-5">
                <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[#6e6e73]">9:41</span>
                    <span className="text-[13px] font-semibold">혜택</span>
                    <button type="button" className="text-[13px] font-semibold text-[#007aff]">편집</button>
                </div>
                <h2 className="mt-8 text-[34px] font-bold leading-tight tracking-[-0.045em]">
                    결제할 곳
                </h2>
                <p className="mt-1 text-[15px] leading-relaxed text-[#6e6e73]">
                    가장 좋은 결제 방법을 찾아드릴게요.
                </p>

                <label className="relative mt-5 block">
                    <Search className="absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#6e6e73]" />
                    <input
                        aria-label="브랜드 검색"
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                        placeholder="검색"
                        className="h-11 w-full rounded-xl border border-white/60 bg-white/65 pl-10 pr-4 text-[15px] font-medium shadow-sm backdrop-blur-xl outline-none focus:ring-2 focus:ring-[#007aff]/20"
                    />
                </label>
            </header>

            {!isSearching && (
                <div className="relative mx-5 mt-2 grid grid-cols-3 rounded-[10px] bg-[#e4e4e7]/80 p-[2px] backdrop-blur-xl">
                    {([
                        ['suggested', '추천'],
                        ['recent', '최근'],
                        ['category', '카테고리'],
                    ] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setSegment(id)}
                            className={clsx(
                                'h-8 rounded-lg text-[12px] font-semibold transition',
                                segment === id
                                    ? 'bg-white text-[#1d1d1f] shadow-sm'
                                    : 'text-[#6e6e73]'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}

            {!isSearching && segment === 'category' && (
                <div className="relative -mr-1 mt-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                        type="button"
                        onClick={() => setCategoryId('')}
                        className={clsx(
                            'shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-semibold backdrop-blur-xl',
                            !categoryId
                                ? 'border-[#1d1d1f] bg-[#1d1d1f] text-white'
                                : 'border-white/70 bg-white/65 text-[#3a3a3c]'
                        )}
                    >
                        전체
                    </button>
                    {populatedCategories.map(category => (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => setCategoryId(category.id)}
                            className={clsx(
                                'shrink-0 rounded-full border px-3.5 py-2 text-[12px] font-semibold backdrop-blur-xl',
                                categoryId === category.id
                                    ? 'border-[#1d1d1f] bg-[#1d1d1f] text-white'
                                    : 'border-white/70 bg-white/65 text-[#3a3a3c]'
                            )}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
            )}

            <section className="relative mt-6 px-5">
                <div className="flex items-end justify-between">
                    <div>
                        <p className="text-[13px] font-semibold text-[#6e6e73]">
                            {isSearching ? '검색 결과' : segment === 'recent' ? '다시 찾기' : segment === 'category' ? '둘러보기' : '사용자님을 위한 추천'}
                        </p>
                        <h3 className="mt-0.5 text-[22px] font-bold tracking-[-0.035em]">
                            {isSearching ? searchQuery : segment === 'recent' ? '최근 브랜드' : segment === 'category' ? '브랜드' : '지금 결제하기 좋은 곳'}
                        </h3>
                    </div>
                    <button type="button" aria-label="주변 브랜드" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-[#007aff] shadow-sm backdrop-blur-xl">
                        <MapPin className="h-4 w-4" />
                    </button>
                </div>

                <div className="mt-4 space-y-3">
                    {visibleBrands.slice(0, 6).map(item => (
                        <button
                            key={item.brand.id}
                            type="button"
                            onClick={() => props.onSelectBrand(item.brand)}
                            className={clsx(
                                'flex w-full items-center gap-3 rounded-[20px] border p-3.5 text-left shadow-sm backdrop-blur-2xl transition active:scale-[0.985]',
                                item.brand.id === props.selectedBrandId
                                    ? 'border-[#007aff]/40 bg-blue-50/80 ring-1 ring-[#007aff]/20'
                                    : 'border-white/80 bg-white/70'
                            )}
                        >
                            <BrandLogo brand={item.brand} className="h-[52px] w-[52px] shrink-0 rounded-[16px] border border-black/5" imageClassName="p-1.5" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold">{item.brand.name}</span>
                                <span className="mt-1 block text-[12px] text-[#6e6e73]">
                                    {item.meta.isPopular ? '인기 브랜드 · 혜택 확인 가능' : '등록 혜택 빠르게 계산'}
                                </span>
                            </span>
                            <ChevronRight className="h-5 w-5 text-[#b0b0b5]" />
                        </button>
                    ))}
                </div>
            </section>

            {selectedBrand && (
                <div className="relative mx-5 mt-5 rounded-[22px] border border-white/80 bg-white/75 p-4 shadow-lg shadow-black/5 backdrop-blur-2xl">
                    <p className="text-[12px] font-semibold text-[#6e6e73]">선택됨</p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                        <p className="truncate text-[17px] font-bold">{selectedBrand.name}</p>
                        <button type="button" className="shrink-0 rounded-full bg-[#007aff] px-4 py-2 text-[12px] font-semibold text-white">
                            계속
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
