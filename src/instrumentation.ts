export async function register() {
    // The schedule spawns the collector CLI and uses SQLite, so it only runs in the
    // production Node.js server; `startPromotionSchedule` checks PROMOTION_SCHEDULE=off too.
    if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NODE_ENV === 'production') {
        const { startPromotionSchedule } = await import('@/lib/promotion-schedule');
        startPromotionSchedule(process.env);
    }
}
