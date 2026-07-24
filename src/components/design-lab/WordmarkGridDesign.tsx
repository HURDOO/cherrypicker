'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { getBrandMonogram, getBrandTone } from './brandVisuals';
import type { BrandDesignProps } from './types';

const ALL_CATEGORIES = 'all';

export function WordmarkGridDesign({
    categories,
    brands,
    selectedBrandId,
    onSelectBrand,
}: BrandDesignProps) {
    const searchInputId = useId();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategoryId, setActiveCategoryId] = useState(ALL_CATEGORIES);

    const selectedBrand = useMemo(
        () => brands.find(brand => brand.id === selectedBrandId),
        [brands, selectedBrandId]
    );

    const categoryNames = useMemo(
        () => new Map(categories.map(category => [category.id, category.name])),
        [categories]
    );

    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        brands.forEach(brand => {
            counts.set(brand.categoryId, (counts.get(brand.categoryId) || 0) + 1);
        });
        return counts;
    }, [brands]);

    const filteredBrands = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR');

        return brands.filter(brand => {
            const isInCategory = activeCategoryId === ALL_CATEGORIES
                || brand.categoryId === activeCategoryId;
            const matchesSearch = !normalizedQuery
                || brand.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery);

            return isInCategory && matchesSearch;
        });
    }, [activeCategoryId, brands, searchQuery]);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (value.trim()) setActiveCategoryId(ALL_CATEGORIES);
    };

    return (
        <section className="min-h-[680px] overflow-hidden rounded-[2rem] bg-gray-50 text-gray-900">
            <div className="border-b border-gray-100 bg-white px-5 pb-5 pt-6">
                <div className="flex items-center justify-between gap-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">
                        Wordmark grid
                    </p>
                    {selectedBrand && (
                        <span className="max-w-[58%] truncate rounded-full bg-blue-50 px-3 py-1 text-[11px] font-extrabold text-blue-700">
                            {selectedBrand.name} 선택됨
                        </span>
                    )}
                </div>

                <h2 className="mt-3 text-[27px] font-black leading-[1.2] tracking-[-0.04em] text-gray-950">
                    어디에서<br />결제하시나요?
                </h2>
                <p className="mt-2 text-[13px] font-medium leading-5 text-gray-500">
                    이름을 한눈에 읽고 브랜드를 골라보세요.
                </p>

                <div className="relative mt-5">
                    <label htmlFor={searchInputId} className="sr-only">
                        브랜드 검색
                    </label>
                    <Search
                        aria-hidden="true"
                        className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        id={searchInputId}
                        type="search"
                        value={searchQuery}
                        onChange={event => handleSearchChange(event.target.value)}
                        placeholder="브랜드 이름을 검색해보세요"
                        className="h-[52px] w-full rounded-2xl border border-gray-200 bg-gray-50 pl-11 pr-11 text-base font-semibold text-gray-900 outline-none transition placeholder:font-medium placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            aria-label="검색어 지우기"
                            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                            <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            <div className="px-4 py-5">
                <div
                    className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2"
                    aria-label="브랜드 카테고리"
                >
                    <button
                        type="button"
                        onClick={() => setActiveCategoryId(ALL_CATEGORIES)}
                        aria-pressed={activeCategoryId === ALL_CATEGORIES}
                        className={clsx(
                            'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                            activeCategoryId === ALL_CATEGORIES
                                ? 'bg-gray-950 text-white shadow-sm'
                                : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                        )}
                    >
                        전체
                        <span className={clsx(
                            'text-[10px]',
                            activeCategoryId === ALL_CATEGORIES ? 'text-gray-300' : 'text-gray-400'
                        )}>
                            {brands.length}
                        </span>
                    </button>

                    {categories.map(category => {
                        const isActive = activeCategoryId === category.id;

                        return (
                            <button
                                key={category.id}
                                type="button"
                                onClick={() => setActiveCategoryId(category.id)}
                                aria-pressed={isActive}
                                className={clsx(
                                    'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
                                    isActive
                                        ? 'bg-gray-950 text-white shadow-sm'
                                        : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900'
                                )}
                            >
                                {category.name}
                                <span className={clsx(
                                    'text-[10px]',
                                    isActive ? 'text-gray-300' : 'text-gray-400'
                                )}>
                                    {categoryCounts.get(category.id) || 0}
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mb-3 mt-4 flex items-end justify-between px-1">
                    <div>
                        <p className="text-[11px] font-bold text-gray-400">
                            {searchQuery.trim() ? '검색 결과' : '브랜드 목록'}
                        </p>
                        <p className="mt-0.5 text-sm font-black text-gray-900">
                            {filteredBrands.length}개 브랜드
                        </p>
                    </div>
                    <p className="text-[10px] font-bold text-gray-400">이름 중심 · 2열 보기</p>
                </div>

                {filteredBrands.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5">
                        {filteredBrands.map(brand => {
                            const tone = getBrandTone(brand);
                            const isSelected = brand.id === selectedBrandId;

                            return (
                                <button
                                    key={brand.id}
                                    type="button"
                                    onClick={() => onSelectBrand(brand)}
                                    aria-pressed={isSelected}
                                    aria-label={`${brand.name} 선택`}
                                    className={clsx(
                                        'group flex min-h-[126px] w-full flex-col items-start rounded-[22px] border p-3.5 text-left shadow-sm transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:scale-[0.98]',
                                        isSelected
                                            ? 'border-blue-400 bg-blue-50/70 ring-2 ring-blue-100'
                                            : 'border-gray-100 bg-white hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md'
                                    )}
                                >
                                    <span className="flex w-full items-start justify-between gap-2">
                                        <span className={clsx(
                                            'flex h-10 min-w-10 items-center justify-center rounded-[14px] px-2 text-[13px] font-black tracking-[-0.03em] transition-colors',
                                            isSelected ? tone.strong : tone.soft
                                        )}>
                                            {getBrandMonogram(brand.name)}
                                        </span>
                                        <span className={clsx(
                                            'flex h-7 w-7 items-center justify-center rounded-full transition',
                                            isSelected
                                                ? 'bg-blue-600 text-white'
                                                : 'border border-gray-100 bg-gray-50 text-transparent group-hover:border-gray-200'
                                        )}>
                                            <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                                        </span>
                                    </span>

                                    <span className="mt-3 min-h-10 break-words text-[15px] font-extrabold leading-5 tracking-[-0.025em] text-gray-950">
                                        {brand.name}
                                    </span>
                                    <span className="mt-auto pt-1 text-[11px] font-semibold text-gray-400">
                                        {categoryNames.get(brand.categoryId) || '기타'}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex min-h-48 flex-col items-center justify-center rounded-[22px] border border-dashed border-gray-200 bg-white px-6 text-center">
                        <span className="text-base font-black text-gray-800">찾는 브랜드가 없어요</span>
                        <span className="mt-1 text-[13px] leading-5 text-gray-400">
                            다른 이름이나 카테고리로 다시 찾아보세요.
                        </span>
                    </div>
                )}
            </div>
        </section>
    );
}

export default WordmarkGridDesign;
