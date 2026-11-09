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
import { LocalDataPrivacyNotice } from '@/components/settings/LocalDataPrivacyNotice';
import { SystemCardSelector } from '@/components/settings/SystemCardSelector';
import { getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { formatPerformanceMonthLabel, getPreviousMonthInKst } from '@/lib/monthly-performance';
import { useAppStore } from '@/store/useAppStore';
import type {
    BenefitCatalogSnapshot,
    Card,
    FirstSetupStep,
    PromotionProvider,
    UserBenefitProfile,
    WorkspacePreferences,
} from '@/types';
import {
    defaultTelecomMembership,
    findPerformanceTierOption,
    getPerformanceTierOptions,
    KAKAOPAY_PROVIDER_ID,
    togglePayProvider,
} from '@/utils/firstSetupDefaults';
import { getTelecomTierOptions, matchTelecomTierOption } from '@/utils/telecomTiers';

const STEPS: Array<{ id: FirstSetupStep; label: string }> = [
    { id: 'CARDS', label: '카드' },
    { id: 'BENEFITS', label: '혜택' },
];

const previousStep: Partial<Record<FirstSetupStep, FirstSetupStep>> = {
    CARDS: 'WELCOME',
    BENEFITS: 'CARDS',
};

const PROVIDER_LOGO_URLS: Record<string, string> = {
    skt: '/brand-logos/providers/skt.png',
    kt: '/brand-logos/providers/kt.png',
    lguplus: '/brand-logos/providers/lguplus.png',
    kakaopay: '/brand-logos/providers/kakaopay.png',
    naverpay: '/brand-logos/providers/naverpay.png',
};

function ProviderButton({
    provider,
    selected,
    disabled,
    note,
    onClick,
}: {
    provider: Pick<PromotionProvider, 'id' | 'name'>;
    selected: boolean;
    disabled: boolean;
    note?: string;
    onClick: () => void;
}) {
    const logoUrl = PROVIDER_LOGO_URLS[provider.id];
    return (
        <button
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={onClick}
            className={clsx(
                'flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-wait disabled:opacity-60',
                selected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-200'
            )}
        >
            {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logoUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-inset ring-gray-100"
                />
            ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-black text-gray-500">
                    {provider.name.slice(0, 1)}
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className={clsx(
                    'block break-keep text-sm font-black',
                    selected ? 'text-blue-800' : 'text-gray-800'
                )}>{provider.name}</span>
                {note && (
                    <span className="mt-0.5 block text-[10px] font-bold leading-snug text-gray-500">{note}</span>
                )}
            </span>
            {selected && <Check className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />}
        </button>
    );
}

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
    catalog,
    preferenceStorageError,
    onNavigate,
}: {
    step: FirstSetupStep;
    systemCards: Card[];
    catalog: BenefitCatalogSnapshot | null;
    preferenceStorageError?: string;
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
    const [isChangingCard, setIsChangingCard] = useState(false);
    const [isEditingTelecom, setIsEditingTelecom] = useState(false);
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
    const payProviders = catalog?.providers.filter(provider => provider.kind === 'PAY') ?? [];
    const selectedCard = selectedCards[0];
    const selectedCardTiers = useMemo(
        () => selectedCard ? getPerformanceTierOptions(selectedCard, rules) : [],
        [rules, selectedCard]
    );
    const selectedCardDraft = selectedCard ? performanceDrafts[selectedCard.id] ?? '' : '';
    const selectedCardTier = findPerformanceTierOption(
        selectedCardTiers,
        selectedCardDraft === '' ? undefined : Number(selectedCardDraft),
    );
    // Unknown spend would count as 0 and switch off every tiered card benefit.
    const isSpendTierMissing = Boolean(selectedCard) && !isChangingCard &&
        selectedCardTiers.length > 0 && !selectedCardTier;
    const showCardList = !selectedCard || isChangingCard;

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

    // First setup takes one card. More cards can be added in settings.
    const chooseCard = async (cardId: string) => {
        const nextIds = selectedCardIds.length === 1 && selectedCardIds[0] === cardId ? [] : [cardId];
        setIsChangingCard(false);
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

    const continueFromCards = async () => {
        for (const card of performanceCards) {
            if (!(await savePerformance(card.id))) return;
        }
        await goToStep('BENEFITS');
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
    const telecomTierOptions = useMemo(
        () => getTelecomTierOptions(selectedTelecomId, catalog?.promotions ?? []),
        [catalog, selectedTelecomId]
    );
    const selectedTelecomTier = matchTelecomTierOption(selectedTelecom?.tier, telecomTierOptions);
    const isTelecomTierMissing = Boolean(
        selectedTelecomId && telecomTierOptions.length > 0 && !selectedTelecomTier
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
                            {Math.max(1, STEPS.findIndex(item => item.id === step) + 1)}/{STEPS.length}
                        </span>
                    )}
                </div>
                {step !== 'WELCOME' && (
                    <div className="mt-4 grid grid-cols-2 gap-1" aria-label="첫 설정 진행률">
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
                                가장 자주 쓰는 카드 한 장으로 시작해요. 다른 카드는 나중에 설정에서 더할 수 있어요.
                            </p>
                            {selectedCard && !isChangingCard && (
                                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-blue-500 bg-blue-50 p-3">
                                    <span className={clsx(
                                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
                                        selectedCard.color || 'bg-gray-500'
                                    )}>
                                        <CreditCard className="h-5 w-5" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-sm font-black text-gray-900">
                                            {selectedCard.name}
                                        </span>
                                        <span className="mt-0.5 block text-[11px] font-bold text-gray-500">
                                            {selectedCard.company}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => setIsChangingCard(true)}
                                        className="min-h-11 shrink-0 rounded-xl border border-blue-200 bg-white px-3 text-xs font-black text-blue-700 disabled:opacity-50"
                                    >다른 카드</button>
                                </div>
                            )}
                            {selectedCard && !isChangingCard && performanceCards.some(card => card.id === selectedCard.id) && (
                                <div className="mt-6">
                                    <h2
                                        id={`setup-performance-${selectedCard.id}`}
                                        className="text-lg font-black tracking-tight text-gray-950"
                                    >
                                        지난달 이 카드 얼마나 썼나요?
                                    </h2>
                                    <p className="mt-1.5 text-xs font-bold leading-relaxed text-gray-500">
                                        카드사 앱에서 볼 수 있어요. 대략 어디쯤인지 골라 주세요.
                                    </p>
                                    <div
                                        role="radiogroup"
                                        aria-labelledby={`setup-performance-${selectedCard.id}`}
                                        className="mt-3 grid grid-cols-2 gap-2"
                                    >
                                        {selectedCardTiers.map(option => {
                                            const selected = selectedCardTier?.amount === option.amount;
                                            return (
                                                <button
                                                    key={option.amount}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={selected}
                                                    disabled={isSaving}
                                                    onClick={() => setPerformanceDrafts(current => ({
                                                        ...current,
                                                        [selectedCard.id]: String(option.amount),
                                                    }))}
                                                    className={clsx(
                                                        'min-h-14 rounded-2xl border px-3 py-2 text-left disabled:opacity-60',
                                                        selected
                                                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
                                                            : 'border-gray-200 bg-white'
                                                    )}
                                                >
                                                    <span className={clsx(
                                                        'block text-sm font-black',
                                                        selected ? 'text-blue-700' : 'text-gray-900'
                                                    )}>
                                                        {option.label}
                                                    </span>
                                                    {option.detail && (
                                                        <span className="mt-0.5 block text-[11px] font-bold text-gray-500">
                                                            {option.detail}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-1.5 text-[10px] font-bold text-gray-400">
                                        {performanceMonthLabel} 사용액으로 이번 달 혜택 조건을 계산해요.
                                    </p>
                                </div>
                            )}
                            {showCardList && (
                                <>
                                    <div className="mt-4"><LocalDataPrivacyNotice /></div>
                                    <div className="mt-5">
                                        <SystemCardSelector
                                            cards={systemCards}
                                            selectedCardIds={selectedCard ? [selectedCard.id] : []}
                                            disabled={isSaving}
                                            onToggle={cardId => void chooseCard(cardId)}
                                        />
                                    </div>
                                </>
                            )}
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
                                통신사와 페이를 알려주세요
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-gray-500">
                                쓰는 것만 고르면 돼요. 없으면 그냥 넘어가도 괜찮아요.
                            </p>
                            <div className="mt-5 space-y-6">
                                <fieldset>
                                    <legend className="text-xs font-black text-gray-700">통신사 멤버십</legend>
                                    <div className="mt-2 grid grid-cols-1 gap-2">
                                        {telecomProviders.map(provider => (
                                            <ProviderButton
                                                key={provider.id}
                                                provider={provider}
                                                selected={selectedTelecomId === provider.id}
                                                disabled={isSaving}
                                                onClick={() => {
                                                    setIsEditingTelecom(false);
                                                    void persistProfile({
                                                        ...benefitProfile,
                                                        telecomMemberships: selectedTelecomId === provider.id
                                                            ? []
                                                            : [defaultTelecomMembership(
                                                                provider.id,
                                                                getTelecomTierOptions(provider.id, catalog?.promotions ?? []),
                                                            )],
                                                    });
                                                }}
                                            />
                                        ))}
                                    </div>
                                    {selectedTelecomId && !isEditingTelecom && (
                                        <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2">
                                            <span className="text-[11px] font-bold text-gray-600">
                                                {[
                                                    selectedTelecom?.mode === 'DISCOUNT' && '할인형',
                                                    selectedTelecom?.mode === 'POINTS' && '적립형',
                                                    selectedTelecomTier,
                                                ].filter(Boolean).join(' · ') || '등급 미선택'}으로 계산해요
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setIsEditingTelecom(true)}
                                                className="min-h-9 shrink-0 rounded-lg px-2 text-[11px] font-black text-blue-700 underline underline-offset-2"
                                            >바꾸기</button>
                                        </div>
                                    )}
                                </fieldset>
                                {selectedTelecomId === 'skt' && (isEditingTelecom || isTelecomModeMissing) && (
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
                                {selectedTelecomId && telecomTierOptions.length > 0 &&
                                    (isEditingTelecom || isTelecomTierMissing) && (
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
                                                    selected={selectedTelecomTier === tier}
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
                                    <div className="mt-2 grid grid-cols-1 gap-2">
                                        {payProviders.map(provider => (
                                            <ProviderButton
                                                key={provider.id}
                                                provider={provider}
                                                selected={benefitProfile.enabledPayProviderIds.includes(provider.id)}
                                                disabled={isSaving}
                                                note={provider.id === KAKAOPAY_PROVIDER_ID ? '굿딜 할인도 함께 계산해요' : undefined}
                                                onClick={() => void persistProfile({
                                                    ...benefitProfile,
                                                    enabledPayProviderIds: togglePayProvider(
                                                        benefitProfile.enabledPayProviderIds,
                                                        provider.id,
                                                    ),
                                                })}
                                            />
                                        ))}
                                    </div>
                                </fieldset>
                                <LocalDataPrivacyNotice />
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
                            (step === 'CARDS' && (selectedCardIds.length === 0 || isSpendTierMissing)) ||
                            (step === 'BENEFITS' && isTelecomSetupIncomplete)}
                        onClick={() => {
                            if (step === 'WELCOME') void goToStep('CARDS');
                            if (step === 'CARDS') void continueFromCards();
                            if (step === 'BENEFITS') void startRecommendation();
                        }}
                        className="ml-auto flex min-h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
                    >
                        {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {step === 'WELCOME'
                            ? '내 카드로 시작하기'
                            : step === 'BENEFITS'
                                ? '첫 추천 받아보기'
                                : '다음'}
                        {!isSaving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </button>
                </div>
                {step === 'BENEFITS' && (
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
