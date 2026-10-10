import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type {
    StructuredReasoningEffort,
    StructuredResponseClient,
    StructuredResponseRequest,
    StructuredResponseUsageListener,
} from './structured-response';

type JsonSchema = Record<string, unknown>;

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
/** DSL programs nest at most 16 levels; real candidates stay far shallower than this. */
const DEFAULT_RECURSION_DEPTH = 8;
const SUPPORTED_STRING_FORMATS = new Set([
    'date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid',
]);
// Claude structured outputs reject these; zod re-validates them after the response.
const UNSUPPORTED_KEYWORDS = new Set([
    '$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems',
    'minProperties', 'maxProperties', 'default', 'description',
]);

const isObject = (value: unknown): value is JsonSchema =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const defName = (ref: string) => ref.startsWith('#/$defs/') ? ref.slice('#/$defs/'.length) : undefined;

const collectRefs = (node: unknown, refs = new Set<string>()): Set<string> => {
    if (Array.isArray(node)) node.forEach(item => collectRefs(item, refs));
    if (isObject(node)) {
        if (typeof node.$ref === 'string') {
            const name = defName(node.$ref);
            if (name) refs.add(name);
        }
        Object.values(node).forEach(value => collectRefs(value, refs));
    }
    return refs;
};

const cyclicDefs = (defs: Record<string, JsonSchema>) => {
    const edges = new Map(Object.entries(defs).map(([name, def]) => [name, collectRefs(def)]));
    const reaches = (from: string, target: string, seen = new Set<string>()): boolean => {
        for (const next of edges.get(from) ?? []) {
            if (next === target) return true;
            if (!seen.has(next)) {
                seen.add(next);
                if (reaches(next, target, seen)) return true;
            }
        }
        return false;
    };
    return new Set(Object.keys(defs).filter(name => reaches(name, name)));
};

const IMPOSSIBLE = Symbol('impossible');

/** Rewrites refs into cyclic defs to the next unrolled level, or prunes them at the last level. */
const rewriteRefs = (
    node: unknown,
    cyclic: ReadonlySet<string>,
    nextLevel: number | undefined,
    impossibleNext: ReadonlySet<string> = new Set(),
): unknown | typeof IMPOSSIBLE => {
    const recurse = (value: unknown) => rewriteRefs(value, cyclic, nextLevel, impossibleNext);
    if (Array.isArray(node)) {
        const items = node.map(recurse);
        return items.includes(IMPOSSIBLE) ? IMPOSSIBLE : items;
    }
    if (!isObject(node)) return node;
    if (typeof node.$ref === 'string') {
        const name = defName(node.$ref);
        if (name && cyclic.has(name)) {
            return nextLevel === undefined || impossibleNext.has(name)
                ? IMPOSSIBLE
                : { ...node, $ref: `#/$defs/${name}__d${nextLevel}` };
        }
    }
    const result: JsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
        if ((key === 'anyOf' || key === 'oneOf') && Array.isArray(value)) {
            const options = value
                .map(recurse)
                .filter(option => option !== IMPOSSIBLE);
            if (options.length === 0) return IMPOSSIBLE;
            result[key] = options;
            continue;
        }
        if (key === 'properties' && isObject(value)) {
            const properties: JsonSchema = {};
            for (const [property, schema] of Object.entries(value)) {
                const rewritten = recurse(schema);
                if (rewritten === IMPOSSIBLE) return IMPOSSIBLE;
                properties[property] = rewritten;
            }
            result[key] = properties;
            continue;
        }
        const rewritten = recurse(value);
        if (rewritten === IMPOSSIBLE) return IMPOSSIBLE;
        result[key] = rewritten;
    }
    return result;
};

const sanitize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sanitize);
    if (!isObject(node)) return node;
    const result: JsonSchema = {};
    for (const [key, value] of Object.entries(node)) {
        if (UNSUPPORTED_KEYWORDS.has(key)) continue;
        if (key === 'format' && (typeof value !== 'string' || !SUPPORTED_STRING_FORMATS.has(value))) continue;
        if (key === 'properties' && isObject(value)) {
            result[key] = Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, sanitize(schema)]));
            continue;
        }
        result[key === 'oneOf' ? 'anyOf' : key] = sanitize(value);
    }
    if (result.type === 'object' || isObject(result.properties)) result.additionalProperties = false;
    return result;
};

