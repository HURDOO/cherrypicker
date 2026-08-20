'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Coins,
    LoaderCircle,
    PackagePlus,
    Plus,
    Save,
    ShieldCheck,
    Smartphone,
    X,
} from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { useBenefitCatalog } from '@/hooks/useBenefitCatalog';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import type {
    PromotionProvider,
    SubscriptionProduct,
    UserBenefitProfile,
} from '@/types';
import {
    canonicalizeSubscriptionProductName,
    findSubscriptionProduct,
    getSubscriptionProducts,
    normalizeSubscriptionProductName,
} from '@/utils/subscriptionProducts';
import {
    DEFAULT_SMALL_BENEFIT_THRESHOLD,
    MAX_SMALL_BENEFIT_THRESHOLD,
} from '@/utils/recommendationPreferences';

const emptyProfile: UserBenefitProfile = {
    telecomMemberships: [],
    subscriptions: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
    smallBenefitThreshold: DEFAULT_SMALL_BENEFIT_THRESHOLD,
};

const optionSummary = (value: string) =>
    value.length > 70 ? `${value.slice(0, 70).trim()}…` : value;

export function BenefitProfileSettings() {
    const addToast = useToastStore(state => state.addToast);
    const storedProfile = useAppStore(state => state.benefitProfile);
    const storageMode = useAppStore(state => state.storageMode);
    const setStoredProfile = useAppStore(state => state.setBenefitProfile);
    const catalogState = useBenefitCatalog();
    const [profile, setProfile] = useState<UserBenefitProfile>(storedProfile ?? emptyProfile);
    const [providers, setProviders] = useState<PromotionProvider[]>([]);
    const [subscriptionProducts, setSubscriptionProducts] = useState<SubscriptionProduct[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [savingSubscriptionProviderId, setSavingSubscriptionProviderId] = useState<string>();
    const [subscriptionDrafts, setSubscriptionDrafts] = useState<Record<string, string>>({});
    const telecomProviders = useMemo(
        () => providers.filter(provider => provider.kind === 'TELECOM'),
        [providers]
    );
    const payProviders = useMemo(
        () => providers.filter(provider =>
            provider.kind === 'PAY' || provider.kind === 'GOODDEAL'
        ),
        [providers]
    );
    const subscriptionProviders = useMemo(
        () => providers.filter(provider => provider.kind === 'SUBSCRIPTION'),
        [providers]
    );
    const selectedTelecom = profile.telecomMemberships[0];

    useEffect(() => {
        if (storageMode !== 'guest') return;

        setProfile(storedProfile);
        if (catalogState.snapshot) {
            setProviders(catalogState.snapshot.providers);
            setSubscriptionProducts(catalogState.snapshot.subscriptionProducts);
            setIsLoading(false);
        } else {
            setIsLoading(catalogState.isLoading);
            if (catalogState.error) {
                addToast(
                    getErrorMessage(catalogState.error, '혜택 목록을 불러오지 못했습니다.'),
                    'error'
                );
            }
        }
    }, [
        addToast,
        catalogState.error,
        catalogState.isLoading,
        catalogState.snapshot,
        storageMode,
        storedProfile,
    ]);

    useEffect(() => {
        if (storageMode !== 'account') return;

        let active = true;
        apiClient.getBenefitProfile()
            .then(result => {
                if (!active) return;
                setProfile(result.profile);
                setStoredProfile(result.profile);
                setProviders(result.providers);
                setSubscriptionProducts(result.subscriptionProducts);
            })
            .catch(error => {
                if (active) addToast(getErrorMessage(error, '혜택 프로필을 불러오지 못했습니다.'), 'error');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [addToast, setStoredProfile, storageMode]);

    const persistProfile = (nextProfile: UserBenefitProfile) => storageMode === 'guest'
        ? localWorkspaceClient.updateBenefitProfile(nextProfile)
        : apiClient.updateBenefitProfile(nextProfile);

    const save = async () => {
        setIsSaving(true);
        try {
            const saved = await persistProfile(profile);
            setProfile(saved);
            setStoredProfile(saved);
            addToast('혜택 설정을 저장했습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '보유 혜택 설정을 저장하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const addSubscription = async (providerId: string, requestedProductName?: string) => {
        const enteredProductName = (
            requestedProductName ?? subscriptionDrafts[providerId] ?? ''
        ).trim();
        if (!enteredProductName || savingSubscriptionProviderId) return;
        const productName = canonicalizeSubscriptionProductName(
            subscriptionProducts,
            providerId,
            enteredProductName,
        );
        if (!productName) return;
        if (profile.subscriptions.length >= 50) {
            addToast('구독 상품은 최대 50개까지 추가할 수 있습니다.', 'error');
            return;
        }
        const duplicate = profile.subscriptions.some(subscription => (
            subscription.providerId === providerId &&
            normalizeSubscriptionProductName(subscription.productName) ===
                normalizeSubscriptionProductName(productName)
        ));
        if (duplicate) {
            addToast('이미 추가한 구독 상품입니다.', 'error');
            return;
        }

        const previousSubscriptions = profile.subscriptions;
        const subscriptions = [
            ...previousSubscriptions,
            { providerId, productName },
        ];
        const nextProfile = { ...profile, subscriptions };
        setProfile(current => ({ ...current, subscriptions }));
        setSavingSubscriptionProviderId(providerId);

        try {
            const saved = await persistProfile(nextProfile);
            setProfile(current => ({ ...current, subscriptions: saved.subscriptions }));
            setStoredProfile(saved);
            setSubscriptionDrafts(current => ({ ...current, [providerId]: '' }));
            const supported = findSubscriptionProduct(
                subscriptionProducts,
                providerId,
                productName,
            );
            addToast(
                supported
                    ? `${supported.name}을 추가하고 혜택 추천에 반영했습니다.`
                    : '상품을 저장했습니다. 연결된 혜택 데이터가 생기면 추천에 반영됩니다.',
                'success'
            );
        } catch (error) {
            setProfile(current => ({
                ...current,
                subscriptions: previousSubscriptions,
            }));
            addToast(getErrorMessage(error, '구독 상품을 저장하지 못했습니다.'), 'error');
        } finally {
            setSavingSubscriptionProviderId(undefined);
        }
    };

    const removeSubscription = async (providerId: string, productName: string) => {
        if (savingSubscriptionProviderId) return;
        const previousSubscriptions = profile.subscriptions;
        const subscriptions = previousSubscriptions.filter(subscription => !(
            subscription.providerId === providerId &&
            subscription.productName === productName
        ));
        const nextProfile = { ...profile, subscriptions };
        setProfile(current => ({ ...current, subscriptions }));
        setSavingSubscriptionProviderId(providerId);

        try {
            const saved = await persistProfile(nextProfile);
            setProfile(current => ({ ...current, subscriptions: saved.subscriptions }));
            setStoredProfile(saved);
            addToast(`${productName}을 삭제했습니다.`, 'success');
        } catch (error) {
            setProfile(current => ({
                ...current,
                subscriptions: previousSubscriptions,
            }));
            addToast(getErrorMessage(error, '구독 상품을 삭제하지 못했습니다.'), 'error');
        } finally {
            setSavingSubscriptionProviderId(undefined);
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center rounded-3xl border border-gray-100 bg-white p-8">
                <LoaderCircle className="h-5 w-5 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <section id="benefit-profile" className="scroll-mt-24">
            <div className="mb-4 flex items-center gap-2 px-1">
                <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                    <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">혜택·추천 설정</h2>
                    <p className="text-[10px] text-gray-500">
                        보유 혜택과 추천 판단 기준을 관리합니다.
                    </p>
                </div>
            </div>

            <div className="space-y-6 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div>
                    <label className="text-xs font-black text-gray-700">통신사 멤버십</label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setProfile(current => ({
                                ...current,
                                telecomMemberships: [],
                            }))}
                            className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                !selectedTelecom
                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                    : 'border-gray-200 text-gray-500'
                            }`}
                        >
                            사용 안 함
                        </button>
                        {telecomProviders.map(provider => (
                            <button
                                type="button"
                                key={provider.id}
                                onClick={() => setProfile(current => ({
                                    ...current,
                                    telecomMemberships: [{ providerId: provider.id }],
                                }))}
                                className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                    selectedTelecom?.providerId === provider.id
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-gray-200 text-gray-500'
                                }`}
                            >
                                {provider.name}
                            </button>
                        ))}
                    </div>
                    {selectedTelecom && (
                        <input
                            value={selectedTelecom.tier ?? ''}
                            onChange={event => setProfile(current => ({
                                ...current,
                                telecomMemberships: [{
                                    ...selectedTelecom,
                                    tier: event.target.value,
                                }],
                            }))}
                            placeholder="등급 입력 (예: VIP, VVIP)"
                            className="mt-3 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold outline-none focus:border-blue-500"
                        />
                    )}
                </div>

                {subscriptionProviders.length > 0 && (
                    <div>
                        <div className="flex items-center gap-2">
                            <PackagePlus className="h-4 w-4 text-violet-500" />
                            <label className="text-xs font-black text-gray-700">T우주 구독 상품</label>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                            구독 중인 상품을 추가·삭제하면 바로 저장되고 전용 혜택에 반영돼요.
                            건별·일·월 한도는 앱에 기록한 사용 내역을 기준으로 계산해요.
                        </p>
                        <div className="mt-3 space-y-3">
                            {subscriptionProviders.map(provider => {
                                const subscriptions = profile.subscriptions.filter(
                                    subscription => subscription.providerId === provider.id
                                );
                                const supportedProducts = getSubscriptionProducts(
                                    subscriptionProducts,
                                    provider.id,
                                );
                                const availableProducts = supportedProducts.filter(product => (
                                    !subscriptions.some(subscription => (
                                        normalizeSubscriptionProductName(subscription.productName) ===
                                            normalizeSubscriptionProductName(product.name)
                                    ))
                                ));
                                const draft = subscriptionDrafts[provider.id] ?? '';
                                const isSavingSubscription = savingSubscriptionProviderId === provider.id;
                                return (
                                    <div
                                        key={provider.id}
                                        className="rounded-2xl border border-violet-100 bg-violet-50/50 p-3"
                                    >
                                        <p className="text-[10px] font-black text-violet-800">
                                            {provider.name}
                                        </p>
                                        {availableProducts.length > 0 && (
                                            <select
                                                value=""
                                                aria-label={`${provider.name} 혜택 연결 상품 선택`}
                                                disabled={Boolean(savingSubscriptionProviderId)}
                                                onChange={event => {
                                                    void addSubscription(provider.id, event.target.value);
                                                }}
                                                className="mt-2 w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold text-gray-700 outline-none focus:border-violet-400 disabled:opacity-60"
                                            >
                                                <option value="" disabled>
                                                    혜택 연결 상품에서 선택
                                                </option>
                                                {availableProducts.map(product => (
                                                    <option key={product.name} value={product.name}>
                                                        {product.name} — {optionSummary(product.benefitSummary)}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {subscriptions.length > 0 ? (
                                            <div className="mt-2 space-y-1.5">
                                                {subscriptions.map(subscription => {
                                                    const supported = findSubscriptionProduct(
                                                        subscriptionProducts,
                                                        provider.id,
                                                        subscription.productName,
                                                    );
                                                    return (
                                                        <div
                                                            key={subscription.productName}
                                                            className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-2.5 py-2 shadow-sm"
                                                        >
                                                            <div className="min-w-0 flex-1">
                                                                <p className="truncate text-[10px] font-black text-violet-700">
                                                                    {subscription.productName}
                                                                </p>
                                                                <p className={`mt-0.5 truncate text-[9px] font-bold ${
                                                                    supported ? 'text-emerald-600' : 'text-amber-600'
                                                                }`}>
                                                                    {supported
                                                                        ? `혜택 연결됨 · ${supported.benefitSummary}`
                                                                        : '저장됨 · 아직 연결된 혜택 데이터 없음'}
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                aria-label={`${subscription.productName} 삭제`}
                                                                disabled={Boolean(savingSubscriptionProviderId)}
                                                                onClick={() => {
                                                                    void removeSubscription(
                                                                        provider.id,
                                                                        subscription.productName,
                                                                    );
                                                                }}
                                                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-violet-400 hover:bg-violet-100 hover:text-violet-700 disabled:opacity-40"
                                                            >
                                                                <X className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="mt-2 text-[10px] text-gray-400">
                                                추가한 구독 상품이 없습니다.
                                            </p>
                                        )}
                                        <p className="mt-3 text-[9px] font-bold text-gray-400">
                                            목록에 없는 상품은 직접 입력할 수 있어요.
                                        </p>
                                        <div className="mt-3 flex gap-2">
                                            <input
                                                value={draft}
                                                maxLength={100}
                                                aria-label={`${provider.name} 구독 상품명`}
                                                placeholder="목록에 없는 상품명"
                                                disabled={Boolean(savingSubscriptionProviderId)}
                                                onChange={event => setSubscriptionDrafts(current => ({
                                                    ...current,
                                                    [provider.id]: event.target.value,
                                                }))}
                                                onKeyDown={event => {
                                                    if (event.key !== 'Enter') return;
                                                    event.preventDefault();
                                                    void addSubscription(provider.id);
                                                }}
                                                className="min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs font-bold outline-none focus:border-violet-400 disabled:opacity-60"
                                            />
                                            <button
                                                type="button"
                                                aria-label={`${provider.name} 구독 상품 추가`}
                                                disabled={
                                                    !draft.trim() ||
                                                    profile.subscriptions.length >= 50 ||
                                                    Boolean(savingSubscriptionProviderId)
                                                }
                                                onClick={() => {
                                                    void addSubscription(provider.id);
                                                }}
                                                className="flex shrink-0 items-center gap-1 rounded-xl bg-violet-600 px-3 py-2 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-gray-200"
                                            >
                                                {isSavingSubscription
                                                    ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                                    : <Plus className="h-3.5 w-3.5" />}
                                                {isSavingSubscription ? '저장 중' : '추가·저장'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div>
                    <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-gray-400" />
                        <label className="text-xs font-black text-gray-700">사용 가능한 페이</label>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        {payProviders.map(provider => {
                            const enabled = profile.enabledPayProviderIds.includes(provider.id);
                            return (
                                <button
                                    type="button"
                                    key={provider.id}
                                    onClick={() => setProfile(current => ({
                                        ...current,
                                        enabledPayProviderIds: enabled
                                            ? current.enabledPayProviderIds.filter(id => id !== provider.id)
                                            : [...current.enabledPayProviderIds, provider.id],
                                    }))}
                                    className={`rounded-xl border px-3 py-2 text-xs font-black ${
                                        enabled
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-gray-200 text-gray-500'
                                    }`}
                                >
                                    {provider.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {([
                        ['moneyEnabled', '페이머니'],
                        ['pointsEnabled', '포인트'],
                    ] as const).map(([key, label]) => (
                        <label
                            key={key}
                            className="flex cursor-pointer items-center justify-between rounded-xl border border-gray-200 px-3 py-3 text-xs font-black text-gray-700"
                        >
                            {label}
                            <input
                                type="checkbox"
                                checked={profile[key]}
                                onChange={event => setProfile(current => ({
                                    ...current,
                                    [key]: event.target.checked,
                                }))}
                                className="h-4 w-4 accent-blue-600"
                            />
                        </label>
                    ))}
                </div>

                <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                    <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-amber-600" />
                        <label
                            htmlFor="small-benefit-threshold"
                            className="text-xs font-black text-amber-950"
                        >
                            소액 혜택 기준
                        </label>
                    </div>
                    <p className="mt-1 text-[10px] leading-relaxed text-amber-900/65">
                        확정 혜택이 기준보다 작으면 소액으로 표시하고, 진행 중인 실적 목표가
                        있다면 실적 추천을 먼저 보여줘요. 0원으로 설정하면 소액 분류를 끕니다.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                        <input
                            id="small-benefit-threshold"
                            type="text"
                            inputMode="numeric"
                            value={profile.smallBenefitThreshold.toLocaleString()}
                            onChange={event => {
                                const digits = event.target.value.replace(/\D/g, '').slice(0, 7);
                                setProfile(current => ({
                                    ...current,
                                    smallBenefitThreshold: Math.min(
                                        Number(digits || 0),
                                        MAX_SMALL_BENEFIT_THRESHOLD,
                                    ),
                                }));
                            }}
                            aria-describedby="small-benefit-threshold-help"
                            className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-right text-sm font-black text-amber-950 outline-none focus:border-amber-500"
                        />
                        <span className="text-xs font-black text-amber-700">원 미만</span>
                    </div>
                    <p id="small-benefit-threshold-help" className="mt-2 text-[9px] font-bold text-amber-700/70">
                        기본값 {DEFAULT_SMALL_BENEFIT_THRESHOLD.toLocaleString()}원 · 최대 {MAX_SMALL_BENEFIT_THRESHOLD.toLocaleString()}원
                    </p>
                </div>

                <button
                    type="button"
                    onClick={save}
                    disabled={isSaving || Boolean(savingSubscriptionProviderId)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-xs font-black text-white disabled:opacity-60"
                >
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? '저장 중' : '혜택 설정 저장'}
                </button>
            </div>
        </section>
    );
}
