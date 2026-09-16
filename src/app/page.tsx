'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    AlertCircle,
    ArrowRight,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Coins,
    CreditCard,
    Gift,
    LoaderCircle,
    ShieldCheck,
    Smartphone,
    Sparkles,
    Store,
    Tag,
    Target,
    Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import { IconByName } from '@/components/ui/IconByName';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { MonthlyPerformanceReminder } from '@/components/performance/MonthlyPerformanceReminder';
import { BrandDiscovery } from '@/components/brand/BrandDiscovery';
import { CardBenefitSupportCard } from '@/components/catalog/CardBenefitSupportCard';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { useBenefitCatalog } from '@/hooks/useBenefitCatalog';
import { useBrandDiscoveryPreferences } from '@/hooks/useBrandDiscoveryPreferences';
import type {
    BenefitCombination,
    BenefitLayer,
    CombinationStep,
    PaymentTarget,
    RecommendationPriority,
    RecommendationRequest,
    RecommendationResponse,
    TransactionHistory,
} from '@/types';
import {
    formatPerformanceMonthLabel,
    getCurrentMonthInKst,
    getNextMonthInKst,
    getPreviousMonthInKst,
} from '@/lib/monthly-performance';
import {
    BENEFIT_STATUS_LABELS,
    FUNDING_TYPE_LABELS,
    getCombinationMethodSummary,
    getCombinationRecommendationReason,
    getUnresolvedConditionSteps,
} from '@/utils/combinationPresentation';
import { calculateBestCombinations } from '@/utils/combination';
import { buildPromotionUsage } from '@/utils/promotionUsage';
import {
    getCombinationIntent,
    type CombinationIntent,
} from '@/utils/recommendationPreferences';
import { derivePerformanceGoals } from '@/utils/performanceGoals';
import { selectAvailableCards } from '@/utils/availableCards';
import { rankBenefitBrandSuggestions } from '@/utils/benefitBrandSuggestions';
import { getPurchaseScenarios, type PurchaseScenario } from '@/utils/purchaseScenario';
import { getFirstSetupRoute } from '@/utils/firstSetupRoutes';
import {
    GENERAL_PAYMENT_LABEL,
    getPaymentTargetHref,
    normalizeGeneralPaymentLabel,
    toPaymentTargetSnapshot,
} from '@/utils/paymentTarget';

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
    const confirmationId = step.confirmationId ?? step.promotionId;
    const canConfirm = Boolean(step.requiresConfirmation && confirmationId);
    const statusColor = {
        CONFIRMED: 'bg-emerald-100 text-emerald-700',
        CONDITIONAL: 'bg-amber-100 text-amber-800',
        ESTIMATED: 'bg-violet-100 text-violet-700',
    }[step.certainty];
    return (
        <div className="rounded-2xl border border-gray-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                            {step.providerName}
                        </p>
                        <span className={clsx(
                            'rounded-full px-2 py-0.5 text-[9px] font-black',
                            statusColor,
                        )}>
                            {BENEFIT_STATUS_LABELS[step.certainty]}
                        </span>
                    </div>
                    <p className="mt-1 text-xs font-black leading-snug text-gray-900">
                        {step.title}
                    </p>
                </div>
                <span className="shrink-0 text-sm font-black text-gray-900">
                    {step.certainty === 'ESTIMATED' && '참고 '}+{formatWon(step.benefitAmount)}
                </span>
            </div>
            {step.warning && (
                <p className="mt-2 text-[10px] leading-relaxed text-amber-700">
                    {step.warning}
                </p>
            )}
            {canConfirm && (
                <button
                    type="button"
                    onClick={() => onConfirm(confirmationId!)}
                    aria-pressed={confirmed}
                    aria-label={`${step.title} 조건 ${confirmed ? '확인 완료' : '미확인'}`}
                    className={clsx(
                        'mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black',
                        confirmed
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-800'
                    )}
                >
                    {confirmed
                        ? <Check className="h-3 w-3" aria-hidden="true" />
                        : <AlertCircle className="h-3 w-3" aria-hidden="true" />}
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
                                (step.confirmationId ?? step.promotionId) &&
                                confirmedConditionIds.has(step.confirmationId ?? step.promotionId!)
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
    priority,
    smallBenefitThreshold,
    onSelect,
}: {
    combination: BenefitCombination;
    rank: number;
    selected: boolean;
    priority: RecommendationPriority;
    smallBenefitThreshold: number;
    onSelect: () => void;
}) {
    const intent = getCombinationIntent(combination, smallBenefitThreshold, priority);
    const hasPotentialBenefit = combination.conditionalValue + combination.estimatedValue > 0;
    const intentLabel: Record<CombinationIntent, string> = {
        BENEFIT: '이번 결제 혜택',
        SMALL_BENEFIT: `소액 혜택 · ${smallBenefitThreshold.toLocaleString()}원 미만`,
        PERFORMANCE: combination.performanceProgress?.targetReached
            ? '다음 달 혜택 목표 달성'
            : '다음 달 실적 채우기',
        NO_BENEFIT: '즉시 혜택 없음',
    };
    return (
        <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={clsx(
                'w-full rounded-2xl border p-4 text-left transition-all',
                selected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                    : 'border-gray-100 bg-white hover:border-gray-300'
            )}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-[10px] font-black text-gray-400">#{rank} 추천 조합</p>
                        <span className={clsx(
                            'rounded-full px-2 py-0.5 text-[9px] font-black',
                            intent === 'PERFORMANCE' && 'bg-violet-100 text-violet-700',
                            intent === 'SMALL_BENEFIT' && 'bg-amber-100 text-amber-700',
                            intent === 'BENEFIT' && 'bg-blue-100 text-blue-700',
                            intent === 'NO_BENEFIT' && 'bg-gray-100 text-gray-500',
                        )}>
                            {intentLabel[intent]}
                        </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-black leading-snug text-gray-900">
                        {getCombinationMethodSummary(combination)}
                    </p>
                    <p className="mt-1 text-[10px] font-bold text-gray-500">
                        확정 혜택 적용 후 결제{' '}
                        {formatWon(combination.payableAmount)}
                    </p>
                    {hasPotentialBenefit && combination.potentialPayableAmount !== undefined && (
                        <p className="mt-0.5 text-[10px] font-bold text-amber-600">
                            조건·정보 반영 시 {formatWon(combination.potentialPayableAmount)}
                        </p>
                    )}
                    {combination.performanceProgress && (
                        <p className="mt-1 text-[10px] font-black text-violet-700">
                            {intent === 'PERFORMANCE' ? '실적 우선 판단' : '실적 참고'} ·{' '}
                            {combination.performanceProgress.targetReached
                                ? '목표 달성 예상'
                                : `${formatWon(combination.performanceProgress.remainingAfter)} 남음`}
                        </p>
                    )}
                </div>
                <div className="shrink-0 text-right">
                    <p className={clsx(
                        'text-lg font-black',
                        intent === 'SMALL_BENEFIT' ? 'text-amber-600' : 'text-blue-600',
                    )}>
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

function HomePageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const guidedFirstRecommendation = pathname === '/setup/recommendation';
    const {
        userId,
        storageMode,
        categories: serverCategories,
        brands: serverBrands,
        cards: serverCards,
        rules: serverRules,
        history,
        performances,
        benefitProfile,
        workspacePreferences,
        isLoading,
        appDataError,
        selectedBrandId,
        setSelectedBrandId,
        addTransaction,
        updatePerformance,
        setWorkspacePreferences,
    } = useAppStore();
    const addToast = useToastStore(state => state.addToast);
    const {
        snapshot: catalog,
        isLoading: isCatalogLoading,
        error: catalogError,
    } = useBenefitCatalog();
    const [amount, setAmount] = useState(0);
    const [eligibleItemAmount, setEligibleItemAmount] = useState<number | undefined>();
    const [isOnlinePurchase, setIsOnlinePurchase] = useState(false);
    const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
    const [isRecommending, setIsRecommending] = useState(false);
    const [selectedCombinationId, setSelectedCombinationId] = useState<string>();
    const [recommendationPriority, setRecommendationPriority] =
        useState<RecommendationPriority>('BENEFIT');
    const [confirmedConditionIds, setConfirmedConditionIds] = useState<Set<string>>(new Set());
    const [suggestedSimulationAmount, setSuggestedSimulationAmount] = useState<number>();
    const [isItemBenefitOpen, setIsItemBenefitOpen] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordReceipt, setRecordReceipt] = useState<{
        transaction: TransactionHistory;
        performanceBefore?: number;
        performanceAfter?: number;
    }>();
    const [isGeneralPaymentSelected, setIsGeneralPaymentSelected] = useState(false);
    const [selectedPurchaseScenarioId, setSelectedPurchaseScenarioId] = useState('');
    const [generalPaymentLabel, setGeneralPaymentLabel] = useState(GENERAL_PAYMENT_LABEL);
    const recommendationVersion = useRef(0);
    const recordInFlight = useRef(false);
    const firstSetupCompletionInFlight = useRef(false);
    const firstSetupRouteSyncInFlight = useRef(false);
    const firstRecommendationGuideRef = useRef<HTMLElement>(null);
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
            nextBenefitMonth: getNextMonthInKst(referenceDate),
        };
    });

    const categories = useMemo(
        () => catalog
            ? [...catalog.categories, ...serverCategories.filter(category => category.userId)]
            : serverCategories,
        [catalog, serverCategories]
    );
    const brands = useMemo(
        () => catalog
            ? [...catalog.brands, ...serverBrands.filter(brand => brand.userId)]
            : serverBrands,
        [catalog, serverBrands]
    );
    const cards = useMemo(
        () => catalog
            ? [...catalog.cards, ...serverCards.filter(card => card.userId)]
            : serverCards,
        [catalog, serverCards]
    );
    const rules = useMemo(
        () => catalog
            ? [...catalog.rules, ...serverRules.filter(rule => rule.userId)]
            : serverRules,
        [catalog, serverRules]
    );

    const urlBrandId = searchParams.get('brand');
    const urlSelectsGeneralPayment = searchParams.get('general') === '1';
    const urlPurchaseScenarioId = searchParams.get('scenario');
    const recommendationCards = useMemo(
        () => selectAvailableCards({
            cards,
            performances,
            history,
            selectedSystemCardIds: workspacePreferences.selectedSystemCardIds,
        }),
        [cards, history, performances, workspacePreferences.selectedSystemCardIds]
    );
    const purchaseScenarios = useMemo(() => getPurchaseScenarios(
        rules,
        new Set(recommendationCards.map(card => card.id)),
    ), [recommendationCards, rules]);

    useEffect(() => {
        if (storageMode === 'guest' && urlPurchaseScenarioId && purchaseScenarios.some(scenario => (
            scenario.id === urlPurchaseScenarioId
        ))) {
            setSelectedBrandId('');
            setIsGeneralPaymentSelected(false);
            setSelectedPurchaseScenarioId(urlPurchaseScenarioId);
            return;
        }
        setSelectedPurchaseScenarioId('');
        if (urlSelectsGeneralPayment) {
            setSelectedBrandId('');
            setIsGeneralPaymentSelected(true);
            return;
        }
        setIsGeneralPaymentSelected(false);
        setGeneralPaymentLabel(GENERAL_PAYMENT_LABEL);
        setSelectedBrandId(
            urlBrandId && brands.some(brand => brand.id === urlBrandId)
                ? urlBrandId
                : ''
        );
    }, [brands, purchaseScenarios, setSelectedBrandId, storageMode, urlBrandId,
        urlPurchaseScenarioId, urlSelectsGeneralPayment]);

    const currentBrand = useMemo(
        () => brands.find(brand => brand.id === selectedBrandId),
        [brands, selectedBrandId]
    );
    const currentPurchaseScenario = useMemo(
        () => purchaseScenarios.find(scenario => scenario.id === selectedPurchaseScenarioId),
        [purchaseScenarios, selectedPurchaseScenarioId]
    );
    const currentPaymentTarget = useMemo<PaymentTarget | undefined>(() => {
        if (currentBrand) return { kind: 'BRAND', brand: currentBrand };
        if (currentPurchaseScenario) return {
            kind: 'SCENARIO',
            scenarioId: currentPurchaseScenario.id,
            label: currentPurchaseScenario.label,
        };
        if (isGeneralPaymentSelected) {
            return { kind: 'GENERAL', label: generalPaymentLabel };
        }
        return undefined;
    }, [currentBrand, currentPurchaseScenario, generalPaymentLabel, isGeneralPaymentSelected]);
    const currentPaymentTargetLabel = currentPaymentTarget?.kind === 'BRAND'
        ? currentPaymentTarget.brand.name
        : currentPaymentTarget?.label;
    const currentPerformances = useMemo(
        () => performances.filter(
            performance => performance.performanceMonth === performancePeriod.performanceMonth
        ),
        [performances, performancePeriod.performanceMonth]
    );
    const promotionUsage = useMemo(() => buildPromotionUsage(history), [history]);
    const benefitBrandSuggestionResult = useMemo(
        () => guidedFirstRecommendation && !currentPaymentTarget && catalog
            ? rankBenefitBrandSuggestions({
                brands,
                cards: recommendationCards,
                rules,
                history,
                performances: currentPerformances,
                promotions: catalog.promotions,
                providers: catalog.providers,
                profile: benefitProfile,
                favoriteBrandIds,
                routeVerifications: catalog.routeVerifications,
                promotionUsage,
                performanceBenefitMonth: performancePeriod.nextBenefitMonth,
                isOnline: isOnlinePurchase,
            })
            : { suggestions: [], opportunityCount: 0 },
        [
            benefitProfile,
            brands,
            catalog,
            currentPaymentTarget,
            currentPerformances,
            favoriteBrandIds,
            guidedFirstRecommendation,
            history,
            isOnlinePurchase,
            performancePeriod.nextBenefitMonth,
            promotionUsage,
            recommendationCards,
            rules,
        ]
    );
    const benefitBrandSuggestions = benefitBrandSuggestionResult.suggestions;
    const incompleteTelecomProvider = useMemo(() => {
        const membership = benefitProfile.telecomMemberships.find(item => (
            !item.tier?.trim() || (item.providerId === 'skt' && !item.mode)
        ));
        if (!membership || !catalog) return undefined;
        const hasTierSpecificOffers = catalog.promotions.some(offer => (
            offer.providerId === membership.providerId &&
            (offer.condition.telecomTiers?.length ?? 0) > 0
        ));
        if (!hasTierSpecificOffers) return undefined;
        return catalog.providers.find(provider => provider.id === membership.providerId);
    }, [benefitProfile.telecomMemberships, catalog]);
    const performanceGoals = useMemo(() => {
        if (!currentPaymentTarget || amount <= 0) return [];
        return derivePerformanceGoals({
            cards: recommendationCards,
            rules,
            performances,
            performanceMonth: performancePeriod.benefitMonth,
            target: currentPaymentTarget,
            amount,
            isOnline: isOnlinePurchase,
        });
    }, [
        amount,
        currentPaymentTarget,
        isOnlinePurchase,
        performances,
        performancePeriod.benefitMonth,
        recommendationCards,
        rules,
    ]);
    const effectiveRecommendationPriority: RecommendationPriority = performanceGoals.length > 0
        ? recommendationPriority
        : 'BENEFIT';
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
        if (!catalog && catalogError) {
            addToast(
                getErrorMessage(catalogError, '최신 혜택 정보를 불러오지 못했습니다.'),
                'error'
            );
        }
    }, [addToast, catalog, catalogError]);

    useEffect(() => {
        if (!currentPaymentTarget || amount <= 0) {
            recommendationVersion.current += 1;
            setIsRecommending(false);
            setRecommendation(null);
            setSelectedCombinationId(undefined);
            return;
        }
        if (!catalog && isCatalogLoading) {
            setIsRecommending(true);
            return;
        }
        const version = recommendationVersion.current + 1;
        recommendationVersion.current = version;
        const timer = window.setTimeout(async () => {
            setIsRecommending(true);
            try {
                const requestBase = {
                    amount,
                    ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                    isOnline: isOnlinePurchase,
                    confirmedConditionIds: [...confirmedConditionIds],
                    priority: effectiveRecommendationPriority,
                };
                const serverRequest = currentPaymentTarget.kind === 'BRAND'
                    ? {
                        ...requestBase,
                        brandId: currentPaymentTarget.brand.id,
                    } satisfies RecommendationRequest
                    : undefined;
                if (!catalog && storageMode === 'guest') {
                    throw new Error('최신 혜택 정보를 받은 뒤 기기에서 계산할 수 있습니다.');
                }
                const result = catalog
                    ? calculateBestCombinations(
                        {
                            ...requestBase,
                            target: currentPaymentTarget,
                            cards: recommendationCards,
                            rules,
                            history,
                            performances: currentPerformances,
                            performanceGoals,
                            performanceBenefitMonth: performancePeriod.nextBenefitMonth,
                            promotions: catalog.promotions,
                            providers: catalog.providers,
                            profile: benefitProfile,
                            routeVerifications: catalog.routeVerifications,
                            brandCategoryById: new Map(catalog.brands.map(brand => [
                                brand.id,
                                brand.categoryId,
                            ])),
                            promotionUsage,
                        },
                        process.env.NODE_ENV === 'development'
                            ? {
                                onMetrics: metrics => {
                                    if (metrics.durationMs > 50 || metrics.searchSpaceLimited) {
                                        console.warn('브라우저 추천 계산 성능', metrics);
                                    } else {
                                        console.debug('브라우저 추천 계산 성능', metrics);
                                    }
                                },
                            }
                            : undefined,
                    )
                    : serverRequest
                        ? await apiClient.getRecommendation(serverRequest)
                        : (() => {
                            throw new Error('일반 결제 추천은 기기 저장 모드에서 사용할 수 있습니다.');
                        })();
                if (recommendationVersion.current !== version) return;
                setRecommendation(result);
                setSelectedCombinationId(result.combinations[0]?.id);

                if (
                    catalog &&
                    serverRequest &&
                    effectiveRecommendationPriority === 'BENEFIT' &&
                    process.env.NODE_ENV === 'development'
                ) {
                    void apiClient.getRecommendation(serverRequest)
                        .then(serverResult => {
                            if (JSON.stringify(serverResult) !== JSON.stringify(result)) {
                                console.warn('브라우저와 서버 추천 결과가 다릅니다.', {
                                    browser: result,
                                    server: serverResult,
                                });
                            }
                        })
                        .catch(() => undefined);
                }
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
        benefitProfile,
        catalog,
        confirmedConditionIds,
        currentPaymentTarget,
        currentPerformances,
        eligibleItemAmount,
        effectiveRecommendationPriority,
        history,
        isCatalogLoading,
        isOnlinePurchase,
        promotionUsage,
        recommendationCards,
        performanceGoals,
        performancePeriod.nextBenefitMonth,
        rules,
        storageMode,
    ]);

    const selectedCombination = recommendation?.combinations.find(
        item => item.id === selectedCombinationId
    ) ?? recommendation?.combinations[0];
    const selectedCombinationIntent = selectedCombination
        ? getCombinationIntent(
            selectedCombination,
            benefitProfile.smallBenefitThreshold,
            effectiveRecommendationPriority,
        )
        : undefined;
    const selectedCombinationReason = selectedCombination
        ? getCombinationRecommendationReason(
            selectedCombination,
            benefitProfile.smallBenefitThreshold,
            effectiveRecommendationPriority,
        )
        : undefined;
    const unresolvedConditionSteps = selectedCombination
        ? getUnresolvedConditionSteps(selectedCombination)
        : [];
    const selectedCard = selectedCombination?.cardId
        ? cards.find(card => card.id === selectedCombination.cardId)
        : undefined;
    const selectedCardSupport = selectedCombination?.cardId
        ? catalog?.cardBenefitSupports.find(
            support => support.cardId === selectedCombination.cardId
        )
        : undefined;

    useEffect(() => {
        if (
            workspacePreferences.firstSetup.status !== 'AWAITING_RECOMMENDATION' ||
            recommendation === null ||
            firstSetupCompletionInFlight.current
        ) return;

        firstSetupCompletionInFlight.current = true;
        const next = {
            ...workspacePreferences,
            firstSetup: {
                status: 'COMPLETED' as const,
                step: 'RECOMMENDATION' as const,
                completedAt: new Date().toISOString(),
            },
        };
        void localWorkspaceClient.updateWorkspacePreferences(next)
            .then(saved => {
                setWorkspacePreferences(saved);
                addToast('첫 설정을 마쳤어요. 다음부터 바로 추천을 받을 수 있습니다.', 'success');
            })
            .catch(error => addToast(
                getErrorMessage(error, '첫 설정 완료 상태를 저장하지 못했습니다.'),
                'error'
            ))
            .finally(() => {
                firstSetupCompletionInFlight.current = false;
            });
    }, [
        addToast,
        recommendation,
        setWorkspacePreferences,
        workspacePreferences,
    ]);

    const shouldRedirectHomeToSetup = !guidedFirstRecommendation &&
        workspacePreferences.firstSetup.status !== 'COMPLETED';
    const isGuidedRouteSyncNeeded = guidedFirstRecommendation &&
        workspacePreferences.firstSetup.status === 'IN_PROGRESS' &&
        Boolean(workspacePreferences.selectedSystemCardIds?.length);
    const shouldRedirectGuidedSetup = guidedFirstRecommendation && (
        workspacePreferences.firstSetup.status === 'NOT_STARTED' ||
        (
            workspacePreferences.firstSetup.status === 'IN_PROGRESS' &&
            !workspacePreferences.selectedSystemCardIds?.length
        ) ||
        (
            workspacePreferences.firstSetup.status === 'COMPLETED' &&
            recommendation === null
        )
    );

    useEffect(() => {
        if (
            isLoading ||
            appDataError ||
            !isGuidedRouteSyncNeeded ||
            firstSetupRouteSyncInFlight.current
        ) return;

        firstSetupRouteSyncInFlight.current = true;
        const next = {
            ...workspacePreferences,
            firstSetup: {
                status: 'AWAITING_RECOMMENDATION' as const,
                step: 'RECOMMENDATION' as const,
            },
        };
        void localWorkspaceClient.updateWorkspacePreferences(next)
            .then(saved => setWorkspacePreferences(saved))
            .catch(error => {
                addToast(
                    getErrorMessage(error, '첫 추천 단계를 이 브라우저에 저장하지 못했습니다.'),
                    'error'
                );
                router.replace(getFirstSetupRoute(workspacePreferences));
            })
            .finally(() => {
                firstSetupRouteSyncInFlight.current = false;
            });
    }, [
        addToast,
        appDataError,
        isGuidedRouteSyncNeeded,
        isLoading,
        router,
        setWorkspacePreferences,
        workspacePreferences,
    ]);

    useEffect(() => {
        if (isLoading || appDataError) return;
        if (shouldRedirectHomeToSetup) {
            router.replace(getFirstSetupRoute(workspacePreferences));
            return;
        }
        if (!shouldRedirectGuidedSetup) return;
        router.replace(
            workspacePreferences.firstSetup.status === 'COMPLETED'
                ? '/'
                : getFirstSetupRoute(workspacePreferences)
        );
    }, [
        appDataError,
        isLoading,
        router,
        shouldRedirectGuidedSetup,
        shouldRedirectHomeToSetup,
        workspacePreferences,
    ]);

    const handleKeypadChange = (value: string) => {
        setRecordReceipt(undefined);
        setAmount(current => {
            if (current === 0) return value === '0' || value === '00' ? 0 : Number(value);
            const next = `${current}${value}`;
            return next.length > 9 ? current : Number(next);
        });
    };

    const handleConfirmCondition = (promotionId: string) => {
        setRecordReceipt(undefined);
        setConfirmedConditionIds(current => {
            const next = new Set(current);
            if (next.has(promotionId)) next.delete(promotionId);
            else next.add(promotionId);
            return next;
        });
    };

    const handleSelectBrand = (brandId: string, simulationAmount?: number) => {
        const brand = brands.find(item => item.id === brandId);
        if (!brand) return;
        setIsGeneralPaymentSelected(false);
        setSelectedPurchaseScenarioId('');
        setGeneralPaymentLabel(GENERAL_PAYMENT_LABEL);
        setSelectedBrandId(brandId);
        setRecommendation(null);
        setSelectedCombinationId(undefined);
        setRecordReceipt(undefined);
        setAmount(0);
        setSuggestedSimulationAmount(simulationAmount);
        setEligibleItemAmount(undefined);
        setConfirmedConditionIds(new Set());
        router.push(getPaymentTargetHref(pathname, {
            kind: 'BRAND',
            brandId: brand.id,
            label: brand.name,
        }), { scroll: false });
    };

    const handleSelectGeneralPayment = (label?: string) => {
        setSelectedBrandId('');
        setSelectedPurchaseScenarioId('');
        setIsGeneralPaymentSelected(true);
        setGeneralPaymentLabel(normalizeGeneralPaymentLabel(label));
        setRecommendation(null);
        setSelectedCombinationId(undefined);
        setRecordReceipt(undefined);
        setAmount(0);
        setSuggestedSimulationAmount(undefined);
        setEligibleItemAmount(undefined);
        setConfirmedConditionIds(new Set());
        router.push(getPaymentTargetHref(pathname, {
            kind: 'GENERAL',
            label: normalizeGeneralPaymentLabel(label),
        }), { scroll: false });
    };

    const handleSelectPurchaseScenario = (scenario: PurchaseScenario) => {
        setSelectedBrandId('');
        setIsGeneralPaymentSelected(false);
        setSelectedPurchaseScenarioId(scenario.id);
        setRecommendation(null);
        setSelectedCombinationId(undefined);
        setRecordReceipt(undefined);
        setAmount(0);
        setSuggestedSimulationAmount(undefined);
        setEligibleItemAmount(undefined);
        setConfirmedConditionIds(new Set());
        router.push(getPaymentTargetHref(pathname, {
            kind: 'SCENARIO',
            scenarioId: scenario.id,
            label: scenario.label,
        }), { scroll: false });
    };

    const handleClearPaymentTarget = () => {
        setSelectedBrandId('');
        setSelectedPurchaseScenarioId('');
        setIsGeneralPaymentSelected(false);
        setGeneralPaymentLabel(GENERAL_PAYMENT_LABEL);
        setSuggestedSimulationAmount(undefined);
        setRecommendation(null);
        setSelectedCombinationId(undefined);
        setRecordReceipt(undefined);
        setAmount(0);
        setEligibleItemAmount(undefined);
        setConfirmedConditionIds(new Set());
        router.push(getPaymentTargetHref(pathname), { scroll: false });
    };

    const handleRequestLocation = async () => {
        const result = await requestCurrentLocation();
        if (!result.ok) addToast(result.message, 'error');
        return result.ok;
    };

    useEffect(() => {
        if (!currentPaymentTarget) return;
        const timer = window.setTimeout(() => {
            amountSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            amountInputRef.current?.focus({ preventScroll: true });
        }, 120);
        return () => window.clearTimeout(timer);
    }, [currentPaymentTarget]);

    useEffect(() => {
        if (!guidedFirstRecommendation || recommendation === null || isRecommending) return;
        const timer = window.setTimeout(() => {
            firstRecommendationGuideRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
            firstRecommendationGuideRef.current?.focus({ preventScroll: true });
        }, 120);
        return () => window.clearTimeout(timer);
    }, [guidedFirstRecommendation, isRecommending, recommendation]);

    const handleRecord = async () => {
        if (
            !currentPaymentTarget ||
            !selectedCombination ||
            amount <= 0 ||
            recordReceipt ||
            recordInFlight.current
        ) return;
        const unresolvedConditions = getUnresolvedConditionSteps(selectedCombination);
        if (unresolvedConditions.length > 0) {
            addToast('조건 충족 여부를 확인하거나 다른 조합을 선택해주세요.', 'error');
            return;
        }
        recordInFlight.current = true;
        setIsRecording(true);
        try {
            const currentPerformance = selectedCombination.cardId
                ? performances.find(item => (
                    item.cardId === selectedCombination.cardId &&
                    item.performanceMonth === performancePeriod.benefitMonth
                ))
                : undefined;
            const transaction = storageMode === 'guest'
                ? await localWorkspaceClient.createTransaction({
                    paymentTarget: toPaymentTargetSnapshot(currentPaymentTarget),
                    amount,
                    ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                    combination: selectedCombination,
                    ...(selectedCombination.cardId && {
                        card: cards.find(card => card.id === selectedCombination.cardId),
                    }),
                    catalogVersion: catalog?.catalogVersion ?? 'unknown',
                })
                    : currentPaymentTarget.kind === 'BRAND'
                    ? await apiClient.createCombinationTransaction({
                        brandId: currentPaymentTarget.brand.id,
                        amount,
                        ...(eligibleItemAmount !== undefined && { eligibleItemAmount }),
                        isOnline: isOnlinePurchase,
                        confirmedConditionIds: [...confirmedConditionIds],
                        combinationId: selectedCombination.id,
                    })
                    : (() => {
                        throw new Error('일반 결제 기록은 기기 저장 모드에서 사용할 수 있습니다.');
                    })();
            addTransaction(transaction);
            if (transaction.cardId && transaction.performanceContributionAmount) {
                updatePerformance({
                    cardId: transaction.cardId,
                    performanceMonth: performancePeriod.benefitMonth,
                    amount: (currentPerformance?.amount ?? 0) +
                        transaction.performanceContributionAmount,
                    ...(currentPerformance?.targetAmount !== undefined && {
                        targetAmount: currentPerformance.targetAmount,
                    }),
                });
            }
            if (currentPaymentTarget.kind === 'BRAND') {
                recordBrandVisit(currentPaymentTarget.brand.id);
            }
            const performanceBefore = currentPerformance?.amount ?? 0;
            const performanceAfter = transaction.performanceContribution?.status === 'UNKNOWN'
                ? undefined
                : transaction.performanceContribution
                ? performanceBefore + transaction.performanceContribution.amount
                : transaction.performanceContributionAmount
                    ? performanceBefore + transaction.performanceContributionAmount
                    : undefined;
            setRecordReceipt({
                transaction,
                ...(performanceAfter !== undefined && {
                    performanceBefore,
                    performanceAfter,
                }),
            });
            addToast(
                transaction.performanceContribution?.status === 'UNKNOWN'
                    ? '결제를 기록했어요 · 카드 실적 반영 여부는 카드사에서 확인해주세요.'
                    : transaction.performanceContributionAmount
                    ? `기록 완료 · 예상 실적에 ${formatWon(transaction.performanceContributionAmount)} 반영`
                    : '선택한 혜택 조합을 기록했습니다.',
                'success'
            );
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

    if (appDataError) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-8 text-center">
                <AlertCircle className="mb-4 h-10 w-10 text-rose-400" aria-hidden="true" />
                <h1 className="text-xl font-black text-gray-900">
                    {appDataError.kind === 'INDEXED_DB_UNAVAILABLE'
                        ? '이 브라우저에서는 기기 저장소를 사용할 수 없어요'
                        : '기기 저장 데이터를 열지 못했어요'}
                </h1>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
                    {appDataError.kind === 'INDEXED_DB_UNAVAILABLE'
                        ? '설정과 실적을 안전하게 보관하려면 일반 Chrome 또는 Safari에서 다시 열어주세요.'
                        : `${appDataError.message} 브라우저 저장 공간과 권한을 확인한 뒤 다시 시도해주세요.`}
                </p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="mt-6 min-h-12 rounded-2xl bg-gray-900 px-6 text-sm font-black text-white"
                >
                    다시 시도
                </button>
            </div>
        );
    }

    if (shouldRedirectHomeToSetup || shouldRedirectGuidedSetup || isGuidedRouteSyncNeeded) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gray-50">
                <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" aria-label="화면 이동 중" />
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
        <main className="min-h-screen bg-gray-50 pb-20">
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white/90 px-4 py-2.5 backdrop-blur">
                <h1 className="flex items-center gap-1.5 text-[17px] font-black tracking-[-0.025em] text-gray-900">
                    <span className="text-xl">🍒</span> Cherry Picker
                </h1>
                <button
                    type="button"
                    aria-pressed={isOnlinePurchase}
                    onClick={() => {
                        setRecordReceipt(undefined);
                        setIsOnlinePurchase(value => !value);
                    }}
                    className={clsx(
                        'flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-black',
                        isOnlinePurchase
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-gray-200 bg-gray-100 text-gray-600'
                    )}
                >
                    {isOnlinePurchase
                        ? <Smartphone className="h-3 w-3" />
                        : <Store className="h-3 w-3" />}
                    {isOnlinePurchase ? '온라인 결제' : '매장 결제'}
                </button>
            </header>

            <div className="mx-auto max-w-lg space-y-5 px-3 pt-4">
                {guidedFirstRecommendation && (
                    <section
                        ref={firstRecommendationGuideRef}
                        tabIndex={-1}
                        aria-live="polite"
                        className="setup-route-enter scroll-mt-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500 p-5 text-white shadow-xl shadow-blue-100 outline-none"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-black text-blue-100">첫 추천 튜토리얼</p>
                            <p className="text-xs font-black text-white">
                                {!currentPaymentTarget ? '1' : amount <= 0 ? '2' : '3'}/3
                            </p>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-1" aria-label="첫 추천 진행률">
                            {[1, 2, 3].map(item => {
                                const activeStep = !currentPaymentTarget ? 1 : amount <= 0 ? 2 : 3;
                                return (
                                    <span
                                        key={item}
                                        className={clsx(
                                            'h-1.5 rounded-full',
                                            item <= activeStep ? 'bg-white' : 'bg-white/25'
                                        )}
                                    />
                                );
                            })}
                        </div>
                        <div className="mt-5 flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                                {recommendation !== null && !isRecommending
                                    ? <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                                    : <Sparkles className="h-6 w-6" aria-hidden="true" />}
                            </div>
                            <div>
                                <h2 className="text-xl font-black leading-tight">
                                    {!currentPaymentTarget
                                        ? '1. 브랜드를 선택해보세요'
                                        : amount <= 0
                                            ? '2. 결제 금액을 입력하세요'
                                            : isRecommending || recommendation === null
                                                ? '3. 혜택을 찾고 있어요'
                                                : selectedCombination
                                                    ? '혜택을 찾았어요. 짜잔!'
                                                    : '첫 추천 확인 완료!'}
                                </h2>
                                <p className="mt-2 text-xs font-bold leading-relaxed text-blue-100">
                                    {!currentPaymentTarget
                                        ? incompleteTelecomProvider
                                            ? `${incompleteTelecomProvider.name} 혜택 유형과 등급을 고르면 제휴 혜택과 금액을 정확히 시뮬레이션할 수 있어요.`
                                            : benefitBrandSuggestions.length > 0
                                            ? `내 혜택 설정으로 바로 계산되는 브랜드 ${benefitBrandSuggestionResult.opportunityCount.toLocaleString()}곳을 찾았어요. 아래 추천 중 하나로 금액까지 체험해보세요.`
                                            : '현재 조건에서 확정 혜택 브랜드가 없으면 아래에서 자주 가는 매장 하나를 눌러보세요.'
                                        : amount <= 0
                                            ? suggestedSimulationAmount
                                                ? `${currentPaymentTargetLabel}에서 직접 금액을 입력하거나, 추천 예시 ${formatWon(suggestedSimulationAmount)}으로 체험해보세요.`
                                                : `${currentPaymentTargetLabel} 금액을 숫자로 입력해보세요.`
                                            : isRecommending || recommendation === null
                                                ? '내 카드와 함께 쓸 수 있는 혜택을 이 기기에서 비교하고 있습니다.'
                                                : selectedCombination
                                                    ? `${formatWon(amount)} 결제에서 확정 혜택 ${formatWon(selectedCombination.confirmedValue)}을 찾았어요.`
                                                    : '이 조건에 맞는 혜택이 없어도 준비는 모두 끝났어요.'}
                                </p>
                            </div>
                        </div>
                        {!currentPaymentTarget && incompleteTelecomProvider && (
                            <Link
                                href="/setup/benefits"
                                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/15 px-4 text-xs font-black text-white transition hover:bg-white/25"
                            >
                                {incompleteTelecomProvider.name} 설정 마치기
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        )}
                        {recommendation !== null && !isRecommending && (
                            <button
                                type="button"
                                disabled={workspacePreferences.firstSetup.status !== 'COMPLETED'}
                                onClick={() => {
                                    setSelectedBrandId('');
                                    router.push('/');
                                }}
                                className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-blue-700 shadow-lg transition hover:bg-blue-50 disabled:cursor-wait disabled:bg-white/40 disabled:text-white/70"
                            >
                                {workspacePreferences.firstSetup.status === 'COMPLETED'
                                    ? '튜토리얼 마치고 홈으로'
                                    : '설정 완료 저장 중'}
                                {workspacePreferences.firstSetup.status === 'COMPLETED' && (
                                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                )}
                            </button>
                        )}
                    </section>
                )}
                {!guidedFirstRecommendation && (
                    <MonthlyPerformanceReminder
                        missingCount={missingPerformanceCards.length}
                        performanceMonthLabel={formatPerformanceMonthLabel(performancePeriod.performanceMonth)}
                        benefitMonthLabel={formatPerformanceMonthLabel(performancePeriod.benefitMonth)}
                    />
                )}

                {!currentPaymentTarget ? (
                    <BrandDiscovery
                        categories={categories}
                        brands={brands}
                        history={history}
                        favoriteBrandIds={favoriteBrandIds}
                        defaultViewMode={defaultViewMode}
                        nearbyBrandIds={nearbyBrandIds}
                        hasCurrentLocation={hasCurrentLocation}
                        isLocating={isLocating}
                        benefitSuggestions={benefitBrandSuggestions}
                        purchaseScenarios={storageMode === 'guest' ? purchaseScenarios : []}
                        benefitOpportunityCount={benefitBrandSuggestionResult.opportunityCount}
                        onSelectBrand={brand => handleSelectBrand(brand.id)}
                        onSelectPurchaseScenario={handleSelectPurchaseScenario}
                        onSelectGeneralPayment={handleSelectGeneralPayment}
                        onSelectBenefitSuggestion={suggestion => handleSelectBrand(
                            suggestion.brand.id,
                            suggestion.sampleAmount,
                        )}
                        onToggleFavorite={toggleFavorite}
                        onRequestLocation={handleRequestLocation}
                    />
                ) : (
                    <section className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                                    <IconByName
                                        name={currentPaymentTarget.kind === 'BRAND'
                                            ? currentPaymentTarget.brand.iconName || 'Store'
                                            : 'CreditCard'}
                                        className="h-5 w-5"
                                    />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-gray-400">
                                        {currentPaymentTarget.kind === 'BRAND'
                                            ? '선택한 브랜드'
                                            : currentPaymentTarget.kind === 'SCENARIO'
                                                ? '선택한 결제 상황'
                                                : '미지원 결제처'}
                                    </p>
                                    <p className="text-lg font-black text-gray-900">
                                        {currentPaymentTargetLabel}
                                    </p>
                                    {currentPaymentTarget.kind === 'GENERAL' && (
                                        <p className="mt-0.5 text-[10px] font-bold text-blue-600">
                                            일반 적용 혜택만 계산해요
                                        </p>
                                    )}
                                    {currentPaymentTarget.kind === 'SCENARIO' && (
                                        <p className="mt-0.5 text-[10px] font-bold text-blue-600">
                                            적용 조건을 확인한 뒤 확정 혜택으로 계산해요
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleClearPaymentTarget}
                                className="rounded-xl bg-gray-100 px-3 py-2 text-xs font-black text-gray-600"
                            >
                                변경
                            </button>
                        </div>
                    </section>
                )}

                {currentPaymentTarget && (
                    <>
                        <section
                            ref={amountSectionRef}
                            className="scroll-mt-24 rounded-[2rem] border border-gray-100 bg-white p-5 shadow-sm"
                        >
                            <label className="ml-1 text-xs font-black text-gray-400">
                                {guidedFirstRecommendation ? '2. 결제 금액을 입력하세요' : '총 결제금액'}
                            </label>
                            <div className="relative mt-2">
                                <input
                                    ref={amountInputRef}
                                    value={amount ? amount.toLocaleString() : ''}
                                    onChange={event => {
                                        const value = event.target.value.replace(/\D/g, '').slice(0, 9);
                                        setRecordReceipt(undefined);
                                        setAmount(value ? Number(value) : 0);
                                    }}
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="w-full rounded-2xl bg-gray-50 p-4 pr-14 text-4xl font-black text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg font-black text-gray-400">원</span>
                            </div>
                            {guidedFirstRecommendation && suggestedSimulationAmount && amount === 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRecordReceipt(undefined);
                                        setAmount(suggestedSimulationAmount);
                                    }}
                                    className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98]"
                                >
                                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                                    추천 예시 {formatWon(suggestedSimulationAmount)}으로 혜택 보기
                                </button>
                            )}
                            <div className="mt-4">
                                <NumericKeypad
                                    onValueChange={handleKeypadChange}
                                    onDelete={() => {
                                        setRecordReceipt(undefined);
                                        setAmount(value => (
                                            value < 10 ? 0 : Number(String(value).slice(0, -1))
                                        ));
                                    }}
                                />
                            </div>
                        </section>

                        {performanceGoals.length > 0 && (
                            <section className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                                <div className="flex items-center gap-2">
                                    <Target className="h-4 w-4 text-violet-600" />
                                    <div>
                                        <p className="text-xs font-black text-violet-950">추천 기준</p>
                                        <p className="mt-0.5 text-[10px] font-bold text-violet-700/70">
                                            카드 혜택 기준을 보고 실적 우선 카드를 자동 판단해요
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        aria-pressed={effectiveRecommendationPriority === 'BENEFIT'}
                                        onClick={() => {
                                            setRecordReceipt(undefined);
                                            setRecommendationPriority('BENEFIT');
                                        }}
                                        className={clsx(
                                            'rounded-xl px-3 py-2.5 text-[11px] font-black',
                                            effectiveRecommendationPriority === 'BENEFIT'
                                                ? 'bg-gray-950 text-white'
                                                : 'bg-white text-gray-500'
                                        )}
                                    >
                                        이번 결제 혜택 우선
                                    </button>
                                    <button
                                        type="button"
                                        aria-pressed={effectiveRecommendationPriority === 'PERFORMANCE'}
                                        onClick={() => {
                                            setRecordReceipt(undefined);
                                            setRecommendationPriority('PERFORMANCE');
                                        }}
                                        className={clsx(
                                            'rounded-xl px-3 py-2.5 text-[11px] font-black',
                                            effectiveRecommendationPriority === 'PERFORMANCE'
                                                ? 'bg-violet-600 text-white'
                                                : 'bg-white text-gray-500'
                                        )}
                                    >
                                        다음 달 실적 우선
                                    </button>
                                </div>
                            </section>
                        )}

                        {recommendation?.itemSpecificOffers.length ? (
                            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                                <button
                                    type="button"
                                    onClick={() => setIsItemBenefitOpen(value => !value)}
                                    aria-expanded={isItemBenefitOpen}
                                    aria-controls="item-specific-benefits"
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
                                    <div
                                        id="item-specific-benefits"
                                        className="mt-4 border-t border-amber-200 pt-4"
                                    >
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
                                                    setRecordReceipt(undefined);
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
                                    정보 제공 혜택 {recommendation.informationalOffers.length}개
                                </p>
                                <p className="mt-1 text-[10px] text-violet-800/70">
                                    최대치·추첨처럼 확정할 수 없는 정보는 혜택 금액과 순위에 포함하지 않았어요.
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
                                                    : '추첨·확률형 정보'} · 정보 제공
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
                                                {selectedCombinationIntent === 'PERFORMANCE'
                                                    ? <Target className="h-4 w-4 text-violet-300" />
                                                    : selectedCombinationIntent === 'SMALL_BENEFIT'
                                                        ? <Coins className="h-4 w-4 text-amber-300" />
                                                        : <ShieldCheck className="h-4 w-4" />}
                                                <span className="text-[10px] font-black uppercase tracking-widest">
                                                    {selectedCombinationIntent === 'PERFORMANCE'
                                                        ? '실적 우선 추천'
                                                        : selectedCombinationIntent === 'SMALL_BENEFIT'
                                                            ? `소액 확정 혜택 · ${benefitProfile.smallBenefitThreshold.toLocaleString()}원 미만`
                                                            : selectedCombinationIntent === 'NO_BENEFIT'
                                                                ? '확정 혜택 없음'
                                                                : '이번 결제 확정 혜택'}
                                                </span>
                                            </div>
                                            <p
                                                data-testid="recommendation-primary-value"
                                                className="mt-2 text-4xl font-black tracking-tight"
                                            >
                                                {formatWon(selectedCombination.confirmedValue)}
                                            </p>
                                            <p className="mt-2 max-w-sm text-[11px] font-bold leading-relaxed text-gray-300">
                                                {selectedCombinationReason}
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
                                            <p className="text-[9px] font-black text-gray-400">
                                                확정 혜택 적용 후 결제
                                            </p>
                                            <p className="mt-1 text-xs font-black">{formatWon(selectedCombination.payableAmount)}</p>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 p-3">
                                            <p className="text-[9px] font-black text-gray-400">조건 충족 시</p>
                                            <p className="mt-1 text-xs font-black text-amber-300">
                                                +{formatWon(selectedCombination.conditionalValue)}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl bg-white/10 p-3">
                                            <p className="text-[9px] font-black text-gray-400">정보 제공</p>
                                            <p className="mt-1 text-xs font-black text-blue-300">
                                                +{formatWon(selectedCombination.estimatedValue)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedCombination.potentialPayableAmount !== undefined && (
                                        <p className="mt-3 rounded-xl bg-amber-500/15 px-3 py-2 text-[10px] font-bold text-amber-200">
                                            조건·정보가 모두 적용되면 결제 예상액은{' '}
                                            {formatWon(selectedCombination.potentialPayableAmount)}이에요.
                                        </p>
                                    )}
                                    {selectedCombination.laterReward > 0 && (
                                        <p className="mt-3 rounded-xl bg-violet-500/15 px-3 py-2 text-[10px] font-bold text-violet-200">
                                            확정 혜택 중 결제 후 적립 {formatWon(selectedCombination.laterReward)} 포함
                                        </p>
                                    )}
                                </section>

                                {selectedCombination.performanceProgress && (
                                    <section
                                        data-testid="performance-priority-progress"
                                        className="rounded-3xl border border-violet-200 bg-violet-50 p-5"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-violet-600 p-2 text-white">
                                                <Target className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-violet-950">
                                                    {selectedCombinationIntent === 'PERFORMANCE'
                                                        ? '실적 우선 이유'
                                                        : '카드 실적 참고'}
                                                </p>
                                                <p className="mt-1 text-[10px] font-bold leading-relaxed text-violet-800/75">
                                                    현재 {formatWon(
                                                        selectedCombination.performanceProgress.currentAmount
                                                    )} → 결제 후 약 {formatWon(
                                                        selectedCombination.performanceProgress.projectedAmount
                                                    )}
                                                </p>
                                                {selectedCombination.performanceProgress.projectedBenefitAmount > 0 && (
                                                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-violet-800/75">
                                                        이 매장·금액 기준 다음 달 예상 카드 혜택{' '}
                                                        {formatWon(
                                                            selectedCombination.performanceProgress.projectedBenefitAmount
                                                        )}
                                                    </p>
                                                )}
                                                <p className="mt-2 text-[11px] font-black text-violet-700">
                                                    {selectedCombination.performanceProgress.targetReached
                                                        ? `${formatPerformanceMonthLabel(
                                                            selectedCombination.performanceProgress.benefitMonth
                                                        )} 혜택 목표를 달성할 수 있어요.`
                                                        : `목표까지 ${formatWon(
                                                            selectedCombination.performanceProgress.remainingAfter
                                                        )} 남아요.`}
                                                </p>
                                            </div>
                                        </div>
                                    </section>
                                )}

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

                                {selectedCard && selectedCardSupport && (
                                    <CardBenefitSupportCard
                                        cardName={selectedCard.name}
                                        support={selectedCardSupport}
                                    />
                                )}

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

                                {unresolvedConditionSteps.length > 0 && (
                                    <p
                                        id="record-condition-help"
                                        role="status"
                                        className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-amber-900"
                                    >
                                        조건 충족 시 혜택 {unresolvedConditionSteps.length}개를 먼저 확인해야
                                        이 조합을 기록할 수 있어요. 조건을 충족하지 않았다면 다른 조합을 선택하세요.
                                    </p>
                                )}

                                <button
                                    type="button"
                                    onClick={handleRecord}
                                    disabled={
                                        isRecording ||
                                        Boolean(recordReceipt) ||
                                        unresolvedConditionSteps.length > 0
                                    }
                                    aria-describedby={
                                        unresolvedConditionSteps.length > 0
                                            ? 'record-condition-help'
                                            : undefined
                                    }
                                    data-testid="record-combination"
                                    className={clsx(
                                        'flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black shadow-lg transition active:scale-[0.98]',
                                        'bg-gray-900 text-white hover:bg-black',
                                        (isRecording || recordReceipt || unresolvedConditionSteps.length > 0) &&
                                            'cursor-not-allowed opacity-60'
                                    )}
                                >
                                    {isRecording ? (
                                        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                                    ) : recordReceipt ? (
                                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                                    ) : (
                                        <Wallet className="h-5 w-5" aria-hidden="true" />
                                    )}
                                    {isRecording
                                        ? '기록 중'
                                        : recordReceipt
                                            ? '기록 완료'
                                            : unresolvedConditionSteps.length > 0
                                                ? `조건 ${unresolvedConditionSteps.length}개 확인 후 기록`
                                                : '이 조합으로 한 번에 기록하기'}
                                </button>

                                {recordReceipt && (
                                    <section
                                        role="status"
                                        aria-live="polite"
                                        className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"
                                        data-testid="record-receipt"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="rounded-xl bg-emerald-600 p-2 text-white">
                                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h2 className="text-sm font-black text-emerald-950">결제 기록 완료</h2>
                                                <p className="mt-1 text-[11px] font-bold text-emerald-800">
                                                    확정 혜택{' '}
                                                    {formatWon(
                                                        recordReceipt.transaction.confirmedValue ??
                                                        recordReceipt.transaction.discountAmount
                                                    )}을 기록했어요.
                                                </p>
                                                {recordReceipt.performanceAfter !== undefined && (
                                                    <p className="mt-1 text-[11px] font-bold text-emerald-800">
                                                        이번 달 예상 카드 실적{' '}
                                                        {formatWon(recordReceipt.performanceBefore ?? 0)} →{' '}
                                                        {formatWon(recordReceipt.performanceAfter)}
                                                    </p>
                                                )}
                                                {recordReceipt.transaction.performanceContribution && (
                                                    <p className="mt-1 text-[11px] font-bold text-emerald-800">
                                                        이번 결제 실적 기여{' '}
                                                        {recordReceipt.transaction.performanceContribution.status === 'UNKNOWN'
                                                            ? '확인 전 0원으로 보수적 처리'
                                                            : formatWon(recordReceipt.transaction.performanceContribution.amount)}
                                                        {' · '}{recordReceipt.transaction.performanceContribution.reason}
                                                    </p>
                                                )}
                                                <p className="mt-2 text-[10px] leading-relaxed text-emerald-700">
                                                    확정된 혜택 사용량과 한도를 반영해 같은 조건의 추천도 다시 계산했어요.
                                                </p>
                                                <Link
                                                    href="/history"
                                                    className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 text-[11px] font-black text-emerald-800 shadow-sm"
                                                >
                                                    기록 상세 보기
                                                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                                </Link>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {recommendation && recommendation.combinations.length > 1 && (
                                    <section className="space-y-2 pb-8">
                                        <h2 className="mb-3 px-1 text-sm font-black text-gray-900">다른 조합 비교</h2>
                                        {recommendation.combinations.slice(0, 6).map((combination, index) => (
                                            <CombinationSummary
                                                key={combination.id}
                                                combination={combination}
                                                rank={index + 1}
                                                selected={combination.id === selectedCombination.id}
                                                priority={effectiveRecommendationPriority}
                                                smallBenefitThreshold={benefitProfile.smallBenefitThreshold}
                                                onSelect={() => {
                                                    setRecordReceipt(undefined);
                                                    setSelectedCombinationId(combination.id);
                                                }}
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

export default function HomePage() {
    return (
        <Suspense fallback={(
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <LoaderCircle className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        )}>
            <HomePageContent />
        </Suspense>
    );
}
