import { describe, expect, it } from 'vitest';
import { zodTextFormat } from 'openai/helpers/zod';
import {
    cardBenefitOpenAIExtractionSchema,
    cardBenefitOpenAIInventorySchema,
} from './card-benefit-extraction';
import { promotionSemanticOpenAISchema } from './promotion-semantic-classifier';
import { sktPromotionOpenAISchema } from './skt-promotion-ai-parser';

// String formats OpenAI strict structured outputs accept; anything else is a 400 at request time.
const OPENAI_STRING_FORMATS = new Set([
    'date-time', 'time', 'date', 'duration', 'email', 'hostname', 'ipv4', 'ipv6', 'uuid',
]);

const formatsOf = (node: unknown, path: string, found: string[] = []): string[] => {
    if (Array.isArray(node)) node.forEach((item, index) => formatsOf(item, `${path}[${index}]`, found));
    if (node && typeof node === 'object') {
        Object.entries(node as Record<string, unknown>).forEach(([key, value]) => {
            if (key === 'format' && typeof value === 'string') found.push(`${path}: ${value}`);
            else formatsOf(value, `${path}.${key}`, found);
        });
    }
    return found;
};

describe('OpenAI structured output schemas', () => {
    it.each([
        ['card_benefit_inventory', cardBenefitOpenAIInventorySchema],
        ['card_benefit_extraction', cardBenefitOpenAIExtractionSchema],
        ['promotion_semantic', promotionSemanticOpenAISchema],
        ['skt_promotion', sktPromotionOpenAISchema],
    ])('%s uses only string formats strict mode accepts', (name, schema) => {
        const unsupported = formatsOf(zodTextFormat(schema, name).schema, name)
            .filter(entry => !OPENAI_STRING_FORMATS.has(entry.split(': ').at(-1)!));

        expect(unsupported).toEqual([]);
    });
});
