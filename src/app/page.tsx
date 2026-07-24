'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    AlertCircle,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    CreditCard,
    Gift,
    LoaderCircle,
    Search,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Tag,
    Wallet,
    Wifi,
    WifiOff,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import { IconByName } from '@/components/ui/IconByName';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { MonthlyPerformanceReminder } from '@/components/performance/MonthlyPerformanceReminder';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import type {
    BenefitCombination,
    BenefitLayer,
    CombinationStep,
} from '@/types';
import {
    formatPerformanceMonthLabel,
    getCurrentMonthInKst,
    getPreviousMonthInKst,
} from '@/lib/monthly-performance';

const formatWon = (value: number) => `${value.toLocaleString()}원`;

const layerMeta: Record<BenefitLayer, {
    label: string;
    shortLabel: string;
    icon: typeof Tag;
    color: string;
}> = {
    DISCOUNT: {
        label: '통신사·매장 할인',
        shortLabel: '할인',
        icon: Tag,
        color: 'bg-rose-50 text-rose-600 border-rose-100',
    },
    PAY: {
        label: '페이 혜택',
        shortLabel: '페이',
        icon: Smartphone,
        color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    },
    PAYMENT_METHOD: {
        label: '결제수단 혜택',
        shortLabel: '결제수단',
        icon: CreditCard,
        color: 'bg-blue-50 text-blue-600 border-blue-100',
    },
    POST_REWARD: {
        label: '결제 후 적립',
        shortLabel: '사후 적립',
        icon: Gift,
        color: 'bg-violet-50 text-violet-600 border-violet-100',
    },
};

const fundingLabel = {
    CARD: '등록 카드',
    MONEY: '페이머니',
    POINTS: '포인트',
    GIFT_CERTIFICATE: '상품권',
};

function StepRow({
    step,
    confirmed,
    onConfirm,
}: {
    step: CombinationStep;
    confirmed: boolean;
    onConfirm: (promotionId: string) => void;
}) {
    const conditional = step.certainty === 'CONDITIONAL' && step.promotionId;
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                        {step.providerName}
                    </p>
                    <p className="mt-1 text-xs font-black leading-snug text-gray-900">
                        {step.title}
                    </p>
                </div>
                <span className="shrink-0 text-sm font-black text-gray-900">
                    +{formatWon(step.benefitAmount)}
                </span>
            </div>
            {step.warning && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
                    {step.warning}
                </p>
            )}
            {conditional && (
                <button
                    type="button"
                    onClick={() => onConfirm(step.promotionId!)}
                    className={clsx(
                        'mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black',
                        confirmed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                    )}
                >
                    {confirmed ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {confirmed ? '조건 확인 완료' : '이 조건을 충족했어요'}
                </button>
            )}
        </div>
    );
}

function LayerCard({
    layer,
    steps,
    fallback,
    confirmedConditionIds,
    onConfirm,
}: {
    layer: BenefitLayer;
    steps: CombinationStep[];
    fallback: string;
    confirmedConditionIds: Set<string>;
    onConfirm: (promotionId: string) => void;
}) {
    const meta = layerMeta[layer];
    const Icon = meta.icon;
    return (
        <div className={clsx('rounded-3xl border p-4', meta.color)}>
            <div className="mb-3 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/80">
                    <Icon className="h-4 w-4" />
                </div>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
                        {meta.shortLabel}
                    </p>
                    <p className="text-xs font-black">{meta.label}</p>
                </div>
            </div>
            {steps.length > 0 ? (
                <div className="space-y-2">
                    {steps.map(step => (
                        <StepRow
                            key={step.id}
                            step={step}
                            confirmed={Boolean(
                                step.promotionId && confirmedConditionIds.has(step.promotionId)
                            )}
                            onConfirm={onConfirm}
                        />
                    ))}
                </div>
            ) : (
                <p className="rounded-2xl bg-white/60 px-3 py-4 text-center text-[11px] font-bold opacity-60">
                    {fallback}
                </p>
            )}
        </div>
    );
}

