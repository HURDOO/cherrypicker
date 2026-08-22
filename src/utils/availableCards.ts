import type { Card, TransactionHistory, UserCardPerformance } from '@/types';

export function selectAvailableCards({
    cards,
    performances,
    history,
}: {
    cards: Card[];
    performances: UserCardPerformance[];
    history: TransactionHistory[];
}) {
    const managedCardIds = new Set([
        ...performances.map(performance => performance.cardId),
        ...history.flatMap(transaction => transaction.cardId ? [transaction.cardId] : []),
    ]);
    const hasManagedCards = managedCardIds.size > 0 || cards.some(card => card.userId);

    if (!hasManagedCards) return cards;

    return cards.filter(card => card.userId || managedCardIds.has(card.id));
}
