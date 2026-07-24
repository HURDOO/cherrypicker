'use client';

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, LayoutGrid } from 'lucide-react';
import { IconByName } from '@/components/ui/IconByName';
import { BrandLogo } from './BrandLogo';
import type { BrandDesignProps } from './types';

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

export function CategoryBoardDesign({
    categories,
    brands,
    selectedBrandId,
    onSelectBrand,
}: BrandDesignProps) {
    const selectedBrand = brands.find(brand => brand.id === selectedBrandId);
    const firstPopulatedCategoryId = categories.find(category =>
        brands.some(brand => brand.categoryId === category.id)
    )?.id;
    const [requestedCategoryId, setRequestedCategoryId] = useState(
        selectedBrand?.categoryId || firstPopulatedCategoryId || categories[0]?.id || ''
    );

    const activeCategoryId = categories.some(category => category.id === requestedCategoryId)
        ? requestedCategoryId
        : selectedBrand?.categoryId || firstPopulatedCategoryId || categories[0]?.id || '';
    const activeCategory = categories.find(category => category.id === activeCategoryId);

    const brandCounts = useMemo(() => {
        const counts = new Map<string, number>();
        brands.forEach(brand => {
            counts.set(brand.categoryId, (counts.get(brand.categoryId) || 0) + 1);
        });
        return counts;
    }, [brands]);

    const visibleBrands = useMemo(
        () => brands.filter(brand => brand.categoryId === activeCategoryId),
        [activeCategoryId, brands]
    );

    return (
        <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                            Category board
                        </p>
                        <h2 className="mt-1 text-xl font-black tracking-tight text-gray-900">
                            카테고리부터 골라보세요
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                            결제할 곳과 가까운 영역을 선택하면 브랜드를 빠르게 찾을 수 있어요.
                        </p>
                    </div>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                        <LayoutGrid className="h-5 w-5" />
                    </div>
                </div>
            </div>

            <div className="space-y-6 p-4 sm:p-5">
                <div>
                    <div className="mb-3 flex items-end justify-between px-1">
                        <div>
                            <h3 className="text-sm font-black text-gray-900">카테고리</h3>
                            <p className="mt-0.5 text-[11px] text-gray-400">
                                {categories.length}개 영역 · {brands.length}개 브랜드
                            </p>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400">먼저 영역을 선택하세요</span>
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
                                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors',
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
                                Selected category
                            </p>
                            <h3 className="mt-1 text-base font-black text-gray-900">
                                {activeCategory?.name || '브랜드'}
                            </h3>
                        </div>
                        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-500">
                            {visibleBrands.length}개
                        </span>
                    </div>

                    {visibleBrands.length > 0 ? (
                        <div className="grid grid-cols-3 gap-2.5">
                            {visibleBrands.map(brand => {
                                const isSelected = brand.id === selectedBrandId;

                                return (
                                    <button
                                        key={brand.id}
                                        type="button"
                                        title={brand.name}
                                        aria-pressed={isSelected}
                                        onClick={() => onSelectBrand(brand)}
                                        className={clsx(
                                            'group relative flex min-h-[116px] min-w-0 flex-col items-center justify-center rounded-2xl border px-2 py-3 text-center transition-all active:scale-[0.97]',
                                            isSelected
                                                ? 'border-blue-400 bg-blue-50 shadow-md shadow-blue-100 ring-2 ring-blue-100'
                                                : 'border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/40 hover:shadow-sm'
                                        )}
                                    >
                                        {isSelected && (
                                            <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                                                <Check className="h-3 w-3" strokeWidth={3} />
                                            </span>
                                        )}
                                        <BrandLogo
                                            brand={brand}
                                            className={clsx(
                                                'h-12 w-12 rounded-2xl border transition-all',
                                                isSelected
                                                    ? 'border-blue-200 shadow-sm shadow-blue-200'
                                                    : 'border-gray-100 shadow-sm group-hover:border-blue-100 group-hover:shadow-md'
                                            )}
                                            imageClassName="p-1.5"
                                        />
                                        <span className={clsx(
                                            'mt-2 line-clamp-2 min-h-[36px] w-full text-sm font-bold leading-[1.3] [overflow-wrap:anywhere] [word-break:keep-all]',
                                            isSelected ? 'text-blue-950' : 'text-gray-700'
                                        )}>
                                            {brand.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-10 text-center text-sm font-bold text-gray-400">
                            이 카테고리에 등록된 브랜드가 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

export default CategoryBoardDesign;
