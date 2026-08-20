import { describe, expect, it } from 'vitest';
import type { Card } from '@/types';
import {
    extractShinhanSolTravelWithRules,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { calculateBestCards } from '@/utils/calculation';

const card: Card = {
    id: 'shinhan_sol',
    name: '신한 SOL트래블 체크카드',
    company: '신한카드',
    color: 'bg-blue-400',
    limitTable: [],
};

const sourceText = [
    '해외 결제 수수료 면제',
    '국제 브랜드 수수료(1%)/해외 서비스 수수료(0.2%) 면제',
    '컨택리스 해외 대중교통 1% 결제일 할인 월 3천원까지 할인',
    '세븐일레븐·CU·GS25·이마트 24 5% 결제일 할인 편의점 통합 일 1회, 월 3회, 월 3천원까지 할인',
    '국내 후불교통(공항철도·버스 포함) 1% 결제일 할인 국내 대중교통 월 3천원까지 할인',
    'CU 행사상품(간편식, Get커피) 5% 즉시할인 결제 1회 당 최대 2,000원까지 할인',
    '더라운지 공항 라운지 연 2회 무료 반기별 1회, 연 2회 본인 입장',
    '전월 국내 이용금액 30만원 이상 시 서비스가 제공됩니다.',
].join('\n');

const input = {
    card,
    sourceUrl: 'https://www.shinhancard.com/sol-travel',
    sourceText,
};

const references = {
    categoryIds: new Set(['etc', 'transport', 'convenience']),
    brandIds: new Set([
        'overseas_payment',
        'overseas_transport',
        'cu',
        'gs25',
        'seveneleven',
        'emart24',
        'transport_public',
        'cu_event',
        'airport_lounge',
    ]),
};

describe('card benefit extraction', () => {
    it('creates a fully evidenced representative SOL Travel candidate', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(
            result.extraction,
            input,
            references,
        );

        expect(validation.errors).toEqual([]);
        expect(result.extraction.rules).toHaveLength(6);
        expect(result.extraction.rules.find(rule => rule.id === 'sol_domestic_convenience'))
            .toMatchObject({
                condition: { minPerformance: 300_000 },
                action: { type: 'PERCENT', value: 5 },
                limitConfig: { dailyCount: 1, monthlyCount: 3, monthlyAmount: 3_000 },
            });
        expect(result.extraction.evidence.every(item => sourceText.includes(item.quote))).toBe(true);
    });

    it('holds a candidate when a rule has no official-source evidence', () => {
        const result = extractShinhanSolTravelWithRules({
            ...input,
            sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', ''),
        });
        const validation = validateCardBenefitExtraction(
            result.extraction,
            { ...input, sourceText: sourceText.replace('더라운지 공항 라운지 연 2회 무료', '') },
            references,
        );

        expect(validation.errors).toContain('규칙 sol_lounge의 혜택·계산 근거가 없습니다.');
    });

    it('rejects evidence quotes that are not present in the raw source', () => {
        const result = extractShinhanSolTravelWithRules(input);
        result.extraction.evidence[0] = {
            ...result.extraction.evidence[0],
            quote: '원문에는 없는 99% 할인',
        };

        expect(validateCardBenefitExtraction(result.extraction, input, references).errors)
            .toContain('근거 1 문장이 공식 원문에서 확인되지 않습니다.');
    });

    it('rejects rule IDs owned by another card or a user', () => {
        const result = extractShinhanSolTravelWithRules(input);
        const validation = validateCardBenefitExtraction(result.extraction, input, {
            ...references,
            ruleOwners: new Map([
                ['sol_domestic_convenience', { cardId: 'other_card', userId: null }],
                ['sol_lounge', { cardId: card.id, userId: 'user-1' }],
            ]),
        });

        expect(validation.errors).toContain(
            '규칙 3 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
        expect(validation.errors).toContain(
            '규칙 6 ID가 다른 카드 또는 사용자 규칙과 충돌합니다.',
        );
    });

    it('feeds the validated representative rule into the existing calculator', () => {
        const extraction = extractShinhanSolTravelWithRules(input).extraction;
        const gs25 = { id: 'gs25', name: 'GS25', categoryId: 'convenience' };
        const eligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 300_000 }],
            false,
        )[0];
        const ineligible = calculateBestCards(
            20_000,
            gs25,
            [card],
            extraction.rules,
            [],
            [{ cardId: card.id, performanceMonth: '2026-08', amount: 299_999 }],
            false,
        )[0];

        expect(eligible).toMatchObject({
            calculatedDiscount: 1_000,
            matchedRule: { id: 'sol_domestic_convenience' },
        });
        expect(ineligible.calculatedDiscount).toBe(0);
    });
});
