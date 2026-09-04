import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromotionCollectionResult } from './promotion-collector';
import {
    createPromotionRemovalRecheckScheduler,
    getPromotionRemovalRecheckDelayMs,
} from './promotion-removal-recheck';

const collectionResult = (
    removalVerificationAt?: string,
): PromotionCollectionResult => ({
    sourceId: 'naverpay-benefits',
    sourceUrl: 'https://pay.naver.com/benefit/payment/list',
    label: 'Npay 결제 혜택',
    status: 'created',
    discovered: 0,
    published: 0,
    reviewRequired: 1,
    unchanged: 1,
    expired: 0,
    removalVerificationAt,
});

afterEach(() => {
    vi.useRealTimers();
});

describe('promotion removal recheck', () => {
    it('uses the earliest pending verification time without returning a negative delay', () => {
        const now = Date.parse('2026-09-05T00:00:00.000Z');

        expect(getPromotionRemovalRecheckDelayMs([
            collectionResult('2026-09-05T00:10:00.000Z'),
            collectionResult('2026-09-05T00:05:00.000Z'),
        ], now)).toBe(5 * 60 * 1_000);
        expect(getPromotionRemovalRecheckDelayMs([
            collectionResult('2026-09-04T23:59:00.000Z'),
        ], now)).toBe(0);
        expect(getPromotionRemovalRecheckDelayMs([
            collectionResult(),
        ], now)).toBeUndefined();
    });

    it('runs one deduplicated recheck at the requested time', async () => {
        vi.useFakeTimers();
        vi.setSystemTime('2026-09-05T00:00:00.000Z');
        const scheduler = createPromotionRemovalRecheckScheduler();
        const recheck = vi.fn().mockResolvedValue([]);
        const results = [collectionResult('2026-09-05T00:05:00.000Z')];

        expect(scheduler.schedule(results, recheck)).toBe(true);
        expect(scheduler.schedule(results, recheck)).toBe(false);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1_000 - 1);
        expect(recheck).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(recheck).toHaveBeenCalledTimes(1);
        scheduler.cancel();
    });
});
