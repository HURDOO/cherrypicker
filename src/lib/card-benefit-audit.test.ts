import { describe, expect, it } from 'vitest';
import type { Card, CardBenefitRevisionSnapshot } from '@/types';
import { shinhanSolSourceText } from '@/test/fixtures/shinhan-sol-source';
import { createCardBenefitCandidateAudit } from './card-benefit-audit';
import { extractShinhanSolTravelWithRules } from './card-benefit-extraction';

const card: Card = {
    id: 'shinhan_sol',
    name: '신한카드 SOL트래블 체크',
    company: '신한카드',
    color: 'bg-blue-600',
    limitTable: [],
    network: 'MASTERCARD',
};

const extraction = () => extractShinhanSolTravelWithRules({
    card,
    sourceUrl: 'https://www.shinhancard.com/official',
    sourceText: shinhanSolSourceText,
}).extraction;

const baseline = (): CardBenefitRevisionSnapshot => {
    const current = extraction();
    return { card, rules: current.rules };
};

describe('card benefit candidate audit', () => {
    it('fully covers the canonical representative card without noisy changes', () => {
        const audit = createCardBenefitCandidateAudit({
            extraction: extraction(),
            baseline: baseline(),
            baselineRevision: 2,
            asOfDate: '2026-08-21',
        });

        expect(audit.summary).toMatchObject({
            addedRules: 0,
            removedRules: 0,
            changedFields: 0,
            missingFields: 0,
        });
        expect(audit.blockingErrors).toEqual([]);
        expect(audit.coverage.length).toBeGreaterThan(30);
    });

    it('blocks a required field removed from the published baseline', () => {
        const candidate = extraction();
        const convenience = candidate.rules.find(rule => (
            rule.id === 'sol_domestic_convenience'
        ))!;
        delete convenience.condition.minPerformance;

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
            asOfDate: '2026-08-21',
        });

        expect(audit.changes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entityId: 'sol_domestic_convenience',
                path: 'condition.minPerformance',
                kind: 'REMOVED',
                risk: 'HIGH',
            }),
        ]));
        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('condition.minPerformance'),
        ]));
    });

    it('blocks a present high-risk condition when no evidence covers it', () => {
        const candidate = extraction();
        candidate.evidence = candidate.evidence.map(item => (
            item.ruleIds.includes('sol_lounge')
                ? { ...item, ruleIds: item.ruleIds.filter(ruleId => ruleId !== 'sol_lounge') }
                : item
        ));

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
            asOfDate: '2026-08-21',
        });

        expect(audit.coverage).toEqual(expect.arrayContaining([
            expect.objectContaining({
                ruleId: 'sol_lounge',
                path: 'condition.minPerformance',
                status: 'MISSING_EVIDENCE',
            }),
        ]));
        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('공항 라운지 무료 · condition.minPerformance'),
        ]));
    });

    it('cross-checks official notice publication and effective dates with affected rules', () => {
        const noticeDocuments = [{
            sourceUrl: 'https://www.shinhancard.com/notice/sol-travel',
            noticeDates: {
                affectedRuleIds: ['sol_cu_event'] as const,
                requirePublicationDate: true,
                requireEffectiveFrom: true,
                publicationDate: '2024-06-13',
                effectiveFrom: '2024-06-20',
            },
        }];
        const validAudit = createCardBenefitCandidateAudit({
            extraction: extraction(),
            baseline: baseline(),
            baselineRevision: 2,
            noticeDocuments: noticeDocuments.map(document => ({
                ...document,
                noticeDates: {
                    ...document.noticeDates,
                    affectedRuleIds: [...document.noticeDates.affectedRuleIds],
                },
            })),
        });
        expect(validAudit.blockingErrors).toEqual([]);

        const candidate = extraction();
        delete candidate.rules.find(rule => rule.id === 'sol_cu_event')!.condition.startsAt;
        const invalidAudit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
            noticeDocuments: [{
                sourceUrl: noticeDocuments[0].sourceUrl,
                noticeDates: {
                    ...noticeDocuments[0].noticeDates,
                    affectedRuleIds: [...noticeDocuments[0].noticeDates.affectedRuleIds],
                },
            }],
        });
        expect(invalidAudit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('공식 공지 시행일이 규칙 시작일과 다릅니다'),
        ]));
    });

    it('blocks impossible official notice date ordering', () => {
        const audit = createCardBenefitCandidateAudit({
            extraction: extraction(),
            baseline: baseline(),
            baselineRevision: 2,
            noticeDocuments: [{
                sourceUrl: 'https://www.shinhancard.com/notice/sol-travel',
                noticeDates: {
                    affectedRuleIds: ['sol_cu_event'],
                    requirePublicationDate: true,
                    requireEffectiveFrom: true,
                    publicationDate: '2024-06-21',
                    effectiveFrom: '2024-06-20',
                },
            }],
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('공식 공지 게시일이 시행일보다 늦습니다'),
        ]));
    });
});
