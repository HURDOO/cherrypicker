import './load-env';
import {
    collectAllSystemCardBenefits,
    resolveCardBenefitBatchMaxAiCards,
} from '../src/lib/card-benefit-batch';
import { collectSystemCardBenefits } from '../src/lib/card-benefit-ingestion';

const maxAiCardsArgument = () => process.argv.find(argument => (
    argument.startsWith('--max-ai-cards=')
))?.slice('--max-ai-cards='.length);

async function main() {
    if (process.argv.includes('--all')) {
        const maxAiCards = resolveCardBenefitBatchMaxAiCards(
            maxAiCardsArgument() ?? process.env.CARD_BENEFIT_BATCH_MAX_AI_CARDS,
        );
        const result = await collectAllSystemCardBenefits({
            forceExtraction: process.argv.includes('--force'),
            maxAiCards,
            trigger: process.argv.includes('--scheduled') ? 'SCHEDULED' : 'CLI',
        });
        console.log(
            `Card benefit batch: ${result.totals.targets} targets, ` +
            `${result.totals.created} created, ${result.totals.unchanged} unchanged, ` +
            `${result.totals.deferred} deferred, ${result.totals.failed} failed, ` +
            `${result.totals.aiExtractions}/${result.maxAiCards} AI card extractions.`
        );
        result.items.forEach(item => console.log(
            `- ${item.cardId}: ${item.status}, ${item.durationMs}ms` +
            `${item.cacheHit ? ', AI cache hit' : ''}` +
            `${item.aiExtraction ? ', AI extracted' : ''}` +
            `${item.validationErrorCount ? `, ${item.validationErrorCount} validation errors` : ''}` +
            `${item.sourceFailureCount ? `, ${item.sourceFailureCount} source failures` : ''}` +
            `${item.error ? `, ${item.error}` : ''}`
        ));
        if (result.totals.failed > 0 || result.totals.deferred > 0 ||
            result.totals.validationErrors > 0) {
            process.exitCode = 2;
        }
        return;
    }
    const cardId = process.argv.find(argument => argument.startsWith('--card='))
        ?.slice('--card='.length) || 'shinhan_sol';
    const result = await collectSystemCardBenefits(cardId, {
        forceExtraction: process.argv.includes('--force'),
    });

    console.log(
        `Card benefit collection: ${result.status}, ${result.cardId}, ` +
        `document v${result.version}, ${result.extractor}, ` +
        `${result.sources.length} sources, ${result.sourceFailures.length} source failures, ` +
        `${result.validationErrors.length} validation errors` +
        `${result.cacheHit ? ', AI cache hit' : ''}` +
        `${result.localRepair ? ', local evidence repair' : ''}` +
        `${result.candidatePreserved ? ', previous clean candidate preserved' : ''}.`
    );

    result.sources.forEach(source => console.log(
        `- ${source.sourceKind} v${source.version} (${source.status}): ${source.sourceUrl}` +
        (source.pageCount ? ` [${source.pageCount} pages]` : '')
    ));

    result.sourceFailures.forEach(failure => console.error(
        `- source failure ${failure.label}: ${failure.message}`
    ));

    if (result.validationErrors.length > 0) {
        result.validationErrors.forEach(error => console.error(`- ${error}`));
        process.exitCode = 2;
    }
}

void main();
