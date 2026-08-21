import { describe, expect, it } from 'vitest';
import { diffStructuredValues } from './structured-diff';

describe('structured field diff', () => {
    it('reports leaf changes with stable paths', () => {
        expect(diffStructuredValues(
            { condition: { minPerformance: 300_000 }, action: { value: 5 } },
            { condition: {}, action: { value: 7 } },
        )).toEqual([
            {
                path: 'action.value',
                kind: 'CHANGED',
                before: 5,
                after: 7,
            },
            {
                path: 'condition.minPerformance',
                kind: 'REMOVED',
                before: 300_000,
            },
        ]);
    });

    it('ignores object key and primitive-array ordering', () => {
        expect(diffStructuredValues(
            { includedBrands: ['cu', 'gs25'], action: { type: 'PERCENT', value: 5 } },
            { action: { value: 5, type: 'PERCENT' }, includedBrands: ['gs25', 'cu'] },
        )).toEqual([]);
    });
});
