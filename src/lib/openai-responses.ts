import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { z } from 'zod';

export type OpenAIReasoningEffort =
    | 'none'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';

const reasoningEfforts: OpenAIReasoningEffort[] = [
    'none',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
];

export const resolveOpenAIModel = (configured?: string) => {
    const model = configured?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna';
    if (!/^[a-zA-Z0-9._-]+$/.test(model)) {
        throw new Error('OpenAI 모델명이 올바르지 않습니다.');
    }
    return model;
};

export const resolveOpenAIReasoningEffort = (
    configured: string | undefined,
    fallback: OpenAIReasoningEffort,
) => {
    const effort = configured?.trim() || fallback;
    if (!reasoningEfforts.includes(effort as OpenAIReasoningEffort)) {
        throw new Error('OpenAI reasoning effort가 올바르지 않습니다.');
    }
    return effort as OpenAIReasoningEffort;
};

export class OpenAIStructuredResponseClient {
    readonly model: string;
    private readonly client: OpenAI;

    constructor(options: {
        apiKey: string;
        model?: string;
        timeoutMs?: number;
        maxRetries?: number;
    }) {
        const apiKey = options.apiKey.trim();
        if (!apiKey) throw new Error('OpenAI API key가 비어 있습니다.');
        this.model = resolveOpenAIModel(options.model);
        this.client = new OpenAI({
            apiKey,
            timeout: options.timeoutMs ?? 90_000,
            maxRetries: options.maxRetries ?? 2,
        });
    }

    async parse<Schema extends z.ZodType>(options: {
        schema: Schema;
        schemaName: string;
        instructions: string;
        input: string;
        reasoningEffort: OpenAIReasoningEffort;
        maxOutputTokens: number;
    }): Promise<z.output<Schema>> {
        try {
            const response = await this.client.responses.parse({
                model: this.model,
                instructions: options.instructions,
                input: options.input,
                reasoning: { effort: options.reasoningEffort },
                max_output_tokens: options.maxOutputTokens,
                store: false,
                text: {
                    format: zodTextFormat(options.schema, options.schemaName),
                },
            });
            if (response.status !== 'completed') {
                const reason = response.incomplete_details?.reason;
                throw new Error(`응답이 완료되지 않았습니다${reason ? `: ${reason}` : ''}.`);
            }
            if (!response.output_parsed) {
                const refusal = response.output.flatMap(item => (
                    item.type === 'message'
                        ? item.content.flatMap(content => content.type === 'refusal'
                            ? [content.refusal]
                            : [])
                        : []
                )).join(' ');
                throw new Error(refusal
                    ? `요청이 거절되었습니다: ${refusal.slice(0, 300)}`
                    : '구조화 결과가 비어 있습니다.');
            }
            return response.output_parsed as z.output<Schema>;
        } catch (error) {
            const message = error instanceof Error
                ? error.message.replace(/\s+/g, ' ').trim().slice(0, 500)
                : '알 수 없는 API 오류';
            throw new Error(`OpenAI Responses API 호출 실패: ${message}`, { cause: error });
        }
    }
}
