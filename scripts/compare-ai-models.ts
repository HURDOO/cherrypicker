import './load-env';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../src/db';
import { cardBenefitCandidates, cards } from '../src/db/schema';
import { AnthropicStructuredResponseClient } from '../src/lib/anthropic-responses';
import {
    OpenAICardBenefitExtractionProvider,
    type CardBenefitExtractionProvider,
} from '../src/lib/card-benefit-extraction';
import { dryRunCardBenefitExtraction } from '../src/lib/card-benefit-ingestion';
import { OpenAIStructuredResponseClient } from '../src/lib/openai-responses';
import {
    collectSktMembershipSource,
    fetchHtml,
    parseSource,
    promotionSources,
} from '../src/lib/promotion-collector';
import {
    classifyParsedPromotions,
    OpenAIPromotionSemanticProvider,
    PromotionSemanticClassifier,
    type PromotionSemanticProvider,
} from '../src/lib/promotion-semantic-classifier';
import {
    OpenAISktPromotionProvider,
    SktPromotionAiParser,
    type SktPromotionAiProvider,
} from '../src/lib/skt-promotion-ai-parser';
import type {
    StructuredResponseClient,
    StructuredResponseUsage,
} from '../src/lib/structured-response';

/*
 * Read-only model comparison. Re-runs card and promotion AI structuring on identical inputs and
 * writes results to an output directory; it never writes the database or publishes anything.
 *
 *   tsx scripts/compare-ai-models.ts --providers=anthropic,openai --cards=all|id,id \
 *     [--card-providers=anthropic] [--promotions] [--model=claude-opus-5-5] [--max-usd=<budget>] \
 *     [--concurrency=3] --out=<dir>
 *
 * Production uses luna only. Providers have no default and an Anthropic run needs an explicit
 * --max-usd, so paid Claude calls happen only when a run names both.
 */

// `previous` replays each card's latest stored candidate through today's checks without any AI call.
type ProviderName = 'openai' | 'anthropic' | 'previous';

const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const providerArgument = argument('providers');
if (!providerArgument) throw new Error('--providers=openai|anthropic|previous를 지정하세요.');
const providers = providerArgument.split(',') as ProviderName[];
// Cards can run on a subset of providers while promotions compare every listed provider.
const cardProviders = (argument('card-providers')?.split(',') ?? providers) as ProviderName[];
const cardArgument = argument('cards');
const outDir = resolve(argument('out') ?? `../../experiments/cherrypicker-model-compare-${new Date().toISOString().slice(0, 10)}`);
const maxUsd = Number(argument('max-usd'));
if ([...providers, ...cardProviders].includes('anthropic') && !(maxUsd > 0)) {
    throw new Error('Anthropic 호출에는 --max-usd 예산을 지정하세요.');
}
const concurrency = Number(argument('concurrency') ?? 3);
const anthropicModel = argument('model');

// Claude Opus 5.5 list prices per million tokens; OpenAI spend is reported as tokens only.
const ANTHROPIC_PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
let anthropicSpendUsd = 0;

const costUsd = (usage: StructuredResponseUsage[]) => usage
    .filter(item => item.provider === 'anthropic')
    .reduce((sum, item) => sum +
        (item.inputTokens * ANTHROPIC_PRICE.input +
            item.outputTokens * ANTHROPIC_PRICE.output +
            item.cacheReadInputTokens * ANTHROPIC_PRICE.cacheRead +
            item.cacheCreationInputTokens * ANTHROPIC_PRICE.cacheWrite) / 1_000_000, 0);

const totals = (usage: StructuredResponseUsage[]) => ({
    calls: usage.length,
    inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
    cacheReadInputTokens: usage.reduce((sum, item) => sum + item.cacheReadInputTokens, 0),
    cacheCreationInputTokens: usage.reduce((sum, item) => sum + item.cacheCreationInputTokens, 0),
    retries: usage.reduce((sum, item) => sum + item.attempts - 1, 0),
    costUsd: Number(costUsd(usage).toFixed(4)),
});

const createClient = (
    provider: ProviderName,
    purpose: 'card' | 'skt' | 'semantic',
    usage: StructuredResponseUsage[],
): StructuredResponseClient => {
    const onUsage = (item: StructuredResponseUsage) => {
        usage.push(item);
        anthropicSpendUsd += costUsd([item]);
    };
    if (provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY가 없습니다.');
        return new AnthropicStructuredResponseClient({ apiKey, model: anthropicModel, onUsage });
    }
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY가 없습니다.');
    // Same model resolution and timeouts as the production factories.
    const model = purpose === 'card'
        ? process.env.CARD_BENEFIT_AI_MODEL || process.env.OPENAI_MODEL
        : purpose === 'skt'
            ? process.env.PROMOTION_SKT_AI_MODEL || process.env.PROMOTION_AI_MODEL || process.env.OPENAI_MODEL
            : process.env.PROMOTION_AI_MODEL || process.env.OPENAI_MODEL;
    const timeoutMs = purpose === 'card' ? 180_000 : purpose === 'skt' ? 60_000 : 45_000;
    return new OpenAIStructuredResponseClient({ apiKey, model, timeoutMs, onUsage });
};

