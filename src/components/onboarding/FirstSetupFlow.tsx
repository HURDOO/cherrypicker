'use client';

import {
    ArrowLeft,
    ArrowRight,
    Check,
    CreditCard,
    LoaderCircle,
    ShieldCheck,
    Sparkles,
    WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { FavoriteBrandSelector } from '@/components/brand/FavoriteBrandSelector';
import { LocalDataPrivacyNotice } from '@/components/settings/LocalDataPrivacyNotice';
import { SystemCardSelector } from '@/components/settings/SystemCardSelector';
import { getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { formatPerformanceMonthLabel, getPreviousMonthInKst } from '@/lib/monthly-performance';
import { useAppStore } from '@/store/useAppStore';
import type {
    BenefitCatalogSnapshot,
    Brand,
    Card,
    FirstSetupStep,
    UserBenefitProfile,
    WorkspacePreferences,
} from '@/types';

const STEPS: Array<{ id: FirstSetupStep; label: string }> = [
    { id: 'CARDS', label: '카드' },
    { id: 'BENEFITS', label: '혜택' },
    { id: 'PERFORMANCE', label: '실적' },
    { id: 'FAVORITES', label: '즐겨찾기' },
];

const previousStep: Partial<Record<FirstSetupStep, FirstSetupStep>> = {
    CARDS: 'WELCOME',
    BENEFITS: 'CARDS',
    PERFORMANCE: 'BENEFITS',
    FAVORITES: 'PERFORMANCE',
};

const TELECOM_TIER_ORDER = [
    '일반',
    'SILVER',
    'WHITE',
    '우수',
    'GOLD',
    'VIP',
    'VVIP',
];

const SKT_TIER_OPTIONS = ['SILVER', 'GOLD', 'VIP'];

const compareTelecomTiers = (left: string, right: string) => {
    const leftIndex = TELECOM_TIER_ORDER.indexOf(left.toLocaleUpperCase('ko-KR'));
    const rightIndex = TELECOM_TIER_ORDER.indexOf(right.toLocaleUpperCase('ko-KR'));
    return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
        left.localeCompare(right, 'ko-KR');
};

function SelectionButton({
    selected,
    disabled,
    children,
    onClick,
}: {
    selected: boolean;
    disabled: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={clsx(
                'flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-black transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-wait disabled:opacity-60',
                selected
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-blue-200'
            )}
        >
            <span className="break-words">{children}</span>
            {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
        </button>
    );
}

export function FirstSetupFlow({
    step,
    systemCards,
    brands,
    catalog,
    favoriteBrandIds,
    preferenceStorageError,
    onToggleFavorite,
    onNavigate,
}: {
    step: FirstSetupStep;
    systemCards: Card[];
    brands: Brand[];
    catalog: BenefitCatalogSnapshot | null;
    favoriteBrandIds: string[];
    preferenceStorageError?: string;
    onToggleFavorite: (brandId: string) => void;
    onNavigate: (step: FirstSetupStep) => void;
}) {
    const {
        rules,
        performances,
        benefitProfile,
        workspacePreferences,
        setBenefitProfile,
        setWorkspacePreferences,
        updatePerformance,
    } = useAppStore();
    const [isSaving, setIsSaving] = useState(false);
    const [storageError, setStorageError] = useState<string>();
    const [performanceDrafts, setPerformanceDrafts] = useState<Record<string, string>>({});
    const headingRef = useRef<HTMLHeadingElement>(null);
    const selectedCardIds = useMemo(
        () => workspacePreferences.selectedSystemCardIds ?? [],
        [workspacePreferences.selectedSystemCardIds]
    );
    const performanceMonth = useMemo(() => getPreviousMonthInKst(), []);
    const performanceMonthLabel = formatPerformanceMonthLabel(performanceMonth);

    const selectedCards = useMemo(
        () => systemCards.filter(card => selectedCardIds.includes(card.id)),
        [selectedCardIds, systemCards]
    );
    const performanceCards = useMemo(() => selectedCards.filter(card => (
        card.limitTable.some(tier => tier.threshold > 0) ||
        rules.some(rule => rule.cardId === card.id && (rule.condition.minPerformance ?? 0) > 0)
    )), [rules, selectedCards]);
    const telecomProviders = catalog?.providers.filter(provider => provider.kind === 'TELECOM') ?? [];
    const payProviders = catalog?.providers.filter(provider => (
        provider.kind === 'PAY' || provider.kind === 'GOODDEAL'
    )) ?? [];
    const subscriptionProducts = catalog?.subscriptionProducts.slice(0, 16) ?? [];

    useEffect(() => {
        headingRef.current?.focus();
    }, [step]);

    useEffect(() => {
        setPerformanceDrafts(current => {
            const next = { ...current };
            performanceCards.forEach(card => {
                if (Object.prototype.hasOwnProperty.call(next, card.id)) return;
                const stored = performances.find(item => (
                    item.cardId === card.id && item.performanceMonth === performanceMonth
                ));
                next[card.id] = stored ? String(stored.amount) : '';
            });
            return next;
        });
    }, [performanceCards, performanceMonth, performances]);

    const persistPreferences = async (
        next: WorkspacePreferences,
        beforeStoreUpdate?: () => void,
    ) => {
        setIsSaving(true);
        setStorageError(undefined);
        let savedSuccessfully = false;
        try {
            const saved = await localWorkspaceClient.updateWorkspacePreferences(next);
            beforeStoreUpdate?.();
            setWorkspacePreferences(saved);
            savedSuccessfully = true;
            return true;
        } catch (error) {
            setStorageError(getErrorMessage(
                error,
                '첫 설정을 이 브라우저에 저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해주세요.'
            ));
            return false;
        } finally {
            if (!savedSuccessfully || !beforeStoreUpdate) setIsSaving(false);
        }
    };

    const persistProfile = async (next: UserBenefitProfile) => {
        setIsSaving(true);
        setStorageError(undefined);
        try {
            const saved = await localWorkspaceClient.updateBenefitProfile(next);
            setBenefitProfile(saved);
        } catch (error) {
            setStorageError(getErrorMessage(error, '혜택 선택을 이 브라우저에 저장하지 못했습니다.'));
        } finally {
            setIsSaving(false);
        }
    };

    const goToStep = async (nextStep: FirstSetupStep) => {
        await persistPreferences({
            ...workspacePreferences,
            firstSetup: {
                status: nextStep === 'WELCOME' ? 'NOT_STARTED' : 'IN_PROGRESS',
                step: nextStep,
            },
        }, () => onNavigate(nextStep));
    };

    const toggleCard = async (cardId: string) => {
        const nextIds = selectedCardIds.includes(cardId)
            ? selectedCardIds.filter(id => id !== cardId)
            : [...selectedCardIds, cardId];
        await persistPreferences({
            ...workspacePreferences,
            selectedSystemCardIds: nextIds,
            firstSetup: {
                status: 'IN_PROGRESS',
                step: 'CARDS',
            },
        });
    };

    const savePerformance = async (cardId: string) => {
        const draft = performanceDrafts[cardId] ?? '';
        if (draft === '') return true;
        setIsSaving(true);
        setStorageError(undefined);
        try {
            const saved = await localWorkspaceClient.updatePerformance(
                cardId,
                Number(draft),
                performanceMonth,
            );
            updatePerformance(saved);
            return true;
        } catch (error) {
            setStorageError(getErrorMessage(error, '카드 실적을 이 브라우저에 저장하지 못했습니다.'));
            return false;
        } finally {
            setIsSaving(false);
        }
    };

    const continueFromPerformance = async () => {
        for (const card of performanceCards) {
            if (!(await savePerformance(card.id))) return;
        }
        await goToStep('FAVORITES');
    };

    const startRecommendation = async () => {
        await persistPreferences({
            ...workspacePreferences,
            firstSetup: {
                status: 'AWAITING_RECOMMENDATION',
                step: 'RECOMMENDATION',
            },
        }, () => onNavigate('RECOMMENDATION'));
    };

    const selectedTelecom = benefitProfile.telecomMemberships[0];
    const selectedTelecomId = selectedTelecom?.providerId;
    const selectedTelecomProvider = telecomProviders.find(
        provider => provider.id === selectedTelecomId
    );
    const telecomTierOptions = useMemo(() => {
        if (!selectedTelecomId || !catalog) return [];
        const collectedTiers = [...new Set(catalog.promotions
            .filter(offer => offer.providerId === selectedTelecomId)
            .flatMap(offer => offer.condition.telecomTiers ?? [])
            .map(tier => tier.trim())
            .filter(Boolean))]
            .sort(compareTelecomTiers);
        if (collectedTiers.length > 0) return collectedTiers;
        return selectedTelecomId === 'skt' ? SKT_TIER_OPTIONS : [];
    }, [catalog, selectedTelecomId]);
    const isTelecomTierMissing = Boolean(
        selectedTelecomId && telecomTierOptions.length > 0 && !selectedTelecom?.tier
    );
    const isTelecomModeMissing = selectedTelecomId === 'skt' && !selectedTelecom?.mode;
    const isTelecomSetupIncomplete = isTelecomTierMissing || isTelecomModeMissing;

    return (
        <div className="setup-route-enter min-h-screen bg-gray-50" data-setup-step={step}>
            <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-xl">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-blue-700">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                        <span className="text-sm font-black">Cherry Picker 첫 설정</span>
                    </div>
                    {step !== 'WELCOME' && (
                        <span className="text-xs font-black text-gray-400">
                            {Math.max(1, STEPS.findIndex(item => item.id === step) + 1)}/4
                        </span>
                    )}
                </div>
                {step !== 'WELCOME' && (
                    <div className="mt-4 grid grid-cols-4 gap-1" aria-label="첫 설정 진행률">
                        {STEPS.map((item, index) => {
                            const currentIndex = STEPS.findIndex(candidate => candidate.id === step);
                            return (
                                <div key={item.id}>
                                    <div className={clsx(
                                        'h-1.5 rounded-full',
                                        index <= currentIndex ? 'bg-blue-600' : 'bg-gray-100'
                                    )} />
                                    <span className="mt-1 block text-center text-[9px] font-bold text-gray-400">
                                        {item.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                <section className="mt-7 flex-1">
                    {step === 'WELCOME' && (
                        <>
                            <div className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500 p-6 text-white shadow-xl shadow-blue-100">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
                                    <WandSparkles className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <p className="mt-8 text-xs font-black text-blue-100">
                                    결제 직전, 가장 좋은 혜택 조합
                                </p>
                                <h1
                                    id="first-setup-title"
                                    ref={headingRef}
                                    tabIndex={-1}
                                    className="mt-2 text-3xl font-black leading-tight tracking-tight outline-none"
                                >
                                    내 카드로 더 알뜰하게<br />결제해 보세요
                                </h1>
                                <p className="mt-4 text-sm font-bold leading-relaxed text-blue-100">
                                    가진 카드와 혜택을 한 번만 알려주면, 매장과 금액에 맞는 결제 순서를 바로 찾아드려요.
                                </p>
                            </div>

                            <div className="mt-5 grid gap-2">
                                {[
                                    {
                                        icon: CreditCard,
                                        title: '내가 가진 카드만 비교',
                                        detail: '쓰지 않는 카드는 추천에서 제외해요.',
                                    },
                                    {
                                        icon: Sparkles,
                                        title: '할인부터 결제수단까지 한 번에',
                                        detail: '놓치기 쉬운 중복 혜택도 순서대로 보여드려요.',
                                    },
                                    {
                                        icon: ShieldCheck,
                                        title: '개인정보는 내 기기 안에서',
                                        detail: '입력 내용은 서버로 보내지 않고 이 브라우저에서 처리해요.',
                                    },
                                ].map(item => {
                                    const Icon = item.icon;
                                    return (
                                        <div key={item.title} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                                <Icon className="h-5 w-5" aria-hidden="true" />
                                            </div>
                                            <div>
                                                <h2 className="text-sm font-black text-gray-900">{item.title}</h2>
                                                <p className="mt-0.5 text-[11px] font-bold leading-relaxed text-gray-500">{item.detail}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-5"><LocalDataPrivacyNotice /></div>
                        </>
                    )}

                    {step === 'CARDS' && (
                        <>
                            <h1
                                id="first-setup-title"
                                ref={headingRef}
                                tabIndex={-1}
                                className="text-2xl font-black tracking-tight text-gray-950 outline-none"
                            >
                                어떤 카드를 가지고 있나요?
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                한 장만 골라도 바로 시작할 수 있어요. 선택한 카드만 추천에 사용합니다.
                            </p>
                            <div className="mt-4"><LocalDataPrivacyNotice /></div>
                            <div className="mt-5">
                                <SystemCardSelector
                                    cards={systemCards}
                                    selectedCardIds={selectedCardIds}
                                    disabled={isSaving}
                                    onToggle={cardId => void toggleCard(cardId)}
                                />
                            </div>
                        </>
                    )}

                    {step === 'BENEFITS' && (
                        <>
                            <h1
                                id="first-setup-title"
                                ref={headingRef}
                                tabIndex={-1}
                                className="text-2xl font-black tracking-tight text-gray-950 outline-none"
                            >
                                함께 쓰는 혜택이 있나요?
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                지금 모르면 건너뛰어도 괜찮아요. 설정에서 언제든 보완할 수 있습니다.
                            </p>
                            <div className="mt-4"><LocalDataPrivacyNotice /></div>
                            <div className="mt-5 space-y-6">
                                <fieldset>
                                    <legend className="text-xs font-black text-gray-700">통신사 멤버십</legend>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <SelectionButton
                                            selected={!selectedTelecomId}
                                            disabled={isSaving}
                                            onClick={() => void persistProfile({
                                                ...benefitProfile,
                                                telecomMemberships: [],
                                            })}
                                        >사용 안 함</SelectionButton>
                                        {telecomProviders.map(provider => (
                                            <SelectionButton
                                                key={provider.id}
                                                selected={selectedTelecomId === provider.id}
                                                disabled={isSaving}
                                                onClick={() => void persistProfile({
                                                    ...benefitProfile,
                                                    telecomMemberships: [{
                                                        providerId: provider.id,
                                                        ...(selectedTelecomId === provider.id && selectedTelecom?.tier
                                                            ? { tier: selectedTelecom.tier }
                                                            : {}),
                                                        ...(selectedTelecomId === provider.id && selectedTelecom?.mode
                                                            ? { mode: selectedTelecom.mode }
                                                            : {}),
                                                    }],
                                                })}
                                            >{provider.name}</SelectionButton>
                                        ))}
                                    </div>
                                </fieldset>
                                {selectedTelecomId === 'skt' && (
                                    <fieldset>
                                        <legend className="text-xs font-black text-gray-700">
                                            T멤버십 혜택 유형
                                        </legend>
                                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-400">
                                            T멤버십 앱에서 선택한 유형과 같게 골라주세요. 할인과 적립은 동시에 적용되지 않아요.
                                        </p>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            {([
                                                ['DISCOUNT', '할인형'],
                                                ['POINTS', '적립형'],
                                            ] as const).map(([mode, label]) => (
                                                <SelectionButton
                                                    key={mode}
                                                    selected={selectedTelecom?.mode === mode}
                                                    disabled={isSaving}
                                                    onClick={() => void persistProfile({
                                                        ...benefitProfile,
                                                        telecomMemberships: [{
                                                            ...selectedTelecom!,
                                                            mode,
                                                        }],
                                                    })}
                                                >{label}</SelectionButton>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                                {selectedTelecomId && telecomTierOptions.length > 0 && (
                                    <fieldset>
                                        <legend className="text-xs font-black text-gray-700">
                                            멤버십 등급
                                        </legend>
                                        <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-400">
                                            {selectedTelecomProvider?.name ?? '통신사 멤버십'}은 등급에 따라 실제 혜택 금액이 달라져요.
                                        </p>
                                        <div className="mt-2 grid grid-cols-3 gap-2">
                                            {telecomTierOptions.map(tier => (
                                                <SelectionButton
                                                    key={tier}
                                                    selected={selectedTelecom?.tier === tier}
                                                    disabled={isSaving}
                                                    onClick={() => void persistProfile({
                                                        ...benefitProfile,
                                                        telecomMemberships: [{
                                                            providerId: selectedTelecomId,
                                                            tier,
                                                            ...(selectedTelecom?.mode && {
                                                                mode: selectedTelecom.mode,
                                                            }),
                                                        }],
                                                    })}
                                                >{tier}</SelectionButton>
                                            ))}
                                        </div>
                                    </fieldset>
                                )}
                                <fieldset>
                                    <legend className="text-xs font-black text-gray-700">페이</legend>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        {payProviders.map(provider => (
                                            <SelectionButton
                                                key={provider.id}
                                                selected={benefitProfile.enabledPayProviderIds.includes(provider.id)}
                                                disabled={isSaving}
                                                onClick={() => void persistProfile({
                                                    ...benefitProfile,
                                                    enabledPayProviderIds: benefitProfile.enabledPayProviderIds.includes(provider.id)
                                                        ? benefitProfile.enabledPayProviderIds.filter(id => id !== provider.id)
                                                        : [...benefitProfile.enabledPayProviderIds, provider.id],
                                                })}
                                            >{provider.name}</SelectionButton>
                                        ))}
                                    </div>
                                </fieldset>
                                {subscriptionProducts.length > 0 && (
                                    <fieldset>
                                        <legend className="text-xs font-black text-gray-700">구독 상품</legend>
                                        <div className="mt-2 grid grid-cols-1 gap-2">
                                            {subscriptionProducts.map(product => {
                                                const isSelected = benefitProfile.subscriptions.some(item => (
                                                    item.providerId === product.providerId && item.productName === product.name
                                                ));
                                                return (
                                                    <SelectionButton
                                                        key={product.id}
                                                        selected={isSelected}
                                                        disabled={isSaving}
                                                        onClick={() => void persistProfile({
                                                            ...benefitProfile,
                                                            subscriptions: isSelected
                                                                ? benefitProfile.subscriptions.filter(item => !(
                                                                    item.providerId === product.providerId &&
                                                                    item.productName === product.name
                                                                ))
                                                                : [...benefitProfile.subscriptions, {
                                                                    providerId: product.providerId,
                                                                    productName: product.name,
                                                                }],
                                                        })}
                                                    >{product.name}</SelectionButton>
                                                );
                                            })}
                                        </div>
                                    </fieldset>
                                )}
                                <fieldset>
                                    <legend className="text-xs font-black text-gray-700">기타 결제수단</legend>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        <SelectionButton
                                            selected={benefitProfile.moneyEnabled}
                                            disabled={isSaving}
                                            onClick={() => void persistProfile({
                                                ...benefitProfile,
                                                moneyEnabled: !benefitProfile.moneyEnabled,
                                            })}
                                        >머니</SelectionButton>
                                        <SelectionButton
                                            selected={benefitProfile.pointsEnabled}
                                            disabled={isSaving}
                                            onClick={() => void persistProfile({
                                                ...benefitProfile,
                                                pointsEnabled: !benefitProfile.pointsEnabled,
                                            })}
                                        >포인트</SelectionButton>
                                    </div>
                                </fieldset>
                            </div>
                        </>
                    )}

                    {step === 'PERFORMANCE' && (
                        <>
                            <h1
                                id="first-setup-title"
                                ref={headingRef}
                                tabIndex={-1}
                                className="text-2xl font-black tracking-tight text-gray-950 outline-none"
                            >
                                {performanceMonthLabel} 실적을 입력할까요?
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                은행 앱을 확인하고 돌아와도 이 단계에서 이어갈 수 있어요. 모르면 모두 건너뛰세요.
                            </p>
                            <div className="mt-4"><LocalDataPrivacyNotice /></div>
                            <div className="mt-5 space-y-3">
                                {performanceCards.map(card => (
                                    <div key={card.id} className="rounded-2xl border border-gray-200 p-4">
                                        <label className="text-sm font-black text-gray-900" htmlFor={`setup-performance-${card.id}`}>
                                            {card.name}
                                        </label>
                                        <div className="mt-2 flex items-center gap-2">
                                            <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-gray-200 px-3 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                                                <input
                                                    id={`setup-performance-${card.id}`}
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={performanceDrafts[card.id] ?? ''}
                                                    disabled={isSaving}
                                                    placeholder="모르면 비워두기"
                                                    onChange={event => setPerformanceDrafts(current => ({
                                                        ...current,
                                                        [card.id]: event.target.value.replace(/[^0-9]/g, '').slice(0, 12),
                                                    }))}
                                                    onBlur={event => {
                                                        const nextTarget = event.relatedTarget;
                                                        if (
                                                            nextTarget instanceof HTMLElement &&
                                                            nextTarget.closest('[data-onboarding-navigation]')
                                                        ) return;
                                                        void savePerformance(card.id);
                                                    }}
                                                    className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-base font-black text-blue-700 outline-none disabled:opacity-60"
                                                />
                                                <span className="ml-1 text-xs font-bold text-gray-400">원</span>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={isSaving || (performanceDrafts[card.id] ?? '') === ''}
                                                onClick={() => void savePerformance(card.id)}
                                                className="min-h-11 rounded-xl bg-blue-600 px-4 text-xs font-black text-white disabled:bg-gray-200 disabled:text-gray-400"
                                            >저장</button>
                                        </div>
                                    </div>
                                ))}
                                {performanceCards.length === 0 && (
                                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-500">
                                        지금 입력할 실적 조건이 없어요.
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {step === 'FAVORITES' && (
                        <>
                            <h1
                                id="first-setup-title"
                                ref={headingRef}
                                tabIndex={-1}
                                className="text-2xl font-black tracking-tight text-gray-950 outline-none"
                            >
                                자주 가는 곳을 골라볼까요?
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                홈에서 먼저 보여드려요. 기본 선택을 그대로 쓰거나 원하는 곳만 남겨도 됩니다.
                            </p>
                            <div className="mt-5">
                                <FavoriteBrandSelector
                                    brands={brands}
                                    selectedBrandIds={favoriteBrandIds}
                                    disabled={isSaving}
                                    showDefaultHint
                                    onToggle={onToggleFavorite}
                                />
                            </div>
                        </>
                    )}
                </section>

                {storageError && (
                    <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-relaxed text-rose-700">
                        {storageError} 입력 내용은 그대로 두었습니다. 다시 시도해주세요.
                    </div>
                )}
                {!storageError && preferenceStorageError && (
                    <div role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold leading-relaxed text-rose-700">
                        {preferenceStorageError} 저장 공간과 권한을 확인한 뒤 다시 선택해주세요.
                    </div>
                )}

                <div className="mt-6 flex items-center gap-2 border-t border-gray-100 pt-4">
                    {previousStep[step] ? (
                        <button
                            type="button"
                            data-onboarding-navigation
                            disabled={isSaving}
                            onClick={() => void goToStep(previousStep[step]!)}
                            className="flex min-h-12 items-center justify-center gap-1 rounded-2xl border border-gray-200 px-4 text-xs font-black text-gray-600 disabled:opacity-50"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 이전
                        </button>
                    ) : <div />}
                    <button
                        type="button"
                        data-onboarding-navigation
                        disabled={isSaving ||
                            (step === 'CARDS' && selectedCardIds.length === 0) ||
                            (step === 'BENEFITS' && isTelecomSetupIncomplete)}
                        onClick={() => {
                            if (step === 'WELCOME') void goToStep('CARDS');
                            if (step === 'CARDS') void goToStep('BENEFITS');
                            if (step === 'BENEFITS') void goToStep('PERFORMANCE');
                            if (step === 'PERFORMANCE') void continueFromPerformance();
                            if (step === 'FAVORITES') void startRecommendation();
                        }}
                        className="ml-auto flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                    >
                        {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {step === 'WELCOME'
                            ? '내 카드로 시작하기'
                            : step === 'FAVORITES'
                                ? '첫 추천 받아보기'
                                : '저장하고 계속'}
                        {!isSaving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </button>
                </div>
                {step !== 'WELCOME' && step !== 'CARDS' && step !== 'FAVORITES' && (
                    <p className="mt-2 text-center text-[10px] font-bold text-gray-400">
                        {step === 'BENEFITS' && isTelecomSetupIncomplete
                            ? '멤버십 혜택 유형과 등급을 모두 고르면 제휴 혜택을 정확히 계산할 수 있어요.'
                            : '아무것도 고르지 않아도 계속할 수 있어요.'}
                    </p>
                )}
            </main>
        </div>
    );
}
