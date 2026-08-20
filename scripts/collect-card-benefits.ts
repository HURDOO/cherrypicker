import './load-env';
import { collectShinhanSolTravelBenefits } from '../src/lib/card-benefit-ingestion';

async function main() {
    const result = await collectShinhanSolTravelBenefits();

    console.log(
        `Card benefit collection: ${result.status}, ${result.cardId}, ` +
        `document v${result.version}, ${result.extractor}, ` +
        `${result.validationErrors.length} validation errors.`
    );

    if (result.validationErrors.length > 0) {
        result.validationErrors.forEach(error => console.error(`- ${error}`));
        process.exitCode = 2;
    }
}

void main();
