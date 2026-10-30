import { describe, expect, it } from 'vitest';
import { promotionForDiff } from './promotion-collector';
import { diffStructuredValues } from './structured-diff';

describe('promotionForDiff', () => {
    it('does not report an empty usage group as a change against the stored offer', () => {
        const stored = { id: 'a', title: '식봄 5천원 적립', status: 'PUBLISHED' };
        const parsed = { title: '식봄 5천원 적립', usageGroupId: null };

        expect(diffStructuredValues(promotionForDiff(stored), promotionForDiff(parsed))).toEqual([]);
        expect(diffStructuredValues(
            promotionForDiff({ ...stored, usageGroupId: 'group' }),
            promotionForDiff(parsed),
        )).toHaveLength(1);
    });
});
