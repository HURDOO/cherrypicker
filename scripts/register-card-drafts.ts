import './load-env';
import { readFileSync } from 'node:fs';
import {
    createSystemCardDraftBatch,
    parseSystemCardDraftBatchInput,
} from '../src/lib/system-card-onboarding';

/**
 * Registers system card drafts with their official sources, the same path as `/admin/cards/new`.
 * Drafts stay out of the public catalog until a reviewed revision is approved.
 *   tsx scripts/register-card-drafts.ts --file=<drafts.json>
 * The file holds `{ "cards": [...] }` with 1–5 drafts in the admin request format.
 */
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

function main() {
    const file = argument('file');
    if (!file) throw new Error('--file=<drafts.json>이 필요합니다.');
    const inputs = parseSystemCardDraftBatchInput(JSON.parse(readFileSync(file, 'utf8')));
    createSystemCardDraftBatch(inputs).forEach(card => {
        console.log(`${card.id}: DRAFT 등록 (${card.name})`);
    });
}

main();
