import './load-env';
import { collectShinhanSolTravelBenefits } from '../src/lib/card-benefit-ingestion';

async function main() {
    const result = await collectShinhanSolTravelBenefits();

    console.log(
        `Card benefit collection: ${result.status}, ${result.cardId}, ` +
        `document v${result.version}, ${result.extractor}, ` +
        `${result.sources.length} sources, ${result.sourceFailures.length} source failures, ` +
        `${result.validationErrors.length} validation errors.`
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
