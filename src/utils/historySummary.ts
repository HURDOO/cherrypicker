import type { TransactionHistory } from '@/types';

export function getTransactionConfirmedBenefit(transaction: TransactionHistory): number {
    return Math.max(0, transaction.confirmedValue ?? transaction.discountAmount);
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
