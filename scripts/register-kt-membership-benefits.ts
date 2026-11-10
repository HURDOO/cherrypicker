import './load-env';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../src/db';
import { brands, promotionCandidates } from '../src/db/schema';
import {
    buildKtManualOfferDraft,
    KT_MANUAL_BENEFITS,
    KT_NEW_BRANDS,
    KT_PROVIDER_ID,
    ktManualSourceKey,
    ktPartnerDetailUrl,
} from '../src/lib/kt-membership-manual-benefits';
import { reviewPromotionCandidate } from '../src/lib/promotion-candidate-review-server';
import { normalizePromotionDraft } from '../src/lib/promotion-input';

/**
 * Registers the KT membership standing benefits in src/lib/kt-membership-manual-benefits.ts as
 * admin-made promotion candidates (the same path as the admin manual form) and, with --apply,
 * approves them with a session note (TASK-15 T2, session temporary approval).
 * --pages is a folder of official detail page text excerpts named `<C21-70>.txt`, saved while
 * reading the KT pages; each excerpt becomes the candidate's raw content. Nothing here
 * requests KT pages.
 *   tsx scripts/register-kt-membership-benefits.ts --pages=<dir>
 *   tsx scripts/register-kt-membership-benefits.ts --pages=<dir> --apply --reviewer=<userId> \
 *     --note="[세션 임시 승인] ..."
 */
const argument = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))
    ?.slice(name.length + 3);

function main() {
    const pagesDirectory = argument('pages');
    if (!pagesDirectory) throw new Error('--pages=<dir>가 필요합니다.');
    const apply = process.argv.includes('--apply');
    const reviewer = argument('reviewer');
    const note = argument('note');
    if (apply && (!reviewer || !note?.startsWith('[세션 임시 승인]'))) {
        throw new Error('--apply에는 --reviewer와 [세션 임시 승인]으로 시작하는 --note가 필요합니다.');
    }

    const brandIds = [...new Set(KT_MANUAL_BENEFITS.map(benefit => benefit.brandId))];
    const knownBrands = new Set(db.select({ id: brands.id }).from(brands)
        .where(inArray(brands.id, brandIds))
        .all()
        .map(row => row.id));
    // New brands are created by the approval from the candidate's discoveredBrand.
    const newBrandById = new Map<string, typeof KT_NEW_BRANDS[number]>(
        KT_NEW_BRANDS.map(brand => [brand.id, brand]),
    );
    const missingBrands = brandIds.filter(id => !knownBrands.has(id) && !newBrandById.has(id));
    if (missingBrands.length > 0) {
        throw new Error(`카탈로그에 없는 브랜드: ${missingBrands.join(', ')}`);
    }

    const ktCandidates = db.select().from(promotionCandidates)
        .where(eq(promotionCandidates.providerId, KT_PROVIDER_ID))
        .all();
    let registered = 0;
    let unchanged = 0;
    const failures: string[] = [];

    KT_MANUAL_BENEFITS.forEach(benefit => {
        const sourceKey = ktManualSourceKey(benefit);
        const draft = buildKtManualOfferDraft(benefit);
        const offer = normalizePromotionDraft(draft);
        const rawContent = readFileSync(
            path.join(pagesDirectory, `${benefit.pageCode.replace('/', '-')}.txt`),
            'utf8',
        ).trim();
        const sourceUrl = ktPartnerDetailUrl(benefit.pageCode);
        const sourceHash = createHash('sha256')
            .update(`${sourceKey}\n${JSON.stringify(draft)}\n${rawContent}`)
            .digest('hex');
        const label = `${offer.title} (${offer.condition.calculationMode})`;

        if (ktCandidates.some(candidate =>
            candidate.sourceUrl === sourceUrl && candidate.sourceHash === sourceHash
        )) {
            unchanged += 1;
            console.log(`  = ${label}`);
            return;
        }
        if (!apply) {
            console.log(`  + ${label}`);
            return;
        }

        // A later run with corrected values updates the offer the earlier approval published.
        const previous = ktCandidates.find(candidate =>
            candidate.diff.sourceKey === sourceKey &&
            candidate.status === 'APPROVED' &&
            candidate.linkedPromotionId
        );
        const candidateId = randomUUID();
        try {
            db.insert(promotionCandidates).values({
                id: candidateId,
                providerId: KT_PROVIDER_ID,
                sourceUrl,
                sourceHash,
                sourceTitle: offer.title,
                rawContent: rawContent.slice(0, 120_000),
                parsedOffer: draft,
                diff: {
                    manual: true,
                    sourceKey,
                    ...(!knownBrands.has(benefit.brandId) && newBrandById.has(benefit.brandId) && {
                        discoveredBrand: { ...newBrandById.get(benefit.brandId)! },
                    }),
                    collectionMethod: 'claude-in-chrome-human-pace',
                    observedAt: '2026-11-10',
                },
                status: 'PENDING',
                ...(previous?.linkedPromotionId && { linkedPromotionId: previous.linkedPromotionId }),
                discoveredAt: new Date(),
            }).run();
            reviewPromotionCandidate(candidateId, 'APPROVED', reviewer!, undefined, false, note);
            registered += 1;
            console.log(`  ✓ ${label}`);
        } catch (error) {
            db.delete(promotionCandidates)
                .where(and(
                    eq(promotionCandidates.id, candidateId),
                    eq(promotionCandidates.status, 'PENDING'),
                ))
                .run();
            failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    console.log(`${apply ? 'registered' : 'would register'} ${apply ? registered : KT_MANUAL_BENEFITS.length - unchanged}, ` +
        `unchanged ${unchanged}, failed ${failures.length}`);
    failures.forEach(line => console.log(`  x ${line}`));
    if (failures.length > 0) process.exitCode = 1;
}

main();
