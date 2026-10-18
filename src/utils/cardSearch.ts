import type { Card } from '@/types';

export const CARD_SEARCH_ALIAS_LIMIT = 10;
export const CARD_SEARCH_ALIAS_MAX_LENGTH = 40;

/** Case, width and spacing do not matter: "딥 드림", "Deep Dream" and "deepdream" match alike. */
export const normalizeCardSearchText = (value: string) => value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/\s+/g, '');

/**
 * Design and nickname aliases let a card be found by the name printed on the user's card
 * (for example a character design) without publishing a duplicate card with the same benefits.
 */
export function validateCardSearchAliases(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return ['카드 검색 별칭은 문자열 목록이어야 합니다.'];
    const errors: string[] = [];
    if (value.length > CARD_SEARCH_ALIAS_LIMIT) {
        errors.push(`카드 검색 별칭은 ${CARD_SEARCH_ALIAS_LIMIT}개 이하여야 합니다.`);
    }
    const seen = new Set<string>();
    value.forEach((alias, index) => {
        if (typeof alias !== 'string' || !alias.trim() || alias !== alias.trim() ||
            alias.length > CARD_SEARCH_ALIAS_MAX_LENGTH) {
            errors.push(`카드 검색 별칭 ${index + 1}번이 올바르지 않습니다.`);
            return;
        }
        const key = normalizeCardSearchText(alias);
        if (seen.has(key)) errors.push(`카드 검색 별칭 '${alias}'이(가) 중복되었습니다.`);
        seen.add(key);
    });
    return errors;
}

/** Returns how the card matched, or undefined. An alias match names the alias for the list. */
export function matchCardSearch(
    card: Pick<Card, 'name' | 'company' | 'searchAliases'>,
    query: string,
): { matchedAlias?: string } | undefined {
    const normalizedQuery = normalizeCardSearchText(query);
    if (!normalizedQuery) return {};
    if (normalizeCardSearchText(card.name).includes(normalizedQuery) ||
        normalizeCardSearchText(card.company).includes(normalizedQuery)) {
        return {};
    }
    const matchedAlias = card.searchAliases?.find(alias => (
        normalizeCardSearchText(alias).includes(normalizedQuery)
    ));
    return matchedAlias ? { matchedAlias } : undefined;
}
