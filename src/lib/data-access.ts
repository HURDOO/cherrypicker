import { and, count, eq, inArray, isNull, or } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cards,
    categories,
    transactionHistory,
} from '@/db/schema';
import { HttpError } from './api-server';
import { cardVisibleToUser } from './card-visibility';

export function visibleToUser(
    column: AnySQLiteColumn,
    userId: string
) {
    return or(isNull(column), eq(column, userId));
}

function assertWithinLimit(currentCount: number, limit: number, label: string) {
    if (currentCount >= limit) {
        throw new HttpError(409, `${label}은(는) 계정당 최대 ${limit.toLocaleString()}개까지 저장할 수 있습니다.`);
    }
}

export function assertCanCreateCategory(userId: string) {
    const row = db.select({ value: count() })
        .from(categories)
        .where(eq(categories.userId, userId))
        .get();
    assertWithinLimit(row?.value ?? 0, 50, '카테고리');
}

export function assertCanCreateBrand(userId: string) {
    const row = db.select({ value: count() })
        .from(brands)
        .where(eq(brands.userId, userId))
        .get();
    assertWithinLimit(row?.value ?? 0, 200, '브랜드');
}

export function assertCanCreateCard(userId: string) {
    const row = db.select({ value: count() })
        .from(cards)
        .where(eq(cards.userId, userId))
        .get();
    assertWithinLimit(row?.value ?? 0, 50, '카드');
}

export function assertCanCreateRule(userId: string) {
    const row = db.select({ value: count() })
        .from(benefitRules)
        .where(eq(benefitRules.userId, userId))
        .get();
    assertWithinLimit(row?.value ?? 0, 500, '혜택 규칙');
}

export function assertCanCreateTransaction(userId: string) {
    const row = db.select({ value: count() })
        .from(transactionHistory)
        .where(eq(transactionHistory.userId, userId))
        .get();
    assertWithinLimit(row?.value ?? 0, 10_000, '결제 기록');
}

export function assertVisibleCard(cardId: string, userId: string) {
    const row = db.select({ id: cards.id, userId: cards.userId })
        .from(cards)
        .where(and(
            eq(cards.id, cardId),
            cardVisibleToUser(userId),
        ))
        .get();

    if (!row) throw new HttpError(404, '카드를 찾을 수 없습니다.');
    return row;
}

export function assertOwnedCard(cardId: string, userId: string) {
    const row = db.select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.id, cardId), eq(cards.userId, userId)))
        .get();

    if (!row) throw new HttpError(403, '이 카드를 수정할 권한이 없습니다.');
}

export function assertVisibleCategory(categoryId: string, userId: string) {
    const row = db.select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, categoryId), visibleToUser(categories.userId, userId)))
        .get();

    if (!row) throw new HttpError(404, '카테고리를 찾을 수 없습니다.');
}

export function assertOwnedCategory(categoryId: string, userId: string) {
    const row = db.select({ id: categories.id })
        .from(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
        .get();

    if (!row) throw new HttpError(403, '이 카테고리를 수정할 권한이 없습니다.');
}

export function assertVisibleBrand(brandId: string, userId: string) {
    const row = db.select({ id: brands.id })
        .from(brands)
        .where(and(eq(brands.id, brandId), visibleToUser(brands.userId, userId)))
        .get();

    if (!row) throw new HttpError(404, '브랜드를 찾을 수 없습니다.');
}

export function assertOwnedBrand(brandId: string, userId: string) {
    const row = db.select({ id: brands.id })
        .from(brands)
        .where(and(eq(brands.id, brandId), eq(brands.userId, userId)))
        .get();

    if (!row) throw new HttpError(403, '이 브랜드를 수정할 권한이 없습니다.');
}

export function assertVisibleRule(ruleId: string, userId: string) {
    const row = db.select({ id: benefitRules.id, cardId: benefitRules.cardId })
        .from(benefitRules)
        .where(and(
            eq(benefitRules.id, ruleId),
            visibleToUser(benefitRules.userId, userId)
        ))
        .get();

    if (!row) throw new HttpError(404, '혜택 규칙을 찾을 수 없습니다.');
    return row;
}

export function assertOwnedRule(ruleId: string, userId: string) {
    const row = db.select({ id: benefitRules.id })
        .from(benefitRules)
        .where(and(eq(benefitRules.id, ruleId), eq(benefitRules.userId, userId)))
        .get();

    if (!row) throw new HttpError(403, '이 혜택을 수정할 권한이 없습니다.');
}

export function assertVisibleBrands(brandIds: string[], userId: string) {
    if (brandIds.length === 0) return;

    const rows = db.select({ id: brands.id })
        .from(brands)
        .where(and(
            inArray(brands.id, brandIds),
            visibleToUser(brands.userId, userId)
        ))
        .all();

    if (rows.length !== new Set(brandIds).size) {
        throw new HttpError(400, '접근할 수 없는 브랜드가 혜택에 포함되어 있습니다.');
    }
}
