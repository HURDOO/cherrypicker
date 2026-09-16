import type { BenefitDslTarget, BenefitRule } from '@/types';

export type PurchaseScenario = NonNullable<BenefitDslTarget['purchaseScenario']>;

const normalizedSearchText = (value: string) => value.normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, ' ')
    .trim();

export function getPurchaseScenarios(
    rules: BenefitRule[],
    allowedCardIds?: ReadonlySet<string>,
): PurchaseScenario[] {
    const byId = new Map<string, PurchaseScenario | null>();
    rules.forEach(rule => {
        if (allowedCardIds && !allowedCardIds.has(rule.cardId)) return;
        const scenario = rule.program?.target?.purchaseScenario;
        if (!scenario) return;
        const prior = byId.get(scenario.id);
        if (prior === null) return;
        if (prior && JSON.stringify(prior) !== JSON.stringify(scenario)) {
            byId.set(scenario.id, null);
            return;
        }
        byId.set(scenario.id, scenario);
    });
    return [...byId.values()]
        .filter((scenario): scenario is PurchaseScenario => scenario !== null)
        .sort((left, right) => left.label.localeCompare(right.label, 'ko-KR'));
}

export function searchPurchaseScenarios(
    scenarios: PurchaseScenario[],
    query: string,
): PurchaseScenario[] {
    const term = normalizedSearchText(query);
    if (!term) return [];
    return scenarios.filter(scenario => [scenario.label, ...(scenario.aliases ?? [])]
        .some(value => normalizedSearchText(value).includes(term)));
}