const writeJson = (path: string, value: unknown) => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

async function mapWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            results[index] = await run(items[index]);
        }
    }));
    return results;
}

const comparableCardIds = () => {
    const withCandidates = new Set(db.select({ cardId: cardBenefitCandidates.cardId })
        .from(cardBenefitCandidates).all().map(row => row.cardId));
    return db.select({ id: cards.id }).from(cards)
        .where(and(isNull(cards.userId)))
        .all()
        .map(row => row.id)
        .filter(id => withCandidates.has(id))
        .sort();
};

const replayLatestCandidate = (cardId: string): CardBenefitExtractionProvider => ({
    id: 'previous',
    async extract() {
        const candidate = db.select().from(cardBenefitCandidates)
            .where(eq(cardBenefitCandidates.cardId, cardId))
            .orderBy(desc(cardBenefitCandidates.createdAt))
            .get();
        if (!candidate) throw new Error('저장된 후보가 없습니다.');
        return {
            extraction: candidate.extraction,
            extractor: candidate.extractor,
            confidence: candidate.confidence,
            validationErrors: candidate.validationErrors,
        };
    },
});

async function runCard(provider: ProviderName, cardId: string) {
    if (provider === 'anthropic' && anthropicSpendUsd >= maxUsd) {
        return { cardId, provider, ok: false, skipped: `예산 ${maxUsd}달러 도달` };
    }
    const usage: StructuredResponseUsage[] = [];
    const client = provider === 'previous'
        ? { provider: 'previous', model: 'stored-candidate' }
        : createClient(provider, 'card', usage);
    const startedAt = Date.now();
    try {
        const run = await dryRunCardBenefitExtraction(
            cardId,
            provider === 'previous'
                ? replayLatestCandidate(cardId)
                : new OpenAICardBenefitExtractionProvider({ client: client as StructuredResponseClient }),
        );
        const { extraction } = run.result;
        const clauses = extraction.unsupportedClauses ?? [];
        const coverage = run.validation.coverage;
        const summary = {
            cardId,
            provider,
            model: client.model,
            ok: true,
            durationMs: run.durationMs,
            sourceCharacters: run.sourceCharacters,
            rules: extraction.rules.length,
            zeroValueRules: extraction.rules.filter(rule => rule.action.value === 0 && !rule.program).length,
            dslRules: extraction.rules.filter(rule => rule.program).length,
            confirmationRules: extraction.rules.filter(rule => (
                rule.condition.confirmationRequired || rule.condition.manualCheckRequired ||
                rule.condition.itemSpecific || (rule.program?.confirmations?.length ?? 0) > 0
            )).length,
            extractorErrors: run.result.validationErrors?.length ?? 0,
            validationErrors: run.validation.errors.length,
            blockingErrors: run.blockingErrors.length,
            auditBlockingErrors: run.audit.blockingErrors.length,
            highRiskChanges: run.audit.changes.filter(change => change.risk === 'HIGH').length,
            unsupportedClauses: clauses.length,
            valueAffectingClauses: clauses.filter(clause => clause.affectsValue).length,
            patternIds: Object.fromEntries([...new Set(clauses.map(clause => clause.patternId ?? '(없음)'))]
                .map(id => [id, clauses.filter(clause => (clause.patternId ?? '(없음)') === id).length])),
            excludedRules: coverage?.excludedRules.length ?? 0,
            coverageCaveats: coverage?.caveats.length ?? 0,
            proposedBrands: extraction.proposedBrands?.length ?? 0,
            previousCandidate: {
                extractor: run.previousCandidate.extractor,
                status: run.previousCandidate.status,
                rules: run.previousCandidate.extraction.rules.length,
                validationErrors: run.previousCandidate.validationErrors.length,
            },
            usage: totals(usage),
        };
        writeJson(join(outDir, provider, 'cards', `${cardId}.json`), {
            summary,
            extractorErrors: run.result.validationErrors,
            validationErrors: run.validation.errors,
            blockingErrors: run.blockingErrors,
            auditBlockingErrors: run.audit.blockingErrors,
            highRiskChanges: run.audit.changes.filter(change => change.risk === 'HIGH'),
            coverage,
            extraction,
            usage,
        });
        console.log(`[card] ${provider} ${cardId} ok ${Math.round(run.durationMs / 1000)}s ` +
            `rules=${summary.rules} errors=${summary.blockingErrors} cost=$${summary.usage.costUsd}`);
        return summary;
    } catch (error) {
        const summary = {
            cardId,
            provider,
            model: client.model,
            ok: false,
            durationMs: Date.now() - startedAt,
            error: errorMessage(error).slice(0, 800),
            usage: totals(usage),
        };
        writeJson(join(outDir, provider, 'cards', `${cardId}.json`), { summary, usage });
        console.log(`[card] ${provider} ${cardId} failed: ${summary.error.slice(0, 200)}`);
        return summary;
    }
}