/**
 * Converts a zod schema to a JSON Schema Claude structured outputs accept: recursive defs are
 * unrolled to a fixed depth (the deepest level keeps only non-recursive alternatives) and
 * unsupported constraint keywords are removed. The full zod schema still validates the output.
 */
export function toClaudeJsonSchema(schema: z.ZodType, maxDepth = DEFAULT_RECURSION_DEPTH): JsonSchema {
    const json = z.toJSONSchema(schema, { reused: 'ref' }) as JsonSchema;
    const defs = (isObject(json.$defs) ? json.$defs : {}) as Record<string, JsonSchema>;
    const cyclic = cyclicDefs(defs);
    if (cyclic.size === 0) return sanitize(json) as JsonSchema;

    // Build from the deepest level up so alternatives that cannot terminate are pruned above them.
    const unrolled: Record<string, unknown> = {};
    let impossibleBelow = new Set<string>();
    for (let level = maxDepth; level >= 0; level -= 1) {
        const impossibleHere = new Set<string>();
        for (const name of cyclic) {
            const rewritten = rewriteRefs(
                defs[name],
                cyclic,
                level < maxDepth ? level + 1 : undefined,
                impossibleBelow,
            );
            if (rewritten === IMPOSSIBLE) impossibleHere.add(name);
            else unrolled[`${name}__d${level}`] = rewritten;
        }
        impossibleBelow = impossibleHere;
    }
    const topLevel = (node: unknown) => {
        const rewritten = rewriteRefs(node, cyclic, 0, impossibleBelow);
        if (rewritten === IMPOSSIBLE) throw new Error(`재귀 schema를 깊이 ${maxDepth}로 펼칠 수 없습니다.`);
        return rewritten;
    };
    for (const [name, def] of Object.entries(defs)) {
        if (!cyclic.has(name)) unrolled[name] = topLevel(def);
    }
    const root = { ...json };
    delete root.$defs;
    return sanitize({ ...(topLevel(root) as JsonSchema), $defs: unrolled }) as JsonSchema;
}

const toClaudeEffort = (effort: StructuredReasoningEffort) => effort === 'none' ? 'low' : effort;

/** Reads the JSON object from a text answer, tolerating a stray code fence around it. */
const parseJsonText = (text: string): unknown => {
    const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    for (const candidate of [trimmed, trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)]) {
        try {
            return JSON.parse(candidate);
        } catch {
            // try the next candidate
        }
    }
    return undefined;
};

// Schemas whose constrained-decoding grammar Claude rejected; shared so each client skips the retry.
const promptModeSchemas = new WeakSet<z.ZodType>();

const summarizeIssues = (error: z.ZodError) => error.issues
    .slice(0, 12)
    .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

export class AnthropicStructuredResponseClient implements StructuredResponseClient {
    readonly provider = 'anthropic';
    readonly model: string;
    private readonly client: Anthropic;
    private readonly onUsage?: StructuredResponseUsageListener;
    private readonly schemaCache = new WeakMap<z.ZodType, JsonSchema>();

    constructor(options: {
        apiKey: string;
        model?: string;
        timeoutMs?: number;
        maxRetries?: number;
        onUsage?: StructuredResponseUsageListener;
    }) {
        const apiKey = options.apiKey.trim();
        if (!apiKey) throw new Error('Anthropic API key가 비어 있습니다.');
        const model = options.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
        if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Anthropic 모델명이 올바르지 않습니다.');
        this.model = model;
        this.client = new Anthropic({
            apiKey,
            timeout: options.timeoutMs ?? 20 * 60_000,
            maxRetries: options.maxRetries ?? 2,
        });
        this.onUsage = options.onUsage;
    }

