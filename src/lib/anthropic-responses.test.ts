import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toClaudeJsonSchema } from './anthropic-responses';
import {
    cardBenefitOpenAIExtractionSchema,
    cardBenefitOpenAIInventorySchema,
} from './card-benefit-extraction';

type Json = Record<string, unknown>;

const refsOf = (node: unknown, refs: string[] = []): string[] => {
    if (Array.isArray(node)) node.forEach(item => refsOf(item, refs));
    if (node && typeof node === 'object') {
        const record = node as Json;
        if (typeof record.$ref === 'string') refs.push(record.$ref.replace('#/$defs/', ''));
        Object.values(record).forEach(value => refsOf(value, refs));
    }
    return refs;
};

const keywordsOf = (node: unknown, keys = new Set<string>()): Set<string> => {
    if (Array.isArray(node)) node.forEach(item => keywordsOf(item, keys));
    if (node && typeof node === 'object') {
        Object.entries(node as Json).forEach(([key, value]) => {
            if (key !== 'properties') keys.add(key);
            keywordsOf(value, keys);
        });
    }
    return keys;
};

const assertAcyclic = (schema: Json) => {
    const defs = schema.$defs as Record<string, unknown>;
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (name: string) => {
        if (done.has(name)) return;
        expect(visiting.has(name), `cycle through ${name}`).toBe(false);
        visiting.add(name);
        refsOf(defs[name]).forEach(visit);
        visiting.delete(name);
        done.add(name);
    };
    Object.keys(defs).forEach(visit);
};

type Expression = { op: 'literal'; value: number } | { op: 'add'; operands: Expression[] };

const expression: z.ZodType<Expression> = z.lazy(() => z.union([
    z.object({ op: z.literal('literal'), value: z.number().min(0) }).strict(),
    z.object({ op: z.literal('add'), operands: z.array(expression).min(2).max(5) }).strict(),
]));

describe('toClaudeJsonSchema', () => {
    it('unrolls a recursive schema to a fixed depth and keeps only leaves at the bottom', () => {
        const schema = toClaudeJsonSchema(z.object({ root: expression }).strict(), 3);
        const defs = schema.$defs as Record<string, Json>;
        const levels = Object.keys(defs).filter(name => /__d\d+$/.test(name)).sort();

        assertAcyclic(schema);
        expect(levels).toHaveLength(4);
        const deepest = defs[levels.at(-1)!];
        expect(JSON.stringify(deepest)).toContain('literal');
        expect(JSON.stringify(deepest)).not.toContain('operands');
        expect(refsOf(schema).every(ref => ref in defs)).toBe(true);
    });

    it('drops constraint keywords Claude rejects while zod still enforces them', () => {
        const schema = toClaudeJsonSchema(z.object({
            name: z.string().min(1).max(10).regex(/^[a-z]+$/),
            count: z.number().int().min(0).max(5),
            items: z.array(z.string()).min(1).max(3),
            url: z.string().url(),
        }).strict());
        const keys = keywordsOf(schema);

        ['minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'minItems', 'maxItems', '$schema']
            .forEach(key => expect(keys.has(key), key).toBe(false));
        expect(schema.additionalProperties).toBe(false);
        expect((schema.properties as Json).url).toMatchObject({ format: 'uri' });
    });

    it('converts the card extraction schemas without cycles, oneOf or dangling references', () => {
        for (const source of [cardBenefitOpenAIExtractionSchema, cardBenefitOpenAIInventorySchema]) {
            const schema = toClaudeJsonSchema(source);
            const defs = (schema.$defs ?? {}) as Json;

            assertAcyclic(schema);
            expect(keywordsOf(schema).has('oneOf')).toBe(false);
            expect(refsOf(schema).every(ref => ref in defs)).toBe(true);
        }
    });
});
