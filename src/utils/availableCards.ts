import type { Card, TransactionHistory, UserCardPerformance } from '@/types';

export function selectAvailableCards({
    cards,
    performances,
    history,
    selectedSystemCardIds,
}: {
    cards: Card[];
    performances: UserCardPerformance[];
    history: TransactionHistory[];
    selectedSystemCardIds?: string[] | null;
}) {
    if (Array.isArray(selectedSystemCardIds)) {
        const selectedIds = new Set(selectedSystemCardIds);
        return cards.filter(card => card.userId || selectedIds.has(card.id));
    }

    const managedCardIds = new Set([
        ...performances.map(performance => performance.cardId),
        ...history.flatMap(transaction => transaction.cardId ? [transaction.cardId] : []),
    ]);
    const hasManagedCards = managedCardIds.size > 0 || cards.some(card => card.userId);

    if (!hasManagedCards) return cards;

    return cards.filter(card => card.userId || managedCardIds.has(card.id));
}