const fetchCache = new Map<string, ReturnType<typeof fetchHtml>>();
const cachedFetch = (url: string) => {
    if (!fetchCache.has(url)) fetchCache.set(url, fetchHtml(url));
    return fetchCache.get(url)!;
};
const parsedSourceCache = new Map<string, ReturnType<typeof parseSource>>();

async function runPromotions(provider: ProviderName) {
    const usage: StructuredResponseUsage[] = [];
    const sktCalls: Array<{ brandId: string; brandName: string; output?: unknown; error?: string }> = [];
    const semanticCalls: Array<{ title: string; output?: unknown; error?: string }> = [];
    const sktInner = new OpenAISktPromotionProvider({ client: createClient(provider, 'skt', usage) });
    const recordingSkt: SktPromotionAiProvider = {
        id: sktInner.id,
        model: sktInner.model,
        async extract(input) {
            try {
                const output = await sktInner.extract(input);
                sktCalls.push({ brandId: input.officialBrandId, brandName: input.brandName, output });
                return output;
            } catch (error) {
                sktCalls.push({ brandId: input.officialBrandId, brandName: input.brandName, error: errorMessage(error) });
                throw error;
            }
        },
    };
    const semanticInner = new OpenAIPromotionSemanticProvider({ client: createClient(provider, 'semantic', usage) });
    const recordingSemantic: PromotionSemanticProvider = {
        id: semanticInner.id,
        model: semanticInner.model,
        async classify(input) {
            try {
                const output = await semanticInner.classify(input);
                semanticCalls.push({ title: input.title, output });
                return output;
            } catch (error) {
                semanticCalls.push({ title: input.title, error: errorMessage(error) });
                throw error;
            }
        },
    };
    const classifier = new PromotionSemanticClassifier(recordingSemantic, 25, []);
    const sources: Array<Record<string, unknown>> = [];
    for (const source of promotionSources) {
        try {
            const parsed = source.kind === 'skt-html'
                ? await collectSktMembershipSource(source.url, cachedFetch, new SktPromotionAiParser(recordingSkt, 15, [], 24_000))
                : await (parsedSourceCache.get(source.id) ?? (() => {
                    const pending = parseSource(source, new SktPromotionAiParser(undefined));
                    parsedSourceCache.set(source.id, pending);
                    return pending;
                })());
            const classified = await classifyParsedPromotions(parsed.promotions, classifier);
            sources.push({
                sourceId: source.id,
                promotions: classified.length,
                informationOnly: classified.filter(item => item.offer.condition.calculationMode === 'INFORMATION_ONLY').length,
                completeness: parsed.documents[0]?.responseMetadata?.collectionCompleteness,
            });
        } catch (error) {
            sources.push({ sourceId: source.id, error: errorMessage(error).slice(0, 500) });
        }
    }
    const summary = {
        provider,
        sources,
        sktAiCalls: sktCalls.length,
        sktAiErrors: sktCalls.filter(call => call.error).length,
        semanticCalls: semanticCalls.length,
        semanticErrors: semanticCalls.filter(call => call.error).length,
        usage: totals(usage),
    };
    writeJson(join(outDir, provider, 'promotions.json'), { summary, sktCalls, semanticCalls, usage });
    console.log(`[promotions] ${provider} skt=${summary.sktAiCalls} semantic=${summary.semanticCalls} ` +
        `cost=$${summary.usage.costUsd}`);
    return summary;
}

async function main() {
    mkdirSync(outDir, { recursive: true });
    const cardIds = cardArgument === 'all'
        ? comparableCardIds()
        : (cardArgument ?? '').split(',').map(id => id.trim()).filter(Boolean);
    for (const provider of providers) {
        const cardSummaries = cardProviders.includes(provider)
            ? await mapWithConcurrency(cardIds, concurrency, cardId => runCard(provider, cardId))
            : [];
        const promotionSummary = process.argv.includes('--promotions') ? await runPromotions(provider) : undefined;
        writeJson(join(outDir, provider, `summary-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), {
            cards: cardSummaries,
            promotions: promotionSummary,
            totals: {
                anthropicSpendUsd: Number(anthropicSpendUsd.toFixed(4)),
            },
        });
    }
    console.log(`결과: ${outDir} / Claude 누적 비용 약 $${anthropicSpendUsd.toFixed(2)}`);
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
