'use client';

import clsx from 'clsx';
import { Wallet } from 'lucide-react';
import { usePaymentAppPreferences } from '@/hooks/usePaymentAppPreferences';
import { useWorkspacePaymentPreferences } from '@/hooks/useWorkspacePaymentPreferences';
import { useAppStore } from '@/store/useAppStore';
import type { Card, PaymentOpenMode, PaymentPayId } from '@/types';
import { PAYMENT_APPS } from '@/utils/paymentAppLinks';
import {
    getEffectiveDefaultMethod,
    getOpenablePayIds,
    getOpenMode,
    getPayRouteStatus,
    PAYMENT_PAY_NAMES,
    setPayRouteCheck,
    type PayRouteStatus,
} from '@/utils/paymentPreferences';

const PAY_APP_IDS = { kakaopay: 'kakaotalk', naverpay: 'naverpay' } as const;
const CODE_LABELS: Record<PaymentPayId, string> = { kakaopay: '바코드', naverpay: 'QR' };
const MODE_LABEL = (payId: PaymentPayId, mode: PaymentOpenMode) =>
    mode === 'SAMSUNG_PAY' ? '삼성페이' : CODE_LABELS[payId];

function Segmented<T extends string>({
    label,
    value,
    options,
    disabled,
    onChange,
}: {
    label: string;
    value: T;
    options: Array<{ value: T; label: string }>;
    disabled?: boolean;
    onChange: (value: T) => void;
}) {
    return (
        <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-gray-100 p-1">
            {options.map(option => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={value === option.value}
                    disabled={disabled}
                    onClick={() => value !== option.value && onChange(option.value)}
                    className={clsx(
                        'min-h-11 flex-1 rounded-xl px-2 text-[11px] font-black transition-colors',
                        value === option.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    )}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

export function PaymentMethodSettings({ cards }: { cards: Card[] }) {
    const enabledPayProviderIds = useAppStore(state => state.benefitProfile.enabledPayProviderIds);
    const { payment, update, isSaving } = useWorkspacePaymentPreferences();
    const { preferences: browserPreferences, setHidden } = usePaymentAppPreferences();
    const payIds = getOpenablePayIds(enabledPayProviderIds);
    const defaultMethod = getEffectiveDefaultMethod(payment, enabledPayProviderIds);
    const cardCompanies = [...new Set(cards.map(card => card.company).filter(Boolean))];
    const modeOf = (payId: PaymentPayId) => getOpenMode(
        payment,
        payId,
        browserPreferences.preferredModes[PAY_APP_IDS[payId]],
    );
    const hiddenPayApps = payIds.filter(payId => (
        browserPreferences.hiddenAppIds.includes(PAY_APP_IDS[payId])
    ));

    return (
        <section id="payment-methods" className="scroll-mt-24">
            <div className="mb-4 flex items-center gap-2 px-1">
                <div className="rounded-lg bg-gray-100 p-2 text-gray-700">
                    <Wallet className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">결제수단</h2>
                    <p className="text-[10px] text-gray-500">
                        페이 혜택이 없는 결제에서 먼저 보여 줄 수단과 앱을 여는 방식이에요.
                    </p>
                </div>
            </div>
            <div className="space-y-5 rounded-3xl border border-gray-100 bg-white p-4 shadow-sm">
                {payIds.length === 0 ? (
                    <p className="rounded-2xl bg-gray-50 px-3 py-4 text-center text-[11px] font-bold text-gray-500">
                        위 혜택 설정에서 카카오페이나 네이버페이를 등록하면 고를 수 있어요.
                    </p>
                ) : (
                    <>
                        <div className="space-y-2">
                            <p className="text-[11px] font-black text-gray-900">기본 결제수단</p>
                            <Segmented
                                label="기본 결제수단"
                                value={defaultMethod}
                                disabled={isSaving}
                                options={[
                                    { value: 'CARD', label: '카드로 내기' },
                                    ...payIds.map(payId => ({ value: payId, label: PAYMENT_PAY_NAMES[payId] })),
                                ]}
                                onChange={value => void update(current => ({ ...current, defaultMethod: value }))}
                            />
                        </div>

                        <div className="space-y-3">
                            <p className="text-[11px] font-black text-gray-900">앱을 여는 방식</p>
                            {payIds.map(payId => (
                                <div key={payId} className="space-y-1.5">
                                    <p className="text-[10px] font-bold text-gray-500">{PAYMENT_PAY_NAMES[payId]}</p>
                                    <Segmented
                                        label={`${PAYMENT_PAY_NAMES[payId]} 여는 방식`}
                                        value={modeOf(payId)}
                                        disabled={isSaving}
                                        options={[
                                            { value: 'SAMSUNG_PAY', label: '삼성페이' },
                                            { value: 'CODE', label: CODE_LABELS[payId] },
                                        ]}
                                        onChange={mode => void update(current => ({
                                            ...current,
                                            openModes: { ...current.openModes, [payId]: mode },
                                        }))}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <p className="text-[11px] font-black text-gray-900">페이로 냈을 때 카드 혜택</p>
                                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-gray-500">
                                    페이 결제는 카드사·여는 방식에 따라 카드 혜택이 빠지기도 해요.
                                    직접 써 보고 확인한 결과를 적어 두면 결제 화면에 표시해요.
                                </p>
                            </div>
                            {cardCompanies.length === 0 && (
                                <p className="text-[10px] font-bold text-gray-400">내 카드를 고르면 여기에 나와요.</p>
                            )}
                            {cardCompanies.flatMap(cardCompany => payIds.map(payId => {
                                const route = { payId, mode: modeOf(payId), cardCompany };
                                const status = getPayRouteStatus(payment, route);
                                return (
                                    <div key={`${cardCompany}:${payId}`} className="space-y-1.5" data-testid="pay-route-setting">
                                        <p className="text-[10px] font-bold text-gray-500">
                                            {cardCompany} · {PAYMENT_PAY_NAMES[payId]} {MODE_LABEL(payId, route.mode)}
                                        </p>
                                        <Segmented<PayRouteStatus>
                                            label={`${cardCompany} ${PAYMENT_PAY_NAMES[payId]} 카드 혜택`}
                                            value={status}
                                            disabled={isSaving}
                                            options={[
                                                { value: 'UNCHECKED', label: '모름' },
                                                { value: 'APPLIED', label: '들어와요' },
                                                { value: 'NOT_APPLIED', label: '안 들어와요' },
                                            ]}
                                            onChange={next => void update(current => setPayRouteCheck(
                                                current,
                                                route,
                                                next === 'UNCHECKED' ? undefined : next === 'APPLIED',
                                            ))}
                                        />
                                    </div>
                                );
                            }))}
                        </div>

                        {hiddenPayApps.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {hiddenPayApps.map(payId => (
                                    <button
                                        key={payId}
                                        type="button"
                                        onClick={() => setHidden(PAY_APP_IDS[payId], false)}
                                        className="min-h-11 rounded-xl border border-gray-200 px-3 text-[11px] font-black text-gray-700"
                                    >
                                        숨긴 {PAYMENT_APPS[PAY_APP_IDS[payId]].name} 버튼 다시 보이기
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
