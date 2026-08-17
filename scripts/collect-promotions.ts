import './load-env';
import { collectPromotionCandidates } from '../src/lib/promotion-collector';

async function main() {
    const results = await collectPromotionCandidates();
    const discovered = results.reduce((sum, result) => sum + result.discovered, 0);
    const published = results.reduce((sum, result) => sum + result.published, 0);
    const reviewRequired = results.reduce((sum, result) => sum + result.reviewRequired, 0);
    const unchanged = results.reduce((sum, result) => sum + result.unchanged, 0);
    const expired = results.reduce((sum, result) => sum + result.expired, 0);
    const failed = results.filter(result => result.status === 'failed');
    const skipped = results.filter(result => result.status === 'skipped');

    console.log(
        `Promotion collection: ${discovered} discovered, ${published} published, ` +
        `${reviewRequired} review required, ${unchanged} unchanged, ` +
        `${expired} expired, ${failed.length} failed, ${skipped.length} skipped.`
    );
    results.forEach(result => {
        const summary = [
            result.discovered && `${result.discovered} new`,
            result.published && `${result.published} published`,
            result.reviewRequired && `${result.reviewRequired} review`,
            result.unchanged && `${result.unchanged} unchanged`,
            result.expired && `${result.expired} expired`,
            result.products && `${result.products} products`,
        ].filter(Boolean).join(', ');
        const line = `${result.label}: ${result.status}${summary ? ` (${summary})` : ''}` +
            `${result.message ? ` - ${result.message}` : ''}`;
        if (result.status === 'failed') console.error(line);
        else console.log(line);
    });

    if (failed.length > 0 && discovered === 0 && unchanged === 0) process.exitCode = 1;
}

void main();
