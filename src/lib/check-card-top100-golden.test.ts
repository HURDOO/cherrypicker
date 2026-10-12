import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Card, CardBenefitExtraction } from '@/types';
import { checkCardGoldenScenarios } from '@/test/fixtures/check-card-top100-golden';
import { calculateBestCards } from '@/utils/calculation';

const baseDirectory = join(process.cwd(), 'docs/card-benefit-revisions/base');

const loadExtraction = (cardId: string) => (
    JSON.parse(readFileSync(join(baseDirectory, `${cardId}.json`), 'utf8')) as {
        extraction: CardBenefitExtraction;
    }
).extraction;

describe('TASK-14 check card golden scenarios', () => {
    it.each(checkCardGoldenScenarios)('keeps $id at the reviewed benefit', scenario => {
        const extraction = loadExtraction(scenario.cardId);
        const card: Card = { ...extraction.card, color: 'bg-blue-500' };
        const [result] = calculateBestCards(
            scenario.amount,
            { id: scenario.brandId, name: scenario.brandId, categoryId: scenario.categoryId },
            [card],
            extraction.rules,
            [],
            [{
                cardId: card.id,
                performanceMonth: '2026-09',
                amount: scenario.performance ?? 0,
            }],
            scenario.isOnline ?? false,
            {
                allowPerformanceWaiver: false,
                now: new Date(`${scenario.date}T03:00:00.000Z`),
                confirmedConditionIds: scenario.confirmed ?? [],
            },
        );

        expect(result.calculatedDiscount).toBe(scenario.expectedBenefit);
        if (!scenario.ruleId) return;
        expect(result.matchedBenefits).toEqual(expect.arrayContaining([expect.objectContaining({
            rule: expect.objectContaining({ id: scenario.ruleId }),
            discount: scenario.expectedBenefit,
            certainty: scenario.certainty ?? 'CONFIRMED',
        })]));
    });
});
