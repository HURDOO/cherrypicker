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
    ShieldCheck,
    Smartphone,
    Sparkles,
    Tag,
    Wallet,
    Wifi,
    WifiOff,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import { IconByName } from '@/components/ui/IconByName';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { MonthlyPerformanceReminder } from '@/components/performance/MonthlyPerformanceReminder';
import { BrandDiscovery } from '@/components/brand/BrandDiscovery';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { useBrandDiscoveryPreferences } from '@/hooks/useBrandDiscoveryPreferences';
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
import {
    FUNDING_TYPE_LABELS,
    getCombinationMethodSummary,
} from '@/utils/combinationPresentation';

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
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black text-gray-400">#{rank} 추천 조합</p>
                    <p className="mt-1 line-clamp-2 text-sm font-black leading-snug text-gray-900">
                        {getCombinationMethodSummary(combination)}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-gray-500">
                        실결제 {formatWon(combination.payableAmount)}
                    </p>
                </div>
                <div className="shrink-0 text-right">
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
        userId,
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
    const amountInputRef = useRef<HTMLInputElement>(null);
    const amountSectionRef = useRef<HTMLElement>(null);
    const {
        favoriteBrandIds,
        defaultViewMode,
        nearbyBrandIds,
        hasCurrentLocation,
        isLocating,
        toggleFavorite,
        requestCurrentLocation,
        recordBrandVisit,
    } = useBrandDiscoveryPreferences(userId);
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
                setSelectedCombinationId(result.combinations[0]?.id);
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

    const handleSelectBrand = (brandId: string) => {
        setSelectedBrandId(brandId);
        setRecommendation(null);
        setSelectedCombinationId(undefined);
        setAmount(0);
        setEligibleItemAmount(undefined);
        setConfirmedConditionIds(new Set());
    };

    const handleRequestLocation = async () => {
        const result = await requestCurrentLocation();
        if (!result.ok) addToast(result.message, 'error');
        return result.ok;
    };

    useEffect(() => {
        if (!currentBrand) return;
        const timer = window.setTimeout(() => {
            amountSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            amountInputRef.current?.focus({ preventScroll: true });
        }, 120);
        return () => window.clearTimeout(timer);
    }, [currentBrand]);

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
            recordBrandVisit(currentBrand.id);
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

                {!currentBrand ? (
                    <BrandDiscovery
                        categories={categories}
                        brands={brands}
                        history={history}
                        favoriteBrandIds={favoriteBrandIds}
                        defaultViewMode={defaultViewMode}
                        nearbyBrandIds={nearbyBrandIds}
                        hasCurrentLocation={hasCurrentLocation}
                        isLocating={isLocating}
                        onSelectBrand={brand => handleSelectBrand(brand.id)}
                        onToggleFavorite={toggleFavorite}
                        onRequestLocation={handleRequestLocation}
                    />
                ) : (
                    <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
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
                                onClick={() => {
                                    setSelectedBrandId('');
                                    setRecommendation(null);
                                    setSelectedCombinationId(undefined);
                                }}
                                className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600"
                            >
                                변경
                            </button>
                        </div>
                    </section>
                )}

                {currentBrand && (
                    <>
                        <section
                            ref={amountSectionRef}
                            className="scroll-mt-24 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm"
                        >
                            <label className="ml-1 text-xs font-black text-gray-400">총 결제금액</label>
                            <div className="relative mt-2">
                                <input
                                    ref={amountInputRef}
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
                                            추가 상품 행사 {recommendation.itemSpecificOffers.length}개
                                        </p>
                                        <p className="mt-1 text-[10px] text-amber-800/70">
                                            매장 전체 기준 최대 혜택에는 포함하지 않았어요.
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
                                                <div key={offer.id} className="rounded-xl bg-white/60 px-3 py-2">
                                                    <p className="text-[10px] font-black text-amber-900">
                                                        {offer.providerName} · {offer.title}
                                                    </p>
                                                    {offer.valueSemantics === 'UP_TO' && (
                                                        <p className="mt-1 text-[9px] font-black text-violet-700">
                                                            최대치 정보 · 정확한 할인 계산에서는 제외
                                                        </p>
                                                    )}
                                                    {(offer.eligibleItemSummary || offer.requiredNote) && (
                                                        <p className="mt-1 text-[9px] font-bold text-amber-800/65">
                                                            {offer.eligibleItemSummary || offer.requiredNote}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {recommendation.itemSpecificOffers.some(offer =>
                                            offer.calculationEligible
                                        ) && <div className="mt-3 flex items-center gap-2">
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
                                        </div>}
                                    </div>
                                )}
                            </section>
                        ) : null}

                        {recommendation?.informationalOffers.length ? (
                            <section className="rounded-3xl border border-violet-200 bg-violet-50 p-4">
                                <p className="text-xs font-black text-violet-900">
                                    계산 제외 참고 혜택 {recommendation.informationalOffers.length}개
                                </p>
                                <p className="mt-1 text-[10px] text-violet-800/70">
                                    최대치·추첨처럼 확정할 수 없는 혜택은 최대 혜택 계산에 포함하지 않았어요.
                                </p>
                                <div className="mt-3 space-y-1 border-t border-violet-200 pt-3">
                                    {recommendation.informationalOffers.map(offer => (
                                        <div key={offer.id} className="rounded-xl bg-white/70 px-3 py-2">
                                            <p className="text-[10px] font-black text-violet-900">
                                                {offer.providerName} · {offer.title}
                                            </p>
                                            <p className="mt-1 text-[9px] font-black text-violet-700">
                                                {offer.valueSemantics === 'UP_TO'
                                                    ? '최대치 정보'
                                                    : '추첨·확률형 정보'} · 정확한 계산에서 제외
                                            </p>
                                            {(offer.eligibleItemSummary || offer.requiredNote) && (
                                                <p className="mt-1 text-[9px] font-bold text-violet-800/65">
                                                    {offer.eligibleItemSummary || offer.requiredNote}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
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
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 text-emerald-300">
                                                <ShieldCheck className="h-4 w-4" />
                                                <span className="text-[10px] font-black uppercase tracking-widest">
                                                    {eligibleItemAmount
                                                        ? '대상 상품 포함 확정 혜택'
                                                        : '매장 전체 기준 확정 혜택'}
                                                </span>
                                            </div>
                                            <p className="mt-2 text-4xl font-black tracking-tight">
                                                {formatWon(selectedCombination.confirmedValue)}
                                            </p>
                                            <p className="mt-3 text-[9px] font-black uppercase tracking-[0.16em] text-gray-500">
                                                사용 수단
                                            </p>
                                            <p
                                                data-testid="recommendation-method-summary"
                                                className="mt-1 text-sm font-black leading-relaxed text-gray-100"
                                            >
                                                {getCombinationMethodSummary(selectedCombination)}
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
                                                                : selectedCombination.cardName || FUNDING_TYPE_LABELS[selectedCombination.fundingType]
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
