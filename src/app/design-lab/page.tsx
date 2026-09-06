'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Check,
    CreditCard,
    GalleryHorizontalEnd,
    LayoutGrid,
    Languages,
    PanelLeft,
    Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import type { Brand } from '@/types';
import {
    TossGridInitialDesign,
    TossGridRailDesign,
} from '@/components/design-lab/TossGridSpeedDesigns';
import { DenseLogoDesign } from '@/components/design-lab/DenseLogoDesign';
import { LargeBrandCardDesign } from '@/components/design-lab/LargeBrandCardDesign';

type VariantId = 'large' | 'dense' | 'initial' | 'rail';

const VARIANTS = [
    {
        id: 'large' as const,
        name: 'F3 · 3열 카드',
        shortName: 'F3',
        description: '굿딜의 시인성을 가져오되 혜택 숫자는 넣지 않은 대형 카드형',
        detail: '첫 12개만 3열로 보여주고, 넓은 로고 무대와 큰 이름으로 브랜드 선택 자체에만 집중합니다.',
        icon: GalleryHorizontalEnd,
        metaClass: 'border-indigo-100 bg-indigo-50/80',
        badgeClass: 'bg-indigo-600',
    },
    {
        id: 'dense' as const,
        name: 'F2 · 로고 밀도',
        shortName: 'F2',
        description: '현재 구조에서 로고와 이름의 인지 속도를 높인 고밀도형',
        detail: '첫 12개 로고를 우선 로드하고, 큰 브랜드명과 좁은 여백으로 더 많은 선택지를 한눈에 비교합니다.',
        icon: LayoutGrid,
        metaClass: 'border-blue-100 bg-blue-50/80',
        badgeClass: 'bg-blue-600',
    },
    {
        id: 'initial' as const,
        name: 'E4 · 이름 색인',
        shortName: 'E4',
        description: '영문명과 한국어 별칭 양쪽에서 찾는 이름 중심형',
        detail: 'CU를 C와 ㅅ에서 모두 찾듯, 공식 이름·영문 ID·자주 부르는 이름을 함께 색인합니다.',
        icon: Languages,
        metaClass: 'border-amber-100 bg-amber-50/80',
        badgeClass: 'bg-amber-500',
    },
    {
        id: 'rail' as const,
        name: 'E5 · 생활 카테고리',
        shortName: 'E5',
        description: '결제 상황을 먼저 골라 바로 옆 브랜드로 이동하는 업종형',
        detail: '원본 분류를 편의·마트, 외식·배달, 구독·디지털처럼 고민 없이 고를 수 있는 10개 묶음으로 정리합니다.',
        icon: PanelLeft,
        metaClass: 'border-emerald-100 bg-emerald-50/80',
        badgeClass: 'bg-emerald-600',
    },
];

export default function DesignLabPage() {
    const { categories, brands, rules, history, isLoading } = useAppStore();
    const [activeVariant, setActiveVariant] = useState<VariantId>('large');
    const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
    const [selectedGeneralLabel, setSelectedGeneralLabel] = useState('');

    const activeMeta = VARIANTS.find(variant => variant.id === activeVariant) ?? VARIANTS[0];
    const handleSelectBrand = (brand: Brand) => {
        setSelectedBrand(brand);
        setSelectedGeneralLabel('');
    };
    const handleSelectGeneralPayment = (label?: string) => {
        setSelectedBrand(null);
        setSelectedGeneralLabel(label?.trim() || '일반 결제');
    };
    const selectedLabel = selectedBrand?.name || selectedGeneralLabel;
    const sharedProps = {
        categories,
        brands,
        rules,
        history,
        selectedBrandId: selectedBrand?.id || null,
        onSelectBrand: handleSelectBrand,
        onSelectGeneralPayment: handleSelectGeneralPayment,
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
        <main className="min-h-screen bg-slate-100 pb-12 text-slate-900">
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
                    브랜드 접근성 개선<br />인터랙션 시안
                </h1>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                    대형 브랜드 카드 F3와 기존 탐색안을 직접 비교합니다.
                </p>
            </header>

            <div className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-xl">
                <div className="mx-auto grid max-w-md grid-cols-4 gap-1.5 rounded-2xl bg-slate-100 p-1.5">
                    {VARIANTS.map(variant => {
                        const Icon = variant.icon;
                        const isActive = variant.id === activeVariant;

                        return (
                            <button
                                key={variant.id}
                                type="button"
                                onClick={() => setActiveVariant(variant.id)}
                                aria-pressed={isActive}
                                className={clsx(
                                    'flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center transition-all',
                                    isActive
                                        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                                        : 'text-slate-500 hover:text-slate-800'
                                )}
                            >
                                <Icon className="h-4 w-4" strokeWidth={isActive ? 2.5 : 2} />
                                <span className="text-[10px] font-black leading-tight">{variant.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <section className="mx-auto max-w-md px-4 py-5">
                <div className={clsx('mb-4 rounded-3xl border p-4', activeMeta.metaClass)}>
                    <div className="flex items-start gap-3">
                        <div className={clsx(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white',
                            activeMeta.badgeClass
                        )}>
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

                <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-300/50">
                    {activeVariant === 'large' && (
                        <LargeBrandCardDesign key="large" {...sharedProps} />
                    )}
                    {activeVariant === 'dense' && (
                        <DenseLogoDesign key="dense" {...sharedProps} />
                    )}
                    {activeVariant === 'initial' && (
                        <TossGridInitialDesign key="initial" {...sharedProps} />
                    )}
                    {activeVariant === 'rail' && (
                        <TossGridRailDesign key="rail" {...sharedProps} />
                    )}
                </div>

                <div className={clsx(
                    'mt-4 flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 transition-colors',
                    selectedLabel
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-dashed border-slate-300 bg-white'
                )}>
                    <div className={clsx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                        selectedLabel ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                    )}>
                        {selectedLabel
                            ? selectedBrand
                                ? <Check className="h-4 w-4" />
                                : <CreditCard className="h-4 w-4" />
                            : <Sparkles className="h-4 w-4" />}
                    </div>
                    <div>
                        <p className="text-xs font-black text-slate-900">
                            {selectedLabel ? `${selectedLabel} 선택됨` : '시안에서 브랜드를 눌러보세요'}
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
