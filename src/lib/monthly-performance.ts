const KST_OFFSET_MILLISECONDS = 9 * 60 * 60 * 1_000;
const PERFORMANCE_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function getMonthInKst(referenceDate: Date, monthOffset: number): string {
    const kstDate = new Date(referenceDate.getTime() + KST_OFFSET_MILLISECONDS);
    const targetMonth = new Date(Date.UTC(
        kstDate.getUTCFullYear(),
        kstDate.getUTCMonth() + monthOffset,
        1
    ));

    return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Returns the current calendar month in Korea Standard Time as YYYY-MM. */
export function getCurrentMonthInKst(referenceDate: Date = new Date()): string {
    return getMonthInKst(referenceDate, 0);
}

/** Returns the previous calendar month in Korea Standard Time as YYYY-MM. */
export function getPreviousMonthInKst(referenceDate: Date = new Date()): string {
    return getMonthInKst(referenceDate, -1);
}

/** Returns the first instant of the current KST calendar year. */
export function getStartOfCurrentYearInKst(referenceDate: Date = new Date()): Date {
    const kstDate = new Date(referenceDate.getTime() + KST_OFFSET_MILLISECONDS);
    return new Date(
        Date.UTC(kstDate.getUTCFullYear(), 0, 1) - KST_OFFSET_MILLISECONDS
    );
}

/** Formats a YYYY-MM performance month for Korean user-facing copy. */
export function formatPerformanceMonthLabel(performanceMonth: string): string {
    const match = PERFORMANCE_MONTH_PATTERN.exec(performanceMonth);

    if (!match) return performanceMonth;

    return `${match[1]}년 ${Number(match[2])}월`;
}
