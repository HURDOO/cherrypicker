'use client';

import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Save, ShieldCheck, Smartphone } from 'lucide-react';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { useToastStore } from '@/store/useToastStore';
import type { PromotionProvider, UserBenefitProfile } from '@/types';

const emptyProfile: UserBenefitProfile = {
    telecomMemberships: [],
    enabledPayProviderIds: [],
    moneyEnabled: true,
    pointsEnabled: true,
    pointValue: 1,
};

export function BenefitProfileSettings() {
    const addToast = useToastStore(state => state.addToast);
    const [profile, setProfile] = useState<UserBenefitProfile>(emptyProfile);
    const [providers, setProviders] = useState<PromotionProvider[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
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
    const selectedTelecom = profile.telecomMemberships[0];

    useEffect(() => {
        let active = true;
        apiClient.getBenefitProfile()
            .then(result => {
                if (!active) return;
                setProfile(result.profile);
                setProviders(result.providers);
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
    }, [addToast]);

    const save = async () => {
        setIsSaving(true);
        try {
            const saved = await apiClient.updateBenefitProfile(profile);
            setProfile(saved);
            addToast('보유 혜택 설정을 저장했습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '보유 혜택 설정을 저장하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
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
                    <h2 className="text-sm font-bold text-gray-900">보유 혜택 프로필</h2>
                    <p className="text-[10px] text-gray-500">
                        내가 실제로 사용할 수 있는 통신사와 페이만 추천합니다.
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

                <button
                    type="button"
                    onClick={save}
                    disabled={isSaving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 py-3 text-xs font-black text-white disabled:opacity-60"
                >
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? '저장 중' : '보유 혜택 저장'}
                </button>
            </div>
        </section>
    );
}
