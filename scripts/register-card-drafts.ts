import './load-env';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db';
import { cardBenefitCandidates } from '../src/db/schema';
import { CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR } from '../src/lib/card-benefit-candidate-selection';
import { reviewCardBenefitCandidate } from '../src/lib/card-benefit-ingestion';
import {
    createSystemCardDraftBatch,
    parseSystemCardDraftBatchInput,
    updateSystemCardDraft,
} from '../src/lib/system-card-onboarding';

/**
 * Registers system card drafts with their official sources, the same path as `/admin/cards/new`.
 * Drafts stay out of the public catalog until a reviewed revision is approved.
 *   tsx scripts/register-card-drafts.ts --file=<drafts.json>
 * The file holds `{ "cards": [...] }` with 1–5 drafts in the admin request format.
 *   tsx scripts/register-card-drafts.ts --file=<drafts.json> --update --reviewer=<userId>
 * replaces the sources of existing drafts. Their pending source-only candidates (collected from
 * the old sources, no rules yet) are rejected first; any other pending candidate stops the update.
 */
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

function main() {
    const file = argument('file');
    if (!file) throw new Error('--file=<drafts.json>이 필요합니다.');
    const inputs = parseSystemCardDraftBatchInput(JSON.parse(readFileSync(file, 'utf8')));
    if (!process.argv.includes('--update')) {
        createSystemCardDraftBatch(inputs).forEach(card => {
            console.log(`${card.id}: DRAFT 등록 (${card.name})`);
        });
        return;
    }
    const reviewer = argument('reviewer');
    if (!reviewer) throw new Error('--update에는 --reviewer=<userId>가 필요합니다.');
    inputs.forEach(input => {
        db.select().from(cardBenefitCandidates)
            .where(and(
                eq(cardBenefitCandidates.cardId, input.id),
                eq(cardBenefitCandidates.status, 'PENDING'),
                eq(cardBenefitCandidates.extractor, CARD_BENEFIT_SOURCE_CHANGE_EXTRACTOR),
            ))
            .all()
            .forEach(candidate => {
                reviewCardBenefitCandidate(candidate.id, 'REJECTED', reviewer);
                console.log(`${input.id}: 이전 출처의 원문 후보 ${candidate.id} 반려`);
            });
        updateSystemCardDraft(input);
        console.log(`${input.id}: DRAFT 출처 갱신 (${input.sources.length}개)`);
    });
}

main();
