import { describe, expect, it } from 'vitest';
import {
    getCurrentMonthInKst,
    getNextMonthInKst,
    getPreviousMonthInKst,
} from './monthly-performance';

describe('monthly performance periods', () => {
    it('moves across year boundaries using the Korea calendar month', () => {
        const referenceDate = new Date('2026-12-31T16:00:00.000Z');

        expect(getPreviousMonthInKst(referenceDate)).toBe('2026-12');
        expect(getCurrentMonthInKst(referenceDate)).toBe('2027-01');
        expect(getNextMonthInKst(referenceDate)).toBe('2027-02');
    });
});
