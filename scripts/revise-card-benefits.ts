import './load-env';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
    createCardBenefitRevisionCandidate,
    reviewCardBenefitCandidate,
} from '../src/lib/card-benefit-ingestion';
import type { CardBenefitRevisionPatch } from '../src/lib/card-benefit-revision';
import type { CardBenefitExtraction } from '../src/types';

/**
 * Applies a reviewed revision spec to system cards without AI. A published card is patched from
 * its approved extraction; a card that was never published names a saved extraction of its
 * latest candidate's documents in `base` (path relative to the spec, checked by SHA-256) and
 * replaces its stale pending candidate.
 *   tsx scripts/revise-card-benefits.ts --spec=<file.json> [--card=<id>]
 *     (dry run: validation errors and audited rule changes only)
 *   tsx scripts/revise-card-benefits.ts --spec=<file.json> --create
 *     (stores pending candidates for the admin review screen)
 *   tsx scripts/revise-card-benefits.ts --spec=<file.json> --approve --reviewer=<userId>
 *     (stores and approves them; refuses when any card has validation errors)
 */
interface RevisionSpec {
    note: string;
    cards: Record<string, Omit<CardBenefitRevisionPatch, 'note'> & {
        note?: string;
        base?: { path: string; sha256: string };
    }>;
}

const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

const short = (value: unknown) => {
    const text = JSON.stringify(value) ?? 'undefined';
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
};

function main() {
    const specPath = argument('spec');
    if (!specPath) throw new Error('--spec=<file.json>이 필요합니다.');
    const spec = JSON.parse(readFileSync(specPath, 'utf8')) as RevisionSpec;
    const onlyCard = argument('card');
    const approve = process.argv.includes('--approve');
    const create = approve || process.argv.includes('--create');
    const reviewer = argument('reviewer');
    if (approve && !reviewer) throw new Error('--approve에는 --reviewer=<userId>가 필요합니다.');

    const loadBase = (base: { path: string; sha256: string }) => {
        const content = readFileSync(resolve(dirname(specPath), base.path));
        const sha256 = createHash('sha256').update(content).digest('hex');
        if (sha256 !== base.sha256) throw new Error(`기준 구조화 결과의 SHA-256이 다릅니다: ${base.path}`);
        const parsed = JSON.parse(content.toString('utf8')) as { extraction?: CardBenefitExtraction };
        if (!parsed.extraction) throw new Error(`기준 파일에 extraction이 없습니다: ${base.path}`);
        return parsed.extraction;
    };
    const patches = Object.entries(spec.cards)
        .filter(([cardId]) => !onlyCard || cardId === onlyCard)
        .map(([cardId, { note, base, ...patch }]) => [cardId, {
            ...patch,
            note: note ? `${spec.note} ${note}` : spec.note,
        }, base ? { baseExtraction: loadBase(base), replacePending: true } : {}] as const);
    let failed = false;
    patches.forEach(([cardId, patch, options]) => {
        const { validationErrors, audit } = createCardBenefitRevisionCandidate(cardId, patch, {
            ...options,
            dryRun: true,
        });
        console.log(`\n## ${cardId}: ${validationErrors.length} validation errors, ` +
            `+${audit.summary.addedRules} -${audit.summary.removedRules} rules, ` +
            `${audit.summary.changedFields} changed fields`);
        validationErrors.forEach(error => console.log(`  ! ${error}`));
        audit.changes.forEach(change => console.log(
            `  ${change.risk === 'HIGH' ? '*' : '-'} ${change.entityId} ${change.path} ${change.kind}: ` +
            `${short(change.before)} -> ${short(change.after)}`,
        ));
        if (validationErrors.length > 0) failed = true;
    });
    if (!create) return;
    if (approve && failed) {
        process.exitCode = 2;
        console.error('\n검증 오류가 있어 어떤 카드도 승인하지 않았습니다.');
        return;
    }
    patches.forEach(([cardId, patch, options]) => {
        const { candidate, validationErrors } = createCardBenefitRevisionCandidate(cardId, patch, options);
        console.log(`\n${cardId}: candidate ${candidate?.id} (${validationErrors.length} errors)`);
        if (approve && candidate) {
            const approved = reviewCardBenefitCandidate(candidate.id, 'APPROVED', reviewer!);
            console.log(`  approved${approved && 'revision' in approved ? ` as revision ${approved.revision}` : ''}`);
        }
    });
}

main();
