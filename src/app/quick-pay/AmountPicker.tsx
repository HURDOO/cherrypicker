'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { PaymentAppButtons } from '@/components/payment/PaymentAppButtons';
import { calculateBestCombinations, type CombinationEngineInput } from '@/utils/combination';
import { getFundingLabel } from '@/utils/combinationPresentation';
import { getPayChoiceActions, getPaymentAppActions, isTMembershipPartner } from '@/utils/paymentAppLinks';
import { KtBarcode } from './KtBarcode';
import { getOpenablePayIds } from '@/utils/paymentPreferences';
import { findAmountBrackets, formatBracketBenefit, getCombinationActionKey, pickSteadyCombination } from './amountBrackets';

const demoCards = ['shinhan_heyoung', 'kb_nori2_check_kbpay', 'kb_nori2_student', 'tossbank_check_offline'];
type Input = Omit<CombinationEngineInput, 'amount'>;

function StepTitle({ number, title }: { number: number; title: string }) {
    return <h3 className="flex items-center gap-2 text-base font-bold">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-lg font-black leading-none text-white">{number}</span>
        {title}
    </h3>;
}

export function AmountPicker({ input, ownedCards, demo, month }: {
    input: Input;
    ownedCards: Input['cards'];
    demo: boolean;
    month: string;
}) {
    const [selected, setSelected] = useState<number | null>(null);
    const [carrier, setCarrier] = useState<'skt' | 'kt'>('skt');
    const context = useMemo((): Input => {
        if (!demo) return { ...input, cards: ownedCards };
        const cards = input.cards.filter(card => demoCards.includes(card.id));
        return {
            ...input, cards, history: [], promotionUsage: {},
            performances: cards.map(card => ({ cardId: card.id, performanceMonth: month, amount: 300_000 })),
            profile: { ...input.profile, telecomMemberships: [{ providerId: carrier, tier: 'GOLD', mode: 'DISCOUNT' }],
                enabledPayProviderIds: ['naverpay', 'kakaopay', 'kakaopay-gooddeal'], subscriptions: [], moneyEnabled: true, pointsEnabled: false },
        };
    }, [carrier, demo, input, month, ownedCards]);
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
        <section className="px-3 pb-8">
            <h2 className="text-xl font-bold tracking-tight">{brackets.length === 1 ? '이렇게 결제하세요' : '결제 금액을 골라주세요'}</h2>
            <p className="mb-5 mt-1 text-xs text-slate-600">{demo && <label>예시 지갑 · <select aria-label="예시 멤버십" value={carrier}
                onChange={event => { setCarrier(event.target.value === 'kt' ? 'kt' : 'skt'); setSelected(null); }} className="font-bold underline">
                <option value="skt">T멤버십</option><option value="kt">KT멤버십</option></select> · </label>}1천 원~10만 원 기준 예상 추천</p>
            <div>
                {brackets.map((range, index) => {
                    const open = brackets.length === 1 || selected === index;
                    const result = range.low;
                    const discounts = result?.steps.filter(step => step.layer === 'DISCOUNT' && step.benefitAmount > 0) ?? [];
                    const firstAmount = index === 0 && range.to ? range.to : range.from;
                    const secondAmount = index > 0 ? range.to : undefined;
                    const qualifier = range.to ? '미만' : '이상';
                    const benefit = formatBracketBenefit(
                        { amount: range.from, benefit: range.low?.confirmedValue ?? 0 },
                        { amount: range.highAmount, benefit: range.high?.confirmedValue ?? 0 },
                        { amount: range.midAmount, benefit: range.mid?.confirmedValue ?? 0 },
                    );
                    const [baseBenefit, cap] = benefit.split(' · ');
                    const [rangeStart, rangeEnd] = baseBenefit.split('~');
                    const choices = result && !context.isOnline ? getPayChoiceActions(result, getOpenablePayIds(context.profile.enabledPayProviderIds)) : undefined;
                    const payOptions = [choices?.naverpay, choices?.kakaopay].filter(action => action !== undefined);
                    const payActions = result && !context.isOnline ? getPaymentAppActions(result, 'PAY') : [];
                    const hasKt = !context.isOnline && result?.steps.some(step => step.providerId === 'kt');
                    const showMembership = discounts.length > 0 || partner || Boolean(hasKt);
                    const hasBenefit = result && result.confirmedValue + result.conditionalValue > 0;
                    return (
                        <div key={range.from} className="relative">
                            {brackets.length > 1 && <>
                                <span aria-hidden="true" className={'absolute left-[9px] w-px bg-slate-300 ' +
                                    (index === 0 ? 'top-9 bottom-0' : index === brackets.length - 1 ? 'top-0 h-9' : 'inset-y-0')} />
                                <button type="button" aria-expanded={open} onClick={() => setSelected(open ? null : index)}
                                    className="group relative flex min-h-[72px] w-full cursor-pointer touch-manipulation items-center gap-1 min-[375px]:gap-2 rounded-xl py-2 pr-1 text-left hover:bg-rose-50/60 focus-visible:outline-2 focus-visible:outline-rose-600 active:bg-rose-100 motion-safe:transition-colors">
                                    <span aria-hidden="true" className="z-10 grid w-[19px] shrink-0 place-items-center">
                                        <span className={open ? 'size-3 rounded-full bg-rose-700 ring-4 ring-rose-100' : 'size-1.5 rounded-full bg-slate-400'} />
                                    </span>
                                    <span className={'min-w-0 flex-1 whitespace-nowrap tabular-nums ' + (open ? 'text-rose-700' : 'text-slate-950')}>
                                        <strong className="inline-flex items-baseline text-[clamp(19px,5.7vw,30px)] leading-tight tracking-[-0.045em]">
                                            {firstAmount.toLocaleString('ko-KR')}
                                            {secondAmount !== undefined ? <>
                                                <span aria-hidden="true" className="mx-[0.24em] self-center text-[0.64em] font-medium text-slate-400">~</span>
                                                <span className="sr-only">원 이상 </span>
                                                {secondAmount.toLocaleString('ko-KR')}
                                                <span className="ml-0.5 text-xs font-semibold tracking-normal text-slate-600">원</span>
                                                <span className="sr-only"> 미만</span>
                                            </> : <span className="ml-1 text-xs font-semibold tracking-normal text-slate-600">원 {qualifier}</span>}
                                        </strong>
                                    </span>
                                    {benefit !== '혜택 없음' && <span className="shrink-0 text-right tabular-nums text-slate-600">
                                        <span className="sr-only">예상 혜택 </span>
                                        <span className="block text-[clamp(14px,3.9vw,18px)] font-semibold tracking-tight">{rangeEnd ? rangeStart + '원~' : baseBenefit}</span>
                                        {cap && <span className="block text-xs">{cap}</span>}
                                    </span>}
                                    <span aria-hidden="true" className={'grid size-6 shrink-0 place-items-center rounded-full motion-safe:transition-transform motion-safe:group-active:scale-90 ' +
                                        (open ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800 group-hover:bg-rose-200')}>
                                        <ChevronRight size={17} strokeWidth={2.5} className={'motion-safe:transition-transform ' + (open ? '-rotate-90' : '')} />
                                    </span>
                                </button>
                            </>}
                            {open && <div className={'space-y-4 pb-5 ' + (brackets.length > 1 ? 'pl-8' : '')}>
                                {result && <>
                                    {showMembership && <div>
                                        <StepTitle number={1} title="멤버십 제시" />
                                        {discounts.filter(step => step.providerId !== 'skt').map(step => (
                                            <p key={step.id} className="mt-1 text-sm font-semibold">{step.providerName}</p>
                                        ))}
                                        {partner && !discounts.some(step => step.providerId === 'skt') &&
                                            <p className="mt-1 text-xs text-slate-600">대상 상품에 한해 할인·적립</p>}
                                        {hasKt && <KtBarcode demo={demo} />}
                                        {!context.isOnline && <PaymentAppButtons preview actions={getPaymentAppActions(result, 'DISCOUNT', { tMembershipPartner: partner })} />}
                                    </div>}
                                    <div><StepTitle number={showMembership ? 2 : 1} title="결제" />
                                        <p className="mt-1 text-lg font-bold">{[result.payProviderName, getFundingLabel(result)].filter(Boolean).join(' · ')}</p>
                                        <PaymentAppButtons preview actions={payActions} />
                                        {payOptions.length > 0 && <>
                                            <PaymentAppButtons preview actions={payOptions} />
                                            <p className="mt-1.5 text-xs text-slate-600">앱에서 연결 카드와 혜택 적용 여부를 확인하세요.</p>
                                        </>}
                                    </div>
                                    {benefit !== '혜택 없음' && <p className="text-sm text-slate-700">예상 혜택 <strong>{benefit}</strong></p>}
                                    {result.requiredChecks.map(check => <p key={check} className="text-sm text-amber-900">{check}</p>)}
                                </>}
                                {!hasBenefit && <p className="text-sm font-semibold">이 구간에서 확인된 혜택이 없어요.</p>}
                            </div>}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
