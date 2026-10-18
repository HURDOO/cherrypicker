import './load-env';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db';
import { promotionCandidates } from '../src/db/schema';
import { unresolvedPromotionAuditErrors } from '../src/lib/promotion-candidate-audit';
import { reviewPromotionCandidate } from '../src/lib/promotion-candidate-review-server';

/**
 * Lists a provider's pending promotion candidates and, with --approve, approves only those the
 * admin screen would approve without acknowledging anything: no unresolved audit error, not a
 * removal candidate. Each approval records the session note so it stays apart from a person's
 * approval (TASK-15 T3 temporary approval rule).
 *   tsx scripts/review-promotion-candidates.ts --provider=skt
 *   tsx scripts/review-promotion-candidates.ts --provider=skt --approve --reviewer=<userId> --note="[세션 임시 승인] ..."
 */
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

function main() {
    const provider = argument('provider');
    if (!provider) throw new Error('--provider=<id>가 필요합니다.');
    const approve = process.argv.includes('--approve');
    const reviewer = argument('reviewer');
    const note = argument('note');
    if (approve && (!reviewer || !note?.startsWith('[세션 임시 승인]'))) {
        throw new Error('--approve에는 --reviewer와 [세션 임시 승인]으로 시작하는 --note가 필요합니다.');
    }
    const pending = db.select().from(promotionCandidates)
        .where(and(
            eq(promotionCandidates.providerId, provider),
            eq(promotionCandidates.status, 'PENDING'),
        ))
        .all();
    const removal = pending.filter(candidate => candidate.diff.removedFromSource === true);
    const reviewable = pending.filter(candidate => candidate.diff.removedFromSource !== true);
    const blocked = reviewable.flatMap(candidate => {
        const errors = unresolvedPromotionAuditErrors(
            candidate.audit?.blockingErrors ?? [],
            candidate.parsedOffer as Record<string, unknown>,
        );
        return errors.length > 0 ? [{ candidate, errors }] : [];
    });
    const blockedIds = new Set(blocked.map(item => item.candidate.id));
    const clean = reviewable.filter(candidate => !blockedIds.has(candidate.id));
    console.log(`${provider}: pending ${pending.length}, removal ${removal.length}, ` +
        `clean ${clean.length}, blocked ${blocked.length}`);
    const reasons = new Map<string, number>();
    blocked.forEach(item => item.errors.forEach(error => {
        const key = error.replace(/[0-9,]+/g, '#').slice(0, 90);
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }));
    [...reasons.entries()].sort((left, right) => right[1] - left[1]).slice(0, 15)
        .forEach(([reason, count]) => console.log(`  ! ${count} × ${reason}`));
    if (!approve) return;

    let approved = 0;
    const failures: string[] = [];
    clean.forEach(candidate => {
        try {
            reviewPromotionCandidate(candidate.id, 'APPROVED', reviewer!, undefined, false, note);
            approved += 1;
        } catch (error) {
            failures.push(`${candidate.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    console.log(`approved ${approved}, failed ${failures.length}`);
    failures.slice(0, 20).forEach(line => console.log(`  x ${line}`));
}

main();