function CombinationSummary({
    combination,
    rank,
    selected,
    onSelect,
}: {
    combination: BenefitCombination;
    rank: number;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={clsx(
                'w-full rounded-2xl border p-4 text-left transition-all',
                selected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-gray-100 bg-white hover:border-gray-300'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black text-gray-400">#{rank} 추천 조합</p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                        {combination.payProviderName || '직접 결제'} · {
                            combination.cardName || fundingLabel[combination.fundingType]
                        }
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-gray-500">
                        실결제 {formatWon(combination.payableAmount)}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-black text-blue-600">
                        +{formatWon(combination.confirmedValue)}
                    </p>
                    {(combination.conditionalValue + combination.estimatedValue) > 0 && (
                        <p className="text-[10px] font-bold text-amber-600">
                            추가 가능 +{formatWon(
                                combination.conditionalValue + combination.estimatedValue
                            )}
                        </p>
                    )}
                </div>
            </div>
        </button>
    );
}

export default function HomePage() {
    const {
        categories,
        brands,
        cards,
        rules,
        history,
        performances,
        isLoading,
        selectedBrandId,
        setSelectedBrandId,
        addTransaction,
    } = useAppStore();
    const addToast = useToastStore(state => state.addToast);
    const [amount, setAmount] = useState(0);
    const [eligibleItemAmount, setEligibleItemAmount] = useState<number | undefined>();
    const [isOnline, setIsOnline] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [recommendation, setRecommendation] = useState<Awaited<
        ReturnType<typeof apiClient.getRecommendation>
    > | null>(null);
    const [isRecommending, setIsRecommending] = useState(false);
    const [selectedCombinationId, setSelectedCombinationId] = useState<string>();
    const [confirmedConditionIds, setConfirmedConditionIds] = useState<Set<string>>(new Set());
    const [isItemBenefitOpen, setIsItemBenefitOpen] = useState(false);
    const [recordConfirmationId, setRecordConfirmationId] = useState<string>();
    const [isRecording, setIsRecording] = useState(false);
    const recommendationVersion = useRef(0);
    const recordInFlight = useRef(false);
    const [performancePeriod] = useState(() => {
        const referenceDate = new Date();
        return {
            performanceMonth: getPreviousMonthInKst(referenceDate),
            benefitMonth: getCurrentMonthInKst(referenceDate),
        };
    });

    const currentBrand = useMemo(
        () => brands.find(brand => brand.id === selectedBrandId),
        [brands, selectedBrandId]
    );
    const filteredBrands = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return query
            ? brands.filter(brand => brand.name.toLowerCase().includes(query))
            : brands;
    }, [brands, searchQuery]);
    const brandsByCategory = useMemo(() => {
        const grouped: Record<string, typeof brands> = {};
        categories.forEach(category => {
            const matches = filteredBrands.filter(brand => brand.categoryId === category.id);
            if (matches.length > 0) grouped[category.id] = matches;
        });
        return grouped;
    }, [categories, filteredBrands]);
    const currentPerformances = useMemo(
        () => performances.filter(
            performance => performance.performanceMonth === performancePeriod.performanceMonth
        ),
        [performances, performancePeriod.performanceMonth]
    );
    const missingPerformanceCards = useMemo(() => {
        const activeCardIds = new Set([
            ...performances.map(performance => performance.cardId),
            ...history.map(transaction => transaction.cardId),
        ]);
        const enteredCardIds = new Set(currentPerformances.map(item => item.cardId));
        return cards.filter(card => {
            const needsPerformance = card.limitTable.some(tier => tier.threshold > 0) ||
                rules.some(rule =>
                    rule.cardId === card.id && (rule.condition.minPerformance ?? 0) > 0
                );
            return needsPerformance && activeCardIds.has(card.id) && !enteredCardIds.has(card.id);
        });
    }, [cards, currentPerformances, history, performances, rules]);

    useEffect(() => {
        if (!currentBrand || amount <= 0) {
            setRecommendation(null);
            setSelectedCombinationId(undefined);
            return;
        }
        const version = recommendationVersion.current + 1;
        recommendationVersion.current = version;
        const timer = window.setTimeout(async () => {
            setIsRecommending(true);
            try {
                const result = await apiClient.getRecommendation({
                    brandId: currentBrand.id,
                    amount,
                    ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                    isOnline,
                    confirmedConditionIds: [...confirmedConditionIds],
                });
                if (recommendationVersion.current !== version) return;
                setRecommendation(result);
                setSelectedCombinationId(current =>
                    result.combinations.some(item => item.id === current)
                        ? current
                        : result.combinations[0]?.id
                );
            } catch (error) {
                if (recommendationVersion.current !== version) return;
                setRecommendation(null);
                addToast(getErrorMessage(error, '혜택 조합을 계산하지 못했습니다.'), 'error');
            } finally {
                if (recommendationVersion.current === version) setIsRecommending(false);
            }
        }, 300);
        return () => window.clearTimeout(timer);
    }, [
        addToast,
        amount,
        confirmedConditionIds,
        currentBrand,
        eligibleItemAmount,
        isOnline,
    ]);

    const selectedCombination = recommendation?.combinations.find(
        item => item.id === selectedCombinationId
    ) ?? recommendation?.combinations[0];

    const handleKeypadChange = (value: string) => {
        setAmount(current => {
            if (current === 0) return value === '0' || value === '00' ? 0 : Number(value);
            const next = `${current}${value}`;
            return next.length > 9 ? current : Number(next);
        });
    };

    const handleConfirmCondition = (promotionId: string) => {
        setConfirmedConditionIds(current => {
            const next = new Set(current);
            if (next.has(promotionId)) next.delete(promotionId);
            else next.add(promotionId);
            return next;
        });
    };

    const handleRecord = async () => {
        if (!currentBrand || !selectedCombination || amount <= 0 || recordInFlight.current) return;
        if (recordConfirmationId !== selectedCombination.id) {
            setRecordConfirmationId(selectedCombination.id);
            window.setTimeout(() => setRecordConfirmationId(undefined), 3000);
            return;
        }
        recordInFlight.current = true;
        setIsRecording(true);
        setRecordConfirmationId(undefined);
        try {
            const transaction = await apiClient.createCombinationTransaction({
                brandId: currentBrand.id,
                amount,
                ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                isOnline,
                confirmedConditionIds: [...confirmedConditionIds],
                combinationId: selectedCombination.id,
            });
            addTransaction(transaction);
            addToast('선택한 혜택 조합으로 기록했습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '결제 기록을 저장하지 못했습니다.'), 'error');
        } finally {
            recordInFlight.current = false;
            setIsRecording(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (cards.length === 0 || brands.length === 0) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8 text-center">
                <AlertCircle className="mb-4 h-10 w-10 text-gray-300" />
                <h1 className="text-xl font-black text-gray-900">추천 데이터가 없습니다</h1>
                <Link href="/settings" className="mt-6 rounded-2xl bg-gray-900 px-6 py-3 text-sm font-black text-white">
                    설정으로 이동
                </Link>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-32">
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white/90 px-6 py-4 backdrop-blur">
                <div>
                    <h1 className="flex items-center gap-2 text-xl font-black text-gray-900">
                        <span className="text-2xl">🍒</span> Cherry Picker
                    </h1>
                    <p className="text-[10px] font-bold text-gray-400">할인부터 결제수단까지 한 번에</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOnline(value => !value)}
                    className={clsx(
                        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-black',
                        isOnline
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                    )}
                >
                    {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {isOnline ? '온라인' : '오프라인'}
                </button>
            </header>

            <div className="mx-auto max-w-lg space-y-7 px-5 pt-6">
                <MonthlyPerformanceReminder
                    missingCount={missingPerformanceCards.length}
                    performanceMonthLabel={formatPerformanceMonthLabel(performancePeriod.performanceMonth)}
                    benefitMonthLabel={formatPerformanceMonthLabel(performancePeriod.benefitMonth)}
                />

                <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
                    {!currentBrand ? (
                        <div>
                            <h2 className="text-lg font-black text-gray-900">어디에서 결제하나요?</h2>
                            <div className="relative mt-4">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={searchQuery}
                                    onChange={event => setSearchQuery(event.target.value)}
                                    placeholder="브랜드 검색"
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-500"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <div className="mt-4 max-h-[55vh] space-y-5 overflow-y-auto pr-1">
                                {categories.map(category => brandsByCategory[category.id] && (
                                    <div key={category.id}>
                                        <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            {category.name}
                                        </p>
                                        <div className="grid grid-cols-4 gap-2">
                                            {brandsByCategory[category.id].map(brand => (
                                                <button
                                                    type="button"
                                                    key={brand.id}
                                                    onClick={() => {
                                                        setSelectedBrandId(brand.id);
                                                        setAmount(0);
                                                        setEligibleItemAmount(undefined);
                                                        setConfirmedConditionIds(new Set());
                                                    }}
                                                    className="flex min-h-20 flex-col items-center justify-center rounded-2xl border border-gray-100 p-2 text-gray-600 transition hover:bg-gray-50"
                                                >
                                                    <IconByName name={brand.iconName || 'Store'} className="mb-2 h-4 w-4" />
                                                    <span className="text-center text-[10px] font-black leading-snug">
                                                        {brand.name}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                                    <IconByName name={currentBrand.iconName || 'Store'} className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400">선택한 브랜드</p>
                                    <p className="text-lg font-black text-gray-900">{currentBrand.name}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedBrandId('')}
                                className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600"
                            >
                                변경
                            </button>
                        </div>
                    )}
                </section>

                {currentBrand && (
                    <>
                        <section className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
                            <label className="ml-1 text-xs font-black text-gray-400">총 결제금액</label>
                            <div className="relative mt-2">
                                <input
                                    value={amount ? amount.toLocaleString() : ''}
                                    onChange={event => {
                                        const value = event.target.value.replace(/\D/g, '').slice(0, 9);
                                        setAmount(value ? Number(value) : 0);
                                    }}
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="w-full rounded-2xl bg-gray-50 p-4 pr-14 text-4xl font-black text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-black text-gray-400">원</span>
                            </div>
                            <div className="mt-4">
                                <NumericKeypad
                                    onValueChange={handleKeypadChange}
                                    onDelete={() => setAmount(value =>
                                        value < 10 ? 0 : Number(String(value).slice(0, -1))
                                    )}
                                />
                            </div>
                        </section>

                        {recommendation?.itemSpecificOffers.length ? (
                            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsItemBenefitOpen(value => !value)}
                                    className="flex w-full items-center justify-between text-left"
                                >
                                    <div>
                                        <p className="text-xs font-black text-amber-900">
                                            특정 상품 행사 {recommendation.itemSpecificOffers.length}개
                                        </p>
                                        <p className="mt-1 text-[10px] text-amber-800/70">
                                            해당 상품을 살 때만 대상 금액을 알려주세요.
                                        </p>
                                    </div>
                                    <ChevronDown className={clsx(
                                        'h-4 w-4 text-amber-700 transition-transform',
                                        isItemBenefitOpen && 'rotate-180'
                                    )} />
                                </button>
                                {isItemBenefitOpen && (
                                    <div className="mt-4 border-t border-amber-200 pt-4">
                                        <div className="space-y-1">
                                            {recommendation.itemSpecificOffers.map(offer => (
                                                <p key={offer.id} className="text-[10px] font-bold text-amber-900">
                                                    {offer.providerName} · {offer.title}
                                                </p>
                                            ))}
                                        </div>
                                        <div className="mt-3 flex items-center gap-2">
                                            <input
                                                value={eligibleItemAmount?.toLocaleString() ?? ''}
                                                onChange={event => {
                                                    const value = event.target.value.replace(/\D/g, '');
                                                    setEligibleItemAmount(value ? Math.min(amount, Number(value)) : undefined);
                                                }}
                                                inputMode="numeric"
                                                placeholder="혜택 대상 상품 합계"
                                                className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm font-black outline-none"
                                            />
                                            <span className="text-xs font-black text-amber-700">원</span>
                                        </div>
                                    </div>
                                )}
                            </section>
                        ) : null}

                        {isRecommending && (
                            <div className="flex items-center justify-center gap-2 py-8 text-xs font-black text-gray-400">
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                                가능한 조합을 비교하고 있어요
                            </div>
                        )}

                        {!isRecommending && amount > 0 && selectedCombination && (
                            <>
                                <section className="overflow-hidden rounded-[2rem] bg-gray-950 p-6 text-white shadow-2xl shadow-gray-200">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 text-emerald-300">
                                                <ShieldCheck className="h-4 w-4" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">확정 최대 혜택</span>
                                            </div>
                                            <p className="mt-2 text-4xl font-black tracking-tight">
                                                {formatWon(selectedCombination.confirmedValue)}
                                            </p>
                                            <p className="mt-2 text-xs font-bold text-gray-400">
                                                {selectedCombination.payProviderName || '직접 결제'} · {
                                                    selectedCombination.cardName ||
                                                    fundingLabel[selectedCombination.fundingType]
                                                }
                                            </p>
                                        </div>
                                        <Sparkles className="h-7 w-7 text-blue-300" />
                                    </div>

                                    <div className="mt-6 grid grid-cols-3 gap-2">
                                        <div className="rounded-2xl bg-white/10 p-3">
                                            <p className="text-[9px] font-black text-gray-400">실결제</p>
                                            <p className="mt-1 text-xs font-black">{formatWon(selectedCombination.payableAmount)}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 p-3">
                                            <p className="text-[9px] font-black text-gray-400">조건부</p>
                                            <p className="mt-1 text-xs font-black text-amber-300">
                                                +{formatWon(selectedCombination.conditionalValue)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 p-3">
                                            <p className="text-[9px] font-black text-gray-400">예상</p>
                                            <p className="mt-1 text-xs font-black text-blue-300">
                                                +{formatWon(selectedCombination.estimatedValue)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedCombination.laterReward > 0 && (
                                        <p className="mt-3 rounded-xl bg-violet-500/15 px-3 py-2 text-[10px] font-bold text-violet-200">
                                            결제 후 적립 {formatWon(selectedCombination.laterReward)} 포함
                                        </p>
                                    )}
                                </section>

                                <section>
                                    <div className="mb-3 flex items-center gap-2 px-1">
                                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                                        <h2 className="text-sm font-black text-gray-900">이 순서로 결제하세요</h2>
                                    </div>
                                    <div className="space-y-3">
                                        {(['DISCOUNT', 'PAY', 'PAYMENT_METHOD'] as BenefitLayer[]).map((layer, index) => (
                                            <React.Fragment key={layer}>
                                                <LayerCard
                                                    layer={layer}
                                                    steps={selectedCombination.steps.filter(step =>
                                                        step.layer === layer ||
                                                        (layer === 'PAY' && step.layer === 'POST_REWARD')
                                                    )}
                                                    fallback={
                                                        layer === 'DISCOUNT'
                                                            ? '별도 선할인 없이 진행'
                                                            : layer === 'PAY'
                                                                ? selectedCombination.payProviderName || '페이 미사용'
                                                                : selectedCombination.cardName || fundingLabel[selectedCombination.fundingType]
                                                    }
                                                    confirmedConditionIds={confirmedConditionIds}
                                                    onConfirm={handleConfirmCondition}
                                                />
                                                {index < 2 && (
                                                    <div className="flex justify-center">
                                                        <ChevronDown className="h-4 w-4 text-gray-300" />
                                                    </div>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </section>

                                {(selectedCombination.warnings.length > 0 ||
                                    selectedCombination.requiredChecks.length > 0) && (
                                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                                        <h2 className="flex items-center gap-2 text-xs font-black text-amber-900">
                                            <AlertCircle className="h-4 w-4" />
                                            결제 전에 확인하세요
                                        </h2>
                                        <ul className="mt-3 space-y-2">
                                            {[...new Set([
                                                ...selectedCombination.requiredChecks,
                                                ...selectedCombination.warnings,
                                            ])].map(item => (
                                                <li key={item} className="flex gap-2 text-[11px] leading-relaxed text-amber-900/80">
                                                    <span>•</span>{item}
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                <button
                                    type="button"
                                    onClick={handleRecord}
                                    disabled={isRecording}
                                    className={clsx(
                                        'flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black shadow-lg transition active:scale-[0.98]',
                                        recordConfirmationId === selectedCombination.id
                                            ? 'bg-red-500 text-white'
                                            : 'bg-gray-900 text-white hover:bg-black',
                                        isRecording && 'cursor-wait opacity-60'
                                    )}
                                >
                                    {isRecording ? (
                                        <LoaderCircle className="h-5 w-5 animate-spin" />
                                    ) : recordConfirmationId === selectedCombination.id ? (
                                        <CheckCircle2 className="h-5 w-5" />
                                    ) : (
                                        <Wallet className="h-5 w-5" />
                                    )}
                                    {isRecording
                                        ? '기록 중'
                                        : recordConfirmationId === selectedCombination.id
                                            ? `${formatWon(selectedCombination.payableAmount)} 결제를 기록할까요?`
                                            : '이 조합으로 결제 기록하기'}
                                </button>

                                {recommendation && recommendation.combinations.length > 1 && (
                                    <section className="space-y-2 pb-8">
                                        <h2 className="mb-3 px-1 text-sm font-black text-gray-900">다른 조합 비교</h2>
                                        {recommendation.combinations.slice(0, 6).map((combination, index) => (
                                            <CombinationSummary
                                                key={combination.id}
                                                combination={combination}
                                                rank={index + 1}
                                                selected={combination.id === selectedCombination.id}
                                                onSelect={() => setSelectedCombinationId(combination.id)}
                                            />
                                        ))}
                                    </section>
                                )}
                            </>
                        )}

                        {!isRecommending && amount > 0 && recommendation &&
                            recommendation.combinations.length === 0 && (
                                <section className="rounded-3xl border border-gray-100 bg-white p-8 text-center">
                                    <AlertCircle className="mx-auto h-8 w-8 text-gray-300" />
                                    <p className="mt-3 text-sm font-black text-gray-800">가능한 결제 조합이 없습니다</p>
                                    <Link
                                        href="/settings"
                                        className="mt-4 inline-flex items-center gap-1 text-xs font-black text-blue-600"
                                    >
                                        보유 혜택 설정 확인
                                        <ChevronRight className="h-3 w-3" />
                                    </Link>
                                </section>
                            )}
                    </>
                )}
            </div>
        </main>
    );
}
