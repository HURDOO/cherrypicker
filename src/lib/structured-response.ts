import type { z } from 'zod';

export type StructuredReasoningEffort =
    | 'none'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';

export interface StructuredResponseRequest<Schema extends z.ZodType> {
    schema: Schema;
    schemaName: string;
    instructions: string;
    input: string;
    reasoningEffort: StructuredReasoningEffort;
    maxOutputTokens: number;
}

/** Token usage of one structured call, reported for cost and model comparison. */
export interface StructuredResponseUsage {
    provider: string;
    model: string;
    schemaName: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    attempts: number;
    durationMs: number;
}

export type StructuredResponseUsageListener = (usage: StructuredResponseUsage) => void;

/** Provider-neutral structured output client shared by card and promotion AI parsers. */
export interface StructuredResponseClient {
    readonly provider: string;
    readonly model: string;
    parse<Schema extends z.ZodType>(
        options: StructuredResponseRequest<Schema>,
    ): Promise<z.output<Schema>>;
}
