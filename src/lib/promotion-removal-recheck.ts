import type { PromotionCollectionResult } from './promotion-collector';

type TimerHandle = ReturnType<typeof setTimeout>;

type RecheckSchedulerOptions = {
    now?: () => number;
    setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimer?: (timer: TimerHandle) => void;
    onError?: (error: unknown) => void;
};

export function getPromotionRemovalRecheckDelayMs(
    results: PromotionCollectionResult[],
    now = Date.now(),
) {
    const dueTimes = results.flatMap(result => {
        if (!result.removalVerificationAt) return [];
        const dueAt = new Date(result.removalVerificationAt).getTime();
        return Number.isFinite(dueAt) ? [dueAt] : [];
    });
    if (dueTimes.length === 0) return undefined;
    return Math.max(0, Math.min(...dueTimes) - now);
}

export function createPromotionRemovalRecheckScheduler(
    options: RecheckSchedulerOptions = {},
) {
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? setTimeout;
    const clearTimer = options.clearTimer ?? clearTimeout;
    const onError = options.onError ?? ((error: unknown) => {
        console.error('Promotion removal recheck failed.', error);
    });
    let timer: TimerHandle | undefined;
    let scheduledAt: number | undefined;

    return {
        schedule(
            results: PromotionCollectionResult[],
            recheck: () => Promise<PromotionCollectionResult[]>,
        ) {
            const currentTime = now();
            const delayMs = getPromotionRemovalRecheckDelayMs(results, currentTime);
            if (delayMs === undefined) return false;
            const dueAt = currentTime + delayMs;
            if (timer && scheduledAt !== undefined && scheduledAt <= dueAt) return false;
            if (timer) clearTimer(timer);

            scheduledAt = dueAt;
            timer = setTimer(() => {
                timer = undefined;
                scheduledAt = undefined;
                void recheck()
                    .then(nextResults => {
                        this.schedule(nextResults, recheck);
                    })
                    .catch(onError);
            }, delayMs);
            return true;
        },
        cancel() {
            if (timer) clearTimer(timer);
            timer = undefined;
            scheduledAt = undefined;
        },
    };
}

const globalForPromotionRecheck = globalThis as typeof globalThis & {
    promotionRemovalRecheckScheduler?: ReturnType<
        typeof createPromotionRemovalRecheckScheduler
    >;
};

export const promotionRemovalRecheckScheduler =
    globalForPromotionRecheck.promotionRemovalRecheckScheduler ??
    createPromotionRemovalRecheckScheduler();

globalForPromotionRecheck.promotionRemovalRecheckScheduler =
    promotionRemovalRecheckScheduler;
