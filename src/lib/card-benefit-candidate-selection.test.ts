import { describe, expect, it } from 'vitest';
import { shouldReplacePendingCardBenefitCandidate } from './card-benefit-candidate-selection';

describe('card benefit candidate selection', () => {
    it('preserves a clean pending candidate when a stochastic retry is invalid', () => {
        expect(shouldReplacePendingCardBenefitCandidate(0, 7)).toBe(false);
    });

    it('allows a clean retry and keeps iterating while the current candidate is invalid', () => {
        expect(shouldReplacePendingCardBenefitCandidate(0, 0)).toBe(true);
        expect(shouldReplacePendingCardBenefitCandidate(4, 0)).toBe(true);
        expect(shouldReplacePendingCardBenefitCandidate(4, 6)).toBe(true);
    });
});
