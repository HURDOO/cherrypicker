'use client';

import clsx from 'clsx';
import { Check, LayoutGrid, Search, Sparkles } from 'lucide-react';
import { useBrandDiscoveryPreferences } from '@/hooks/useBrandDiscoveryPreferences';
import type { BrandDiscoveryViewMode } from '@/utils/brandDiscovery';

const VIEW_MODE_OPTIONS: Array<{
    id: BrandDiscoveryViewMode;
    label: string;
    description: string;
    icon: typeof Sparkles;
}> = [
    {
        id: 'default',
        label: '기본 보기',
        description: '추천·즐겨찾기·최근 기록을 먼저 보여줘요.',
        icon: Sparkles,
    },
    {
        id: 'name',
        label: '이름순 보기',
        description: '한글 초성과 영문 색인으로 빠르게 좁혀요.',
        icon: Search,
    },
    {
        id: 'category',
        label: '카테고리별 보기',
        description: '결제 상황에 맞춘 10개 생활 분류에서 골라요.',
        icon: LayoutGrid,
    },
];

export function BrandDiscoverySettings({ userId }: { userId: string }) {
    const {
        defaultViewMode,
        isPreferencesLoaded,
        setDefaultViewMode,
    } = useBrandDiscoveryPreferences(userId);

    return (
        <section>
            <div className="mb-4 flex items-center gap-2 px-1">
                <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                    <LayoutGrid className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">브랜드 기본 보기</h2>
                    <p className="text-[10px] text-gray-500">
                        홈에서 브랜드를 찾을 때 처음 열리는 방식을 정합니다.
                    </p>
                </div>
            </div>

            <div className="space-y-2 rounded-3xl border border-gray-100 bg-white p-2 shadow-sm">
                {VIEW_MODE_OPTIONS.map(option => {
                    const Icon = option.icon;
                    const isSelected = defaultViewMode === option.id;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            disabled={!isPreferencesLoaded}
                            aria-pressed={isSelected}
                            onClick={() => setDefaultViewMode(option.id)}
                            className={clsx(
                                'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-60',
                                isSelected
                                    ? 'border-blue-200 bg-blue-50/70'
                                    : 'border-transparent bg-white hover:bg-gray-50'
                            )}
                        >
                            <span className={clsx(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl',
                                isSelected
                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                                    : 'bg-gray-100 text-gray-500'
                            )}>
                                <Icon className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-black text-gray-900">
                                    {option.label}
                                </span>
                                <span className="mt-0.5 block text-[10px] leading-relaxed text-gray-400">
                                    {option.description}
                                </span>
                            </span>
                            <span className={clsx(
                                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                                isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-white text-transparent'
                            )}>
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                            </span>
                        </button>
                    );
                })}
            </div>
            <p className="mt-2 px-2 text-[9px] font-medium text-gray-400">
                선택한 값은 현재 브라우저에 자동 저장됩니다.
            </p>
        </section>
    );
}
