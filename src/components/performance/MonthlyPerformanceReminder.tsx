import Link from 'next/link';
import { useMemo } from 'react';
import { CalendarClock, ChevronRight, LoaderCircle } from 'lucide-react';
import clsx from 'clsx';
import type { BenefitRule, Card } from '@/types';
import { getPerformanceTierOptions } from '@/utils/firstSetupDefaults';

interface MonthlyPerformanceReminderProps {
    /** Owned cards with spend tiers and no spend saved for the performance month. */
    cards: Card[];
    rules: BenefitRule[];
    performanceMonthLabel: string;
    benefitMonthLabel: string;
    savingCardId?: string;
    onPickTier: (cardId: string, amount: number) => void;
}

/** Asks last month's spend one card at a time, as that card's own tiers. */
export function MonthlyPerformanceReminder({
    cards,
    rules,
    performanceMonthLabel,
    benefitMonthLabel,
    savingCardId,
    onPickTier,
}: MonthlyPerformanceReminderProps) {
    const card = cards[0];
    const tiers = useMemo(
        () => card ? getPerformanceTierOptions(card, rules) : [],
        [card, rules]
    );
    if (!card || tiers.length === 0) return null;
    const isSaving = savingCardId === card.id;

    return (
        <aside className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm" aria-live="polite">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
                    {isSaving
                        ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                        : <CalendarClock className="h-5 w-5" aria-hidden="true" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id={`performance-reminder-${card.id}`} className="text-sm font-black text-gray-900">
                            {performanceMonthLabel}에 {card.name} 얼마나 썼나요?
                        </h2>
                        {cards.length > 1 && (
                            <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-black text-amber-800">
                                {cards.length}장 중 1장
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-amber-900/70">
                        대략 골라 주시면 {benefitMonthLabel} 카드 혜택과 한도를 계산해요.
                    </p>
                </div>
            </div>
            <div
                role="radiogroup"
                aria-labelledby={`performance-reminder-${card.id}`}
                className="mt-3 grid grid-cols-2 gap-2"
            >
                {tiers.map(tier => (
                    <button
                        key={tier.amount}
                        type="button"
                        role="radio"
                        aria-checked={false}
                        disabled={isSaving}
                        onClick={() => onPickTier(card.id, tier.amount)}
                        className={clsx(
                            'min-h-12 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-left',
                            'transition-colors hover:border-amber-400 disabled:opacity-60'
                        )}
                    >
                        <span className="block text-xs font-black text-gray-900">{tier.label}</span>
                        {tier.detail && (
                            <span className="mt-0.5 block text-[10px] font-bold text-gray-500">{tier.detail}</span>
                        )}
                    </button>
                ))}
            </div>
            <Link
                href="/settings#performance"
                className="mt-3 inline-flex items-center gap-1 text-xs font-black text-amber-800 transition-colors hover:text-amber-950"
            >
                정확한 금액으로 입력하기
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
        </aside>
    );
}
