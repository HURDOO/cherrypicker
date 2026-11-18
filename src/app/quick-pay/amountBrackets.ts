import type { BenefitCombination } from '@/types';

/** Amounts tried first. A change between two neighbours is then narrowed to `STEP` won. */
export const BRACKET_PROBE_AMOUNTS = [
    1_000, 2_000, 3_000, 5_000, 7_000, 10_000, 15_000, 20_000, 30_000, 50_000, 70_000, 100_000,
];
const STEP = 100;
const NO_BENEFIT_KEY = 'none';

export interface AmountBracket<T> {
    /** Lowest amount of the bracket. */
    from: number;
    /** First amount of the next bracket. The last bracket has none. */
    to?: number;
    key: string;
    /** Result at `from`. */
    low: T;
    /** Result at `midAmount`, halfway through the bracket. */
    mid: T;
    midAmount: number;
    /** Result at `highAmount`, the highest amount checked inside the bracket. */
    high: T;
    highAmount: number;
}

/**
 * What the user does to pay with this combination: which card, which pay, and whose discounts.
 * Two amounts with the same key need the same actions, only the benefit amount differs.
 */
export function getCombinationActionKey(combination: BenefitCombination | undefined): string {
    if (!combination || combination.confirmedValue + combination.conditionalValue <= 0) {
        return NO_BENEFIT_KEY;
    }
    const providers = combination.steps
        .filter(step => step.benefitAmount > 0 && step.certainty !== 'ESTIMATED')
        .map(step => step.providerId ?? step.providerName);
    return [
        combination.cardId ?? '',
        combination.fundingType,
        combination.payProviderId ?? '',
        [...new Set(providers)].sort().join(','),
    ].join('|');
}

export const isNoBenefitKey = (key: string) => key === NO_BENEFIT_KEY;

/**
 * The combination to show at one amount. When several tie for the best benefit, the one that
 * is also best at the next amount wins, so a tie at a boundary (1,000 won flat against 10% at
 * exactly 10,000 won) does not become a bracket of its own.
 */
export function pickSteadyCombination(
    combinations: BenefitCombination[],
    nextBest: BenefitCombination | undefined,
): BenefitCombination | undefined {
    const best = combinations[0];
    if (!best || !nextBest) return best;
    const nextKey = getCombinationActionKey(nextBest);
    return combinations.find(item => (
        item.confirmedValue === best.confirmedValue &&
        item.conditionalValue >= best.conditionalValue &&
        getCombinationActionKey(item) === nextKey
    )) ?? best;
}

/**
 * Splits the amount axis into runs where the best result stays the same.
 * Changes are found between probe amounts, so two changes inside one gap that cancel out
 * (A, B, A) are missed.
 */
export function findAmountBrackets<T>(
    evaluate: (amount: number) => T,
    keyOf: (result: T) => string,
    probes: readonly number[] = BRACKET_PROBE_AMOUNTS,
): AmountBracket<T>[] {
    if (probes.length === 0) return [];
    const cache = new Map<number, T>();
    const at = (amount: number) => {
        if (!cache.has(amount)) cache.set(amount, evaluate(amount));
        return cache.get(amount) as T;
    };
    const keyAt = (amount: number) => keyOf(at(amount));
    // The lowest amount in (low, high] whose key differs from the one at `low`.
    const findChange = (low: number, high: number) => {
        const lowKey = keyAt(low);
        let same = low;
        let changed = high;
        while (changed - same > STEP) {
            const middle = Math.round((same + changed) / 2 / STEP) * STEP;
            if (keyAt(middle) === lowKey) same = middle;
            else changed = middle;
        }
        return changed;
    };

    const starts = [probes[0]];
    for (let index = 1; index < probes.length; index += 1) {
        let low = probes[index - 1];
        const high = probes[index];
        while (keyAt(low) !== keyAt(high)) {
            low = findChange(low, high);
            starts.push(low);
        }
    }

    const last = probes[probes.length - 1];
    return starts.map((from, index) => {
        const to = starts[index + 1];
        const highAmount = to === undefined ? last : Math.max(from, to - STEP);
        const midAmount = Math.round((from + highAmount) / 2 / STEP) * STEP;
        return {
            from,
            to,
            key: keyAt(from),
            low: at(from),
            mid: at(midAmount),
            midAmount,
            high: at(highAmount),
            highAmount,
        };
    });
}

/** "1만 원", "5천 원", "11,200원". */
function formatBracketWon(value: number): string {
    if (value % 1_000 !== 0) return `${value.toLocaleString('ko-KR')}원`;
    const man = Math.floor(value / 10_000);
    const rest = (value % 10_000) / 1_000;
    return `${man > 0 ? `${man}만` : ''}${man > 0 && rest > 0 ? ' ' : ''}${rest > 0 ? `${rest}천` : ''} 원`;
}

export function formatBracketRange(
    bracket: Pick<AmountBracket<unknown>, 'from' | 'to'>,
    isFirst: boolean,
): string {
    if (bracket.to === undefined) return isFirst ? '금액 상관없이' : `${formatBracketWon(bracket.from)} 이상`;
    if (isFirst) return `${formatBracketWon(bracket.to)} 미만`;
    return `${formatBracketWon(bracket.from)} ~ ${formatBracketWon(bracket.to)}`;
}

/**
 * The benefit across a bracket: one amount when it is flat, a rate when it grows with the
 * payment, a rate with its cap when the upper half is flat, otherwise the range between
 * both ends.
 */
export function formatBracketBenefit(
    low: { amount: number; benefit: number },
    high: { amount: number; benefit: number },
    mid?: { amount: number; benefit: number },
): string {
    if (low.benefit <= 0 && high.benefit <= 0) return '혜택 없음';
    if (low.benefit === high.benefit) return `${low.benefit.toLocaleString('ko-KR')}원`;
    const lowRate = low.benefit / low.amount;
    const highRate = high.benefit / high.amount;
    if (Math.abs(lowRate - highRate) < 0.002) {
        return `${Number((highRate * 100).toFixed(1))}%`;
    }
    if (mid && low.benefit > 0 && mid.benefit === high.benefit && low.benefit < high.benefit) {
        return `${Number((lowRate * 100).toFixed(1))}% · 최대 ${high.benefit.toLocaleString('ko-KR')}원`;
    }
    return `${low.benefit.toLocaleString('ko-KR')}~${high.benefit.toLocaleString('ko-KR')}원`;
}
