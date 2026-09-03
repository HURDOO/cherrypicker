import { and, eq, isNull, or } from 'drizzle-orm';
import { cards } from '@/db/schema';

export const publishedSystemCard = () => and(
    isNull(cards.userId),
    eq(cards.catalogStatus, 'PUBLISHED'),
);

export const cardVisibleToUser = (userId: string) => or(
    publishedSystemCard(),
    eq(cards.userId, userId),
);
