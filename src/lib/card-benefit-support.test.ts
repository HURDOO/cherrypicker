import { describe, expect, it } from 'vitest';
import type { Card } from '@/types';
import { buildCardBenefitSupports } from './card-benefit-support';

const cards: Card[] = [
    {
        id: 'shinhan_sol',
        name: '신한 SOL트래블 체크카드',
        company: '신한카드',
        color: 'bg-blue-400',
        limitTable: [],
    },
    {
        id: 'other-card',
        name: '기존 입력 카드',
        company: '테스트카드',
        color: 'bg-gray-400',
        limitTable: [],
    },
];

describe('card benefit support registry', () => {
    it('marks an approved official-source revision as fully reviewed', () => {
        const supports = buildCardBenefitSupports(cards, [{
            cardId: 'shinhan_sol',
            candidateId: 'candidate-1',
            publishedAt: '2026-08-23T03:00:00.000Z',
        }]);

        expect(supports[1]).toMatchObject({
            cardId: 'shinhan_sol',
            reviewStatus: 'REVIEWED',
            supportScope: 'FULL',
            lastVerifiedAt: '2026-08-23T03:00:00.000Z',
        });
        expect(supports[1].sources.length).toBeGreaterThanOrEqual(3);
        expect(supports[1].sources.every(source => (
            new URL(source.url).hostname.endsWith('shinhancard.com')
        ))).toBe(true);
    });

    it('labels seed-only cards as partially supported without inventing a review date', () => {
        const supports = buildCardBenefitSupports(cards, []);
        const support = supports.find(item => item.cardId === 'other-card');

        expect(support).toMatchObject({
            reviewStatus: 'NOT_REVIEWED',
            supportScope: 'PARTIAL',
            sources: [],
        });
        expect(support).not.toHaveProperty('lastVerifiedAt');
        expect(support?.caveats[0]).toContain('공식 문서 전체 검수');
    });

    it('does not call a baseline rollback an official review', () => {
        const support = buildCardBenefitSupports(cards, [{
            cardId: 'shinhan_sol',
            candidateId: null,
            publishedAt: '2026-08-23T03:00:00.000Z',
        }]).find(item => item.cardId === 'shinhan_sol');

        expect(support?.reviewStatus).toBe('NOT_REVIEWED');
        expect(support).not.toHaveProperty('lastVerifiedAt');
    });
});
