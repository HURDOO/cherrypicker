'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Check,
    Grid2X2,
    LayoutDashboard,
    ListFilter,
    Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import type { Brand } from '@/types';
import { WordmarkGridDesign } from '@/components/design-lab/WordmarkGridDesign';
import { SearchListDesign } from '@/components/design-lab/SearchListDesign';
import { CategoryBoardDesign } from '@/components/design-lab/CategoryBoardDesign';

type VariantId = 'wordmark' | 'search' | 'category';

const VARIANTS = [
    {
        id: 'wordmark' as const,
        name: 'A. 워드마크',
        shortName: 'A',
        description: '브랜드 이름을 가장 크게 보여주는 2열 카드형',
        detail: '로고가 없어도 큰 이름과 모노그램으로 빠르게 구분하는 안',
        icon: Grid2X2,
    },
    {
        id: 'search' as const,
        name: 'B. 빠른 검색',
        shortName: 'B',
        description: '최근 이용과 큰 목록을 결합한 검색 중심형',
        detail: '브랜드 수가 많아져도 검색과 큰 행으로 읽기 편한 안',
        icon: ListFilter,
    },
    {
        id: 'category' as const,
        name: 'C. 카테고리',
        shortName: 'C',
        description: '업종부터 고른 뒤 브랜드를 탐색하는 대시보드형',
        detail: '전체 구조를 한눈에 보고 단계적으로 좁혀가는 안',
        icon: LayoutDashboard,
    },
];

export default function DesignLabPage() {
    const { categories, brands, rules, history, isLoading } = useAppStore();
    const [activeVariant, setActiveVariant] = useState<VariantId>('wordmark');
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

    const activeMeta = VARIANTS.find(variant => variant.id === activeVariant) || VARIANTS[0];
    const sharedProps = {
        categories,
        brands,
        rules,
        history,
        selectedBrandId: selectedBrand?.id || null,
        onSelectBrand: setSelectedBrand,
    };

    if (isLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                    <p className="text-sm font-bold text-slate-500">디자인 시안을 준비하는 중...</p>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-slate-50 pb-12 text-slate-900">
            <header className="border-b border-slate-200 bg-white px-5 pb-5 pt-4">
                <div className="mb-5 flex items-center justify-between">
                    <Link
                        href="/"
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        홈으로
                    </Link>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-black tracking-wide text-blue-700">
                        <Sparkles className="h-3.5 w-3.5" />
                        DESIGN LAB
                    </span>
                </div>

                <h1 className="text-[26px] font-black leading-tight tracking-[-0.03em] text-slate-950">
                    홈 브랜드 선택<br />디자인 비교
                </h1>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                    실제 브랜드 데이터로 세 가지 배치를 비교해보세요. 기존 홈에는 아직 반영되지 않습니다.
                </p>
            </header>

            <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl">
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5">
                    {VARIANTS.map((variant) => {
                        const Icon = variant.icon;
                        const isActive = variant.id === activeVariant;

                        return (
                            <button
                                key={variant.id}
                                type="button"
                                onClick={() => setActiveVariant(variant.id)}
                                aria-pressed={isActive}
                                className={clsx(
                                    'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-center transition-all',
                                    isActive
                                        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                                        : 'text-slate-500 hover:text-slate-800'
                                )}
                            >
                                <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
                                <span className="text-[11px] font-black">{variant.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <section className="px-4 py-5">
                <div className="mb-4 rounded-3xl border border-blue-100 bg-blue-50/70 p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
                            {activeMeta.shortName}
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900">{activeMeta.description}</h2>
                            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                                {activeMeta.detail}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
                    {activeVariant === 'wordmark' && <WordmarkGridDesign {...sharedProps} />}
                    {activeVariant === 'search' && <SearchListDesign {...sharedProps} />}
                    {activeVariant === 'category' && <CategoryBoardDesign {...sharedProps} />}
                </div>

                <div className={clsx(
                    'mt-4 flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
                    selectedBrand
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-dashed border-slate-300 bg-white'
                )}>
                    <div className={clsx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        selectedBrand ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                    )}>
                        {selectedBrand ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-900">
                            {selectedBrand ? `${selectedBrand.name} 선택됨` : '시안에서 브랜드를 눌러보세요'}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                            비교용 선택이라 실제 홈의 선택 상태에는 영향을 주지 않습니다.
                        </p>
                    </div>
                </div>
            </section>
        </main>
    );
}

