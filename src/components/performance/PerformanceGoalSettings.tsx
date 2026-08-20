'use client';

import { useState } from 'react';
import { CheckCircle2, Target } from 'lucide-react';
import type { BenefitRule, Card, UserCardPerformance } from '@/types';

type GoalDraft = {
    amount?: string;
    targetAmount?: string;
};

interface PerformanceGoalSettingsProps {
    cards: Card[];
    rules: BenefitRule[];
    performances: UserCardPerformance[];
    performanceMonthLabel: string;
    benefitMonthLabel: string;
    onSave: (
        cardId: string,
        amount: number,
        targetAmount: number | null,
    ) => Promise<void>;
}

const numericInput = (value: string) => value.replace(/[^0-9]/g, '').slice(0, 12);
const formatWon = (value: number) => `${value.toLocaleString()}원`;

export function PerformanceGoalSettings({
    cards,
    rules,
    performances,
    performanceMonthLabel,
    benefitMonthLabel,
    onSave,
}: PerformanceGoalSettingsProps) {
    const [drafts, setDrafts] = useState<Record<string, GoalDraft>>({});
    const [savingCardId, setSavingCardId] = useState<string>();
    const isBusy = Boolean(savingCardId);

    return (
        <section id="performance-goals" className="scroll-mt-24">
            <div className="mb-4 flex items-center gap-2 px-1">
                <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
                    <Target className="h-4 w-4" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-gray-900">{performanceMonthLabel} 실적 목표</h2>
                    <p className="text-[10px] text-gray-500">
                        {performanceMonthLabel} 누적액을 채워 {benefitMonthLabel} 카드 혜택을 준비합니다.
                    </p>
                </div>
            </div>

            <div className="space-y-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="rounded-2xl bg-violet-50 px-4 py-3 text-[10px] font-bold leading-relaxed text-violet-800">
                    이 앱에서 카드 결제를 기록하면 승인 예상액을 자동으로 더합니다. 실적 제외 항목이 있으면 누적액을 직접 고쳐 주세요.
                </div>

                {cards.map(card => {
                    const stored = performances.find(item => item.cardId === card.id);
                    const draft = drafts[card.id];
                    const amountValue = draft?.amount ?? String(stored?.amount ?? 0);
                    const targetValue = draft?.targetAmount ?? String(stored?.targetAmount ?? '');
                    const amount = amountValue === '' ? null : Number(amountValue);
                    const targetAmount = targetValue === '' ? null : Number(targetValue);
                    const changed = amount !== null && (
                        amount !== (stored?.amount ?? 0) ||
                        targetAmount !== (stored?.targetAmount ?? null)
                    );
                    const validTarget = targetAmount === null || targetAmount > 0;
                    const isSaving = savingCardId === card.id;
                    const saveLabel = isSaving
                        ? '저장 중'
                        : targetAmount === null
                            ? stored?.targetAmount ? '목표 해제 저장' : '누적액 저장'
                            : '실적 목표 저장';
                    const progress = targetAmount
                        ? Math.min(100, ((amount ?? 0) / targetAmount) * 100)
                        : 0;
                    const suggestions = [...new Set([
                        ...card.limitTable.map(tier => tier.threshold),
                        ...rules
                            .filter(rule => rule.cardId === card.id)
                            .map(rule => rule.condition.minPerformance ?? 0),
                    ].filter(value => value > 0))].sort((left, right) => left - right);

                    return (
                        <div key={card.id} className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-gray-900">{card.name}</p>
                                    <p className="mt-0.5 text-[10px] font-bold text-gray-400">{card.company}</p>
                                </div>
                                {stored?.targetAmount && stored.amount >= stored.targetAmount && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                                        <CheckCircle2 className="h-3 w-3" />
                                        목표 달성
                                    </span>
                                )}
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2">
                                <label className="text-[10px] font-black text-gray-500">
                                    현재 누적액
                                    <div className="mt-1 flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-violet-400 focus-within:bg-white">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={amountValue}
                                            aria-label={`${card.name} ${performanceMonthLabel} 누적 실적`}
                                            disabled={isBusy}
                                            onChange={event => setDrafts(current => ({
                                                ...current,
                                                [card.id]: {
                                                    ...current[card.id],
                                                    amount: numericInput(event.target.value),
                                                },
                                            }))}
                                            className="min-w-0 flex-1 bg-transparent text-right text-sm font-black text-violet-700 outline-none"
                                        />
                                        <span className="ml-1 text-[10px] font-bold text-gray-400">원</span>
                                    </div>
                                </label>
                                <label className="text-[10px] font-black text-gray-500">
                                    다음 달 목표액
                                    <div className="mt-1 flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-violet-400 focus-within:bg-white">
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={targetValue}
                                            placeholder="목표 없음"
                                            aria-label={`${card.name} ${performanceMonthLabel} 실적 목표`}
                                            disabled={isBusy}
                                            onChange={event => setDrafts(current => ({
                                                ...current,
                                                [card.id]: {
                                                    ...current[card.id],
                                                    targetAmount: numericInput(event.target.value),
                                                },
                                            }))}
                                            className="min-w-0 flex-1 bg-transparent text-right text-sm font-black text-violet-700 outline-none placeholder:text-gray-300"
                                        />
                                        <span className="ml-1 text-[10px] font-bold text-gray-400">원</span>
                                    </div>
                                </label>
                            </div>

                            {suggestions.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {suggestions.map(suggestion => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => setDrafts(current => ({
                                                ...current,
                                                [card.id]: {
                                                    ...current[card.id],
                                                    targetAmount: String(suggestion),
                                                },
                                            }))}
                                            disabled={isBusy}
                                            className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black text-gray-500 hover:bg-violet-100 hover:text-violet-700"
                                        >
                                            {formatWon(suggestion)} 목표
                                        </button>
                                    ))}
                                </div>
                            )}

                            {targetAmount !== null && (
                                <div className="mt-3">
                                    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-violet-400 to-violet-600"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <div className="mt-1.5 flex justify-between text-[9px] font-bold text-gray-400">
                                        <span>{formatWon(amount ?? 0)} 누적</span>
                                        <span>{formatWon(Math.max(0, targetAmount - (amount ?? 0)))} 남음</span>
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                disabled={!changed || !validTarget || isBusy}
                                onClick={() => {
                                    if (amount === null || !validTarget) return;
                                    setSavingCardId(card.id);
                                    void onSave(card.id, amount, targetAmount)
                                        .then(() => setDrafts(current => {
                                            const next = { ...current };
                                            delete next[card.id];
                                            return next;
                                        }))
                                        .catch(() => undefined)
                                        .finally(() => setSavingCardId(undefined));
                                }}
                                className="mt-3 w-full rounded-xl bg-violet-600 px-3 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                            >
                                {saveLabel}
                            </button>
                        </div>
                    );
                })}

                {cards.length === 0 && (
                    <p className="py-6 text-center text-xs font-bold text-gray-400">
                        실적 목표를 설정할 카드가 없습니다.
                    </p>
                )}
            </div>
        </section>
    );
}
