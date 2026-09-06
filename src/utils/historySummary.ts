import type {
    BenefitCertainty,
    BenefitLayer,
    FundingType,
    TransactionHistory,
} from '@/types';

const benefitCertainties = new Set<BenefitCertainty>([
    'CONFIRMED',
    'CONDITIONAL',
    'ESTIMATED',
]);
const benefitLayers = new Set<BenefitLayer>([
    'DISCOUNT',
    'PAY',
    'PAYMENT_METHOD',
    'POST_REWARD',
]);
const fundingTypes = new Set<FundingType>([
    'CARD',
    'MONEY',
    'POINTS',
    'GIFT_CERTIFICATE',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

export interface TransactionBenefitStepSummary {
    id: string;
    layer: BenefitLayer;
    providerName: string;
    title: string;
    certainty: BenefitCertainty;
    benefitAmount: number;
    isImmediate: boolean;
    cardId?: string;
    ruleId?: string;
    promotionId?: string;
    usesCardLimit?: boolean;
}

export interface TransactionCombinationSummary {
    cardName?: string;
    payProviderName?: string;
    fundingType?: FundingType;
    catalogVersion?: string;
    cardChargeAmount?: number;
    steps: TransactionBenefitStepSummary[];
}

export function getTransactionCombinationSummary(
    transaction: TransactionHistory,
): TransactionCombinationSummary {
    const snapshot = transaction.combinationSnapshot;
    if (!isRecord(snapshot)) return { steps: [] };

    const steps = Array.isArray(snapshot.steps)
        ? snapshot.steps.flatMap((step, index): TransactionBenefitStepSummary[] => {
            if (!isRecord(step)) return [];
            if (
                typeof step.providerName !== 'string' ||
                typeof step.title !== 'string' ||
                typeof step.certainty !== 'string' ||
                !benefitCertainties.has(step.certainty as BenefitCertainty) ||
                typeof step.layer !== 'string' ||
                !benefitLayers.has(step.layer as BenefitLayer) ||
                typeof step.benefitAmount !== 'number' ||
                !Number.isFinite(step.benefitAmount) ||
                typeof step.isImmediate !== 'boolean'
            ) return [];
            return [{
                id: typeof step.id === 'string' ? step.id : `step-${index}`,
                layer: step.layer as BenefitLayer,
                providerName: step.providerName,
                title: step.title,
                certainty: step.certainty as BenefitCertainty,
                benefitAmount: Math.max(0, Math.floor(step.benefitAmount)),
                isImmediate: step.isImmediate,
                ...(typeof step.cardId === 'string' && { cardId: step.cardId }),
                ...(typeof step.ruleId === 'string' && { ruleId: step.ruleId }),
                ...(typeof step.promotionId === 'string' && {
                    promotionId: step.promotionId,
                }),
                ...(typeof step.usesCardLimit === 'boolean' && {
                    usesCardLimit: step.usesCardLimit,
                }),
            }];
        })
        : [];

    return {
        ...(typeof snapshot.cardName === 'string' && { cardName: snapshot.cardName }),
        ...(typeof snapshot.payProviderName === 'string' && {
            payProviderName: snapshot.payProviderName,
        }),
        ...(typeof snapshot.fundingType === 'string' &&
            fundingTypes.has(snapshot.fundingType as FundingType) && {
            fundingType: snapshot.fundingType as FundingType,
        }),
        ...(typeof snapshot.catalogVersion === 'string' && {
            catalogVersion: snapshot.catalogVersion,
        }),
        ...(typeof snapshot.cardChargeAmount === 'number' &&
            Number.isFinite(snapshot.cardChargeAmount) && {
            cardChargeAmount: Math.max(0, Math.floor(snapshot.cardChargeAmount)),
        }),
        steps,
    };
}

export function getTransactionConfirmedBenefit(transaction: TransactionHistory): number {
    return Math.max(0, transaction.confirmedValue ?? transaction.discountAmount);
}

export function getTransactionConfirmedPayableAmount(
    transaction: TransactionHistory,
): number {
    const summary = getTransactionCombinationSummary(transaction);
    if (summary.steps.length === 0) {
        return Math.max(
            0,
            transaction.payableAmount ?? transaction.amount - transaction.discountAmount,
        );
    }
    const confirmedImmediateValue = summary.steps
        .filter(step => step.certainty === 'CONFIRMED' && step.isImmediate)
        .reduce((total, step) => total + step.benefitAmount, 0);
    return Math.max(0, transaction.amount - confirmedImmediateValue);
}

export function getTransactionPerformanceContribution(
    transaction: TransactionHistory,
): number {
    if (!transaction.cardId) return 0;
    const snapshot = getTransactionCombinationSummary(transaction);
    return Math.max(
        0,
        transaction.performanceContributionAmount ??
        snapshot.cardChargeAmount ??
        transaction.amount,
    );
}

export function getTransactionConfirmedCardBenefit(
    transaction: TransactionHistory,
): number {
    const steps = getTransactionCombinationSummary(transaction).steps;
    if (steps.length === 0) return Math.max(0, transaction.discountAmount);
    return steps
        .filter(step => (
            step.certainty === 'CONFIRMED' &&
            Boolean(step.cardId || step.ruleId)
        ))
        .reduce((total, step) => total + step.benefitAmount, 0);
}

export function getTransactionConfirmedIntegratedCardBenefit(
    transaction: TransactionHistory,
): number {
    const steps = getTransactionCombinationSummary(transaction).steps;
    if (steps.length === 0) return Math.max(0, transaction.discountAmount);
    return steps
        .filter(step => (
            step.certainty === 'CONFIRMED' &&
            Boolean(step.cardId || step.ruleId) &&
            step.usesCardLimit !== false
        ))
        .reduce((total, step) => total + step.benefitAmount, 0);
}

export function summarizeTransactions(transactions: TransactionHistory[]) {
    const totalSpend = transactions.reduce(
        (total, transaction) => total + transaction.amount,
        0
    );
    const totalConfirmedBenefit = transactions.reduce(
        (total, transaction) => total + getTransactionConfirmedBenefit(transaction),
        0
    );

    return {
        totalSpend,
        totalConfirmedBenefit,
        confirmedBenefitRate: totalSpend > 0
            ? totalConfirmedBenefit / totalSpend * 100
            : 0,
    };
}
