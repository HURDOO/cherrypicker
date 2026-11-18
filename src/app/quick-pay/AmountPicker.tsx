'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, CreditCard } from 'lucide-react';
import { PaymentAppButtons } from '@/components/payment/PaymentAppButtons';
import { calculateBestCombinations, type CombinationEngineInput } from '@/utils/combination';
import { getFundingLabel } from '@/utils/combinationPresentation';
import { getPaymentAppActions, isTMembershipPartner } from '@/utils/paymentAppLinks';
import { findAmountBrackets, formatBracketBenefit, formatBracketRange, getCombinationActionKey, pickSteadyCombination } from './amountBrackets';

const demoCards = ['shinhan_heyoung', 'kb_nori2_check_kbpay', 'kb_nori2_student', 'tossbank_check_offline'];
type Input = Omit<CombinationEngineInput, 'amount'>;

export function AmountPicker({ input, ownedCards, demo, month }: {
    input: Input;
    ownedCards: Input['cards'];
    demo: boolean;
    month: string;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const context = useMemo((): Input => {
        if (!demo) return { ...input, cards: ownedCards };
        const cards = input.cards.filter(card => demoCards.includes(card.id));
        return {
            ...input, cards, history: [], promotionUsage: {},
            performances: cards.map(card => ({ cardId: card.id, performanceMonth: month, amount: 300_000 })),
            profile: { ...input.profile, telecomMemberships: [{ providerId: 'skt', tier: 'GOLD', mode: 'DISCOUNT' }],
                enabledPayProviderIds: ['naverpay', 'kakaopay'], subscriptions: [], moneyEnabled: true, pointsEnabled: false },
        };
    }, [demo, input, month, ownedCards]);
    const brackets = useMemo(() => {
        const at = (amount: number) => calculateBestCombinations({ ...context, amount }).combinations;
        return findAmountBrackets(amount => {
            const choices = at(amount);
            return choices.length > 1 && choices[0].confirmedValue === choices[1].confirmedValue
                ? pickSteadyCombination(choices, at(amount + 100)[0]) : choices[0];
        }, getCombinationActionKey);
    }, [context]);
    const partner = !context.isOnline && isTMembershipPartner(context.promotions,
        context.target.kind === 'BRAND' ? context.target.brand.id : undefined, context.profile.telecomMemberships);
    return (
        <section className="px-2 pb-8">
            <h2 className="text-[26px] font-black tracking-tight">{brackets.length === 1 ? '이렇게 결제하세요' : '결제 금액을 골라주세요'}</h2>
            <p className="mb-4 mt-1 text-xs text-slate-600">{demo ? '예시 지갑 · ' : ''}1천 원~10만 원 기준 예상 추천</p>
            <div className="space-y-2">
                {brackets.map((range, index) => {
                    const open = brackets.length === 1 || selected === index;
                    const result = range.low;
                    const discounts = result?.steps.filter(step => step.layer === 'DISCOUNT' && step.benefitAmount > 0) ?? [];
                    const label = formatBracketRange(range, index === 0);
                    const benefit = formatBracketBenefit(
                        { amount: range.from, benefit: range.low?.confirmedValue ?? 0 },
                        { amount: range.highAmount, benefit: range.high?.confirmedValue ?? 0 },
                        { amount: range.midAmount, benefit: range.mid?.confirmedValue ?? 0 },
                    );
                    const hasBenefit = result && result.confirmedValue + result.conditionalValue > 0;
                    return (
                        <div key={range.from} className={'rounded-2xl border bg-white ' + (open ? 'border-rose-400 shadow-sm' : 'border-slate-200')}>
                            {brackets.length > 1 && <button type="button" aria-expanded={open} onClick={() => setSelected(open ? null : index)}
                                className="flex min-h-16 w-full items-center justify-between px-4 text-left text-lg font-bold tabular-nums tracking-tight">
                                {label}{index > 0 && range.to ? ' 미만' : ''}<ChevronDown size={18} className={open ? 'rotate-180 text-rose-600' : 'text-slate-500'} />
                            </button>}
                            {open && <div className="space-y-4 rounded-2xl bg-rose-50/60 p-4">
                                {hasBenefit ? <>
                                    {(discounts.length > 0 || partner) && <div>
                                        <p className="text-xs font-bold text-rose-700">먼저 보여주기</p>
                                        <p className="mt-1 font-bold">{discounts.map(step => step.providerName).join(' · ') || 'T멤버십 (대상 상품일 때)'}</p>
                                        <PaymentAppButtons actions={getPaymentAppActions(result, 'DISCOUNT', { tMembershipPartner: partner })} />
                                    </div>}
                                    <div><p className="flex items-center gap-2 text-xs font-bold text-rose-700"><CreditCard size={15} />결제하기</p>
                                        <p className="mt-1 text-lg font-bold">{[result.payProviderName, getFundingLabel(result)].filter(Boolean).join(' · ')}</p>
                                        <PaymentAppButtons actions={getPaymentAppActions(result, 'PAY')} />
                                    </div>
                                    {benefit !== '혜택 없음' && <p className="border-t border-rose-100 pt-3 text-sm text-slate-700">예상 혜택 <strong>{benefit}</strong></p>}
                                    {result.requiredChecks.map(check => <p key={check} className="text-sm text-amber-900">{check}</p>)}
                                </> : <p className="text-sm font-semibold">확인된 혜택이 없어요. 평소 쓰는 수단으로 결제하세요.</p>}
                            </div>}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
