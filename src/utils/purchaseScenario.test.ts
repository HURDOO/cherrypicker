import { describe, expect, it } from 'vitest';
import type { BenefitRule } from '@/types';
import { getPurchaseScenarios, searchPurchaseScenarios } from './purchaseScenario';

const rule = (cardId: string, scenarioId: string, label: string): BenefitRule => ({
    id: `${cardId}_${scenarioId}`,
    cardId,
    description: label,
    detail: '',
    condition: {},
    action: { type: 'FLAT', value: 0 },
    limitConfig: {},
    program: {
        languageVersion: 1,
        target: {
            purchaseScenario: {
                id: scenarioId,
                label,
                aliases: ['야구 입장권'],
                requiredChecks: ['공식 대상인지 확인'],
            },
        },
        eligibility: { op: 'literal', value: true },
        benefit: { op: 'literal', value: 1_000 },
    },
});

describe('purchase scenarios', () => {
    it('lists owned-card situations once and searches aliases without creating brands', () => {
        const rows = [
            rule('owned', 'home_game_ticket', '두산 홈경기 티켓'),
            rule('owned', 'home_game_ticket', '두산 홈경기 티켓'),
            rule('other', 'other_ticket', '다른 구단 티켓'),
        ];
        const scenarios = getPurchaseScenarios(rows, new Set(['owned']));
        expect(scenarios.map(item => item.id)).toEqual(['home_game_ticket']);
        expect(searchPurchaseScenarios(scenarios, '두산')).toHaveLength(1);
        expect(searchPurchaseScenarios(scenarios, '야구 입장권')).toHaveLength(1);
        expect(searchPurchaseScenarios(scenarios, '다른 구단')).toHaveLength(0);
    });

    it('hides conflicting definitions rather than selecting one arbitrarily', () => {
        expect(getPurchaseScenarios([
            rule('owned', 'same_scope', '첫 이름'),
            rule('owned', 'same_scope', '다른 이름'),
        ])).toEqual([]);
    });
});
