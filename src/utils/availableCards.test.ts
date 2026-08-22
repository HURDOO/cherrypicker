import { describe, expect, it } from 'vitest';
import type { Card } from '@/types';
import { selectAvailableCards } from './availableCards';

const cards: Card[] = [
    {
        id: 'system-a',
        name: '시스템 A',
        company: '테스트',
        color: 'bg-blue-500',
        limitTable: [],
    },
    {
        id: 'system-b',
        name: '시스템 B',
        company: '테스트',
        color: 'bg-green-500',
        limitTable: [],
    },
    {
        id: 'personal',
        userId: 'workspace-1',
        name: '직접 추가 카드',
        company: '테스트',
        color: 'bg-red-500',
        limitTable: [],
    },
];

describe('selectAvailableCards', () => {
    it('keeps the full catalog before the user manages any card', () => {
        expect(selectAvailableCards({
            cards: cards.slice(0, 2),
            performances: [],
            history: [],
        })).toEqual(cards.slice(0, 2));
    });

    it('uses only cards represented by performance, history, or personal data', () => {
        expect(selectAvailableCards({
            cards,
            performances: [{
                cardId: 'system-a',
                performanceMonth: '2026-07',
                amount: 100_000,
            }],
            history: [{
                id: 'transaction-1',
                date: '2026-08-22T03:00:00.000Z',
                brandId: 'twosome',
                cardId: 'system-b',
                amount: 10_000,
                discountAmount: 0,
            }],
        }).map(card => card.id)).toEqual(['system-a', 'system-b', 'personal']);
    });
});