    /**
     * Uses constrained decoding when the schema compiles; schemas whose grammar Claude rejects as
     * too large fall back to a JSON Schema in the system prompt, and zod validates either way.
     */
    private async request<Schema extends z.ZodType>(
        options: StructuredResponseRequest<Schema>,
        messages: Anthropic.MessageParam[],
    ): Promise<Anthropic.Message> {
        const constrained = !promptModeSchemas.has(options.schema);
        const system: Anthropic.TextBlockParam[] = [{ type: 'text', text: options.instructions }];
        if (!constrained) {
            system.push({
                type: 'text',
                text: [
                    '응답은 아래 JSON Schema를 따르는 JSON 객체 하나만 출력하세요. 코드 블록, 설명, 앞뒤 문장을 붙이지 마세요.',
                    JSON.stringify(z.toJSONSchema(options.schema)),
                ].join('\n'),
            });
        }
        system[system.length - 1] = { ...system[system.length - 1], cache_control: { type: 'ephemeral' } };
        try {
            return await this.client.messages.stream({
                model: this.model,
                // Adaptive thinking counts toward max_tokens, so leave room beyond the answer size.
                max_tokens: Math.max(options.maxOutputTokens * 2, 64_000),
                system,
                messages,
                thinking: { type: 'adaptive' },
                output_config: {
                    effort: toClaudeEffort(options.reasoningEffort),
                    ...(constrained && { format: { type: 'json_schema' as const, schema: this.jsonSchemaFor(options.schema) } }),
                },
            }).finalMessage();
        } catch (error) {
            if (constrained && error instanceof Anthropic.BadRequestError &&
                /grammar is too large/i.test(error.message)) {
                promptModeSchemas.add(options.schema);
                return this.request(options, messages);
            }
            throw error;
        }
    }

    private jsonSchemaFor(schema: z.ZodType) {
        let converted = this.schemaCache.get(schema);
        if (!converted) {
            converted = toClaudeJsonSchema(schema);
            this.schemaCache.set(schema, converted);
        }
        return converted;
    }

    async parse<Schema extends z.ZodType>(
        options: StructuredResponseRequest<Schema>,
    ): Promise<z.output<Schema>> {
        const startedAt = Date.now();
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: options.input }];
        const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, attempts: 0 };
        try {
            // One feedback retry: constraints removed from the API schema are enforced by zod here.
            for (let attempt = 1; attempt <= 2; attempt += 1) {
                const message = await this.request(options, messages);
                usage.attempts = attempt;
                usage.input += message.usage.input_tokens;
                usage.output += message.usage.output_tokens;
                usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
                usage.cacheCreation += message.usage.cache_creation_input_tokens ?? 0;
                if (message.stop_reason === 'refusal') {
                    throw new Error(`요청이 거절되었습니다: ${message.stop_details?.category ?? '분류 없음'}`);
                }
                if (message.stop_reason === 'max_tokens') {
                    throw new Error('응답이 max_tokens에서 잘렸습니다.');
                }
                const text = message.content
                    .flatMap(block => block.type === 'text' ? [block.text] : [])
                    .join('');
                const parsed = parseJsonText(text);
                const result = parsed === undefined
                    ? undefined
                    : options.schema.safeParse(parsed);
                if (result?.success) return result.data as z.output<Schema>;
                const issues = result ? summarizeIssues(result.error) : 'JSON 객체를 읽을 수 없습니다.';
                if (attempt === 2) throw new Error(`schema 검증 실패:\n${issues}`);
                messages.push(
                    { role: 'assistant', content: message.content },
                    {
                        role: 'user',
                        content: `위 JSON이 schema 검증에 실패했습니다. 아래 오류만 고친 전체 JSON을 다시 출력하세요.\n${issues}`,
                    },
                );
            }
            throw new Error('구조화 결과가 비어 있습니다.');
        } catch (error) {
            const message = error instanceof Error
                ? error.message.replace(/\s+/g, ' ').trim().slice(0, 500)
                : '알 수 없는 API 오류';
            throw new Error(`Anthropic Messages API 호출 실패: ${message}`, { cause: error });
        } finally {
            if (usage.attempts > 0) {
                this.onUsage?.({
                    provider: this.provider,
                    model: this.model,
                    schemaName: options.schemaName,
                    inputTokens: usage.input,
                    outputTokens: usage.output,
                    cacheReadInputTokens: usage.cacheRead,
                    cacheCreationInputTokens: usage.cacheCreation,
                    attempts: usage.attempts,
                    durationMs: Date.now() - startedAt,
                });
            }
        }
    }
}
