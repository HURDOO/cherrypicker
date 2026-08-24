import './load-env';
import { collectSystemCardBenefits } from '../src/lib/card-benefit-ingestion';

async function main() {
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
