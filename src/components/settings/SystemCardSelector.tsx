'use client';

import { Check, CreditCard, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import type { Card } from '@/types';

export function SystemCardSelector({
    cards,
    selectedCardIds,
    disabled = false,
    onToggle,
}: {
    cards: Card[];
    selectedCardIds: string[];
    disabled?: boolean;
    onToggle: (cardId: string) => void;
}) {
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
    const filteredCards = useMemo(() => cards.filter(card => (
        !normalizedQuery ||
        card.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery) ||
        card.company.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
    )), [cards, normalizedQuery]);
    const selected = new Set(selectedCardIds);

    return (
        <div>
            <label className="relative block">
                <span className="sr-only">카드 이름 또는 카드사 검색</span>
                <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                    aria-hidden="true"
                />
                <input
                    type="search"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="카드 이름 또는 카드사 검색"
                    className="min-h-11 w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 text-sm font-bold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
            </label>

            <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1" aria-live="polite">
                {filteredCards.map(card => {
                    const isSelected = selected.has(card.id);
                    return (
                        <button
                            key={card.id}
                            type="button"
                            disabled={disabled}
                            aria-pressed={isSelected}
                            onClick={() => onToggle(card.id)}
                            className={clsx(
                                'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-wait disabled:opacity-60',
                                isSelected
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                            )}
                        >
                            <span className={clsx(
                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white',
                                card.color || 'bg-gray-500'
                            )}>
                                <CreditCard className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-black text-gray-900">
                                    {card.name}
                                </span>
                                <span className="mt-0.5 block text-[11px] font-bold text-gray-500">
                                    {card.company}
                                </span>
                            </span>
                            <span className={clsx(
                                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                                isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-gray-200 bg-white text-transparent'
                            )}>
                                <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                            </span>
                        </button>
                    );
                })}
                {filteredCards.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                        <p className="text-sm font-black text-gray-700">검색 결과가 없어요</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                            카드사나 카드 이름을 다르게 검색해 보세요. 지원 카드가 아니라면
                            비공개 베타 운영자에게 카카오톡으로 알려주세요.
                        </p>
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            className="mt-3 min-h-11 rounded-xl bg-gray-900 px-4 text-xs font-black text-white"
                        >
                            검색어 지우기
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
