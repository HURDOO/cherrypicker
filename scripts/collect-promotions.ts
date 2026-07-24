import './load-env';
import { collectPromotionCandidates } from '../src/lib/promotion-collector';

async function main() {
    const results = await collectPromotionCandidates();
    const created = results.filter(result => result.status === 'created').length;
    const unchanged = results.filter(result => result.status === 'unchanged').length;
    const failed = results.filter(result => result.status === 'failed');

    console.log(`Promotion collection: ${created} created, ${unchanged} unchanged, ${failed.length} failed.`);
    failed.forEach(result => {
        console.error(`${result.sourceUrl}: ${result.message || 'collection failed'}`);
    });

    if (failed.length === results.length) process.exitCode = 1;
}

void main();
