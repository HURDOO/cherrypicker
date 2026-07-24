import type { benefitRules } from '@/db/schema';
import {
    booleanValue,
    limitConfigValue,
    optionalString,
    platformValue,
    requiredString,
    ruleActionValue,
    ruleConditionValue,
    stringArray,
} from './api-validation';
import {
    assertVisibleBrands,
    assertVisibleCard,
    assertVisibleCategory,
} from './data-access';

type RuleInsert = typeof benefitRules.$inferInsert;

export function parseRuleInput(
    input: Record<string, unknown>,
    userId: string
): Omit<RuleInsert, 'id' | 'userId'> {
    const cardId = requiredString(input, 'cardId', '카드 ID');
    const category = optionalString(input, 'category', '카테고리 ID');
    const includedBrands = stringArray(input, 'includedBrands', '포함 브랜드');
    const excludedBrands = stringArray(input, 'excludedBrands', '제외 브랜드');

    assertVisibleCard(cardId, userId);
    if (category) assertVisibleCategory(category, userId);
    assertVisibleBrands([...new Set([...includedBrands, ...excludedBrands])], userId);

    return {
        cardId,
        category: category || null,
        includedBrands,
        excludedBrands,
        platformType: platformValue(input),
        sharedGroupId: optionalString(input, 'sharedGroupId', '공유 한도 그룹 ID') || null,
        usesCardLimit: booleanValue(input, 'usesCardLimit', true),
        description: requiredString(input, 'description', '혜택 설명'),
        detail: optionalString(input, 'detail', '상세 설명', 2_000) || '',
        condition: ruleConditionValue(input),
        action: ruleActionValue(input),
        limitConfig: limitConfigValue(input),
    };
}

