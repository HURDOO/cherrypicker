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
    it('marks a new performance policy as a high-risk card change', () => {
        const candidate = extraction();
        candidate.card.performancePolicy = {
            version: 1,
            exclusionRules: [{
                id: 'discounted_sale',
                when: { op: 'CARD_DISCOUNT_APPLIED' },
                reason: '할인 매출 실적 제외',
                sourceUrl: 'https://www.shinhancard.com/official',
                quote: '할인 적용 매출 전체',
            }],
        };
        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });
        expect(audit.changes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                scope: 'CARD',
                path: 'performancePolicy',
                risk: 'HIGH',
            }),
        ]));
    });

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

    it('marks a removed published field as high risk for explicit review', () => {
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
        expect(audit.blockingErrors).not.toEqual(expect.arrayContaining([
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

    it('blocks a replacement benefit that changes an existing rule ID', () => {
        const candidate = extraction();
        const convenience = candidate.rules.find(rule => (
            rule.id === 'sol_domestic_convenience'
        ))!;
        convenience.id = 'sol_domestic_convenience_recreated';
        candidate.evidence = candidate.evidence.map(item => ({
            ...item,
            ruleIds: item.ruleIds.map(ruleId => (
                ruleId === 'sol_domestic_convenience'
                    ? convenience.id
                    : ruleId
            )),
        }));

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toContain(
            '동일 혜택의 기존 규칙 ID를 유지해야 합니다: sol_domestic_convenience → ' +
            'sol_domestic_convenience_recreated',
        );
    });

    it('blocks a shared limit group with inconsistent per-rule limits', () => {
        const candidate = extraction();
        const convenience = candidate.rules.find(rule => (
            rule.id === 'sol_domestic_convenience'
        ))!;
        const lounge = candidate.rules.find(rule => rule.id === 'sol_lounge')!;
        convenience.sharedGroupId = 'incorrect_integrated_group';
        lounge.sharedGroupId = 'incorrect_integrated_group';

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('공유 한도 그룹 incorrect_integrated_group'),
        ]));
    });

    it('allows rules to share a monthly limit while keeping a rule-specific daily limit', () => {
        const candidate = extraction();
        const [left, right] = candidate.rules;
        left.sharedGroupId = 'partial_shared_monthly_group';
        right.sharedGroupId = 'partial_shared_monthly_group';
        left.usesCardLimit = false;
        right.usesCardLimit = false;
        left.limitConfig = { dailyAmount: 1_000, monthlyAmount: 100_000 };
        right.limitConfig = { monthlyAmount: 100_000 };

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors.filter(error => (
            error.includes('partial_shared_monthly_group')
        ))).toEqual([]);
    });

    it('blocks inconsistent new-card waivers at the same performance threshold', () => {
        const candidate = extraction();
        candidate.card.limitTable = [{ threshold: 300_000, limit: 10_000 }];
        delete candidate.rules.find(rule => (
            rule.id === 'sol_domestic_convenience'
        ))!.condition.performanceWaiver;

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('신규카드 유예가 서로 다릅니다'),
        ]));
    });

    it('blocks a confirmed base rule that would hide its special-day alternative', () => {
        const candidate = extraction();
        const baseRule = candidate.rules.find(rule => (
            rule.id === 'sol_domestic_convenience'
        ))!;
        const specialRule = candidate.rules.find(rule => rule.id === 'sol_cu_event')!;
        baseRule.includedBrands = ['cu_event'];
        delete baseRule.condition.manualCheckRequired;
        specialRule.includedBrands = ['cu_event'];
        specialRule.description = '국군의날·현충일 CU 30% 할인';
        specialRule.condition.manualCheckRequired = true;

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('특별일 대체 혜택의 일반 규칙'),
        ]));
    });

    it('blocks non-calculable services modeled as a free purchase with a transaction limit', () => {
        const candidate = extraction();
        const lounge = candidate.rules.find(rule => rule.id === 'sol_lounge')!;
        lounge.description = '휴대폰 케어 수리비 보상';
        lounge.action = { type: 'FIXED_PRICE', value: 0 };
        lounge.condition = { manualCheckRequired: true };
        lounge.limitConfig = { monthlyAmount: 100_000 };

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('특정 상품이 아닌 정보성 혜택을 0원 정가제로 계산할 수 없습니다'),
            expect.stringContaining('계산 불가 정보성 혜택에 금액 한도가 설정됐습니다'),
        ]));
    });

    it('blocks a free-item calculation that has no merchant mapping', () => {
        const candidate = extraction();
        const lounge = candidate.rules.find(rule => rule.id === 'sol_lounge')!;
        lounge.description = '제휴 멤버십 7일권 무료';
        lounge.includedBrands = [];
        lounge.action = { type: 'FIXED_PRICE', value: 0 };
        lounge.condition = {
            itemSpecific: true,
            eligibleItemSummary: '제휴 멤버십 7일권',
            manualCheckRequired: true,
        };

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: baseline(),
            baselineRevision: 2,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('가맹점 매핑이 없는 무료 상품 혜택'),
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

        const amendmentCandidate = extraction();
        delete amendmentCandidate.rules.find(rule => (
            rule.id === 'sol_cu_event'
        ))!.condition.startsAt;
        const amendmentAudit = createCardBenefitCandidateAudit({
            extraction: amendmentCandidate,
            baseline: baseline(),
            baselineRevision: 2,
            noticeDocuments: [{
                sourceUrl: 'https://example.com/condition-amendment',
                noticeDates: {
                    ...noticeDocuments[0].noticeDates,
                    affectedRuleIds: [...noticeDocuments[0].noticeDates.affectedRuleIds],
                    applyAsRulePeriod: false,
                },
            }],
        });
        expect(amendmentAudit.blockingErrors).not.toEqual(expect.arrayContaining([
            expect.stringContaining('규칙 시작일과 다릅니다'),
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

    it('blocks a new card made only of non-calculable informational rules', () => {
        const candidate = extraction();
        candidate.rules = candidate.rules.slice(0, 2).map(rule => ({
            ...rule,
            action: { type: 'FLAT' as const, value: 0 },
            condition: { manualCheckRequired: true },
            limitConfig: {},
        }));

        const audit = createCardBenefitCandidateAudit({
            extraction: candidate,
            baseline: { card, rules: [] },
            baselineRevision: 0,
        });

        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            expect.stringContaining('자동 계산 가능한 혜택 금액이 없습니다'),
        ]));
    });
});
