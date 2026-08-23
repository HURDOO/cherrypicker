import { describe, expect, it } from 'vitest';
import {
    canAcknowledgePromotionAuditErrors,
    createPromotionCandidateAudit,
    formatPromotionAuditError,
    unresolvedPromotionAuditErrors,
} from './promotion-candidate-audit';

const offer = () => ({
    providerId: 'naverpay',
    layer: 'POST_REWARD',
    title: '공식몰 2천원 적립',
    description: '5만원 이상 결제 시 2천원 적립',
    brandIds: ['official-store'],
    categoryIds: [],
    channels: ['ONLINE'],
    action: { type: 'FLAT', value: 2_000, valueSemantics: 'EXACT', maxBenefit: 2_000 },
    condition: {
        amountBasis: 'REMAINING_AMOUNT',
        applicabilityScope: 'STORE_WIDE',
        calculationMode: 'CALCULABLE',
        minSpend: 50_000,
        requiredInputs: [],
    },
    compatibility: {
        requiredPayProviderIds: ['naverpay'],
        allowedFundingTypes: ['MONEY'],
        blocksCardBenefit: false,
        allowResidualPayment: false,
    },
    limitConfig: { monthlyCount: 1 },
    certainty: 'CONFIRMED',
    sourceUrl: 'https://pay.example/benefit/1',
});

const documents = [{
    id: 'document-1',
    sourceUrl: 'https://pay.example/api/benefits',
    extractedText: '공식몰 이벤트: 5만원 이상 결제 시 2천원 적립, 월 1회 제공',
}];

describe('promotion candidate audit', () => {
    it('links calculation fields to a preserved official document', () => {
        const candidate = offer();
        const audit = createPromotionCandidateAudit({
            candidate,
            baseline: candidate,
            evidenceTexts: ['5만원 이상 결제 시 2천원 적립'],
            documents,
        });

        expect(audit.summary.missingFields).toBe(0);
        expect(audit.summary.coveredFields).toBeGreaterThan(8);
        expect(audit.coverage[0].evidence[0]).toMatchObject({
            documentId: 'document-1',
            sourceUrl: 'https://pay.example/api/benefits',
        });
        expect(audit.coverage.find(item => item.path === 'compatibility.blocksCardBenefit'))
            .toMatchObject({ status: 'COVERED' });
        expect(audit.blockingErrors).toEqual([]);
    });

    it('matches official excerpts despite display punctuation spacing', () => {
        const candidate = offer();
        const audit = createPromotionCandidateAudit({
            candidate,
            baseline: candidate,
            evidenceTexts: ['VIP/GOLD 1,000원당 100원 할인 · 1일 1회'],
            documents: [{
                id: 'document-2',
                sourceUrl: 'https://brand.example/membership',
                extractedText: '모바일카드 VIP / GOLD 1,000원당 100원 할인',
            }],
        });

        expect(audit.summary.missingFields).toBe(0);
        expect(audit.blockingErrors).toEqual([]);
    });

    it('blocks a high-risk field removed from the published offer', () => {
        const baseline = offer();
        const current = offer();
        const candidate = {
            ...current,
            action: {
                type: current.action.type,
                value: current.action.value,
                valueSemantics: current.action.valueSemantics,
            },
        };

        const audit = createPromotionCandidateAudit({
            candidate,
            baseline,
            evidenceTexts: ['5만원 이상 결제 시 2천원 적립'],
            documents,
        });

        expect(audit.changes).toEqual(expect.arrayContaining([
            expect.objectContaining({
                path: 'action.maxBenefit',
                kind: 'REMOVED',
                risk: 'HIGH',
            }),
        ]));
        expect(audit.blockingErrors).toContain(
            '게시 후보에서 기존 고위험 계산 필드가 제거됩니다: action.maxBenefit'
        );
    });

    it('blocks calculation fields whose quote is absent from the source bundle', () => {
        const audit = createPromotionCandidateAudit({
            candidate: offer(),
            evidenceTexts: ['전혀 다른 근거 문장'],
            documents,
        });

        expect(audit.summary.missingFields).toBeGreaterThan(8);
        expect(audit.blockingErrors).toEqual(expect.arrayContaining([
            '계산 필드의 공식 원문 근거가 없습니다: action.value',
        ]));
    });

    it('allows an admin to acknowledge only high-risk field removals', () => {
        expect(canAcknowledgePromotionAuditErrors([
            '게시 후보에서 기존 고위험 계산 필드가 제거됩니다: action.maxBenefit',
        ])).toBe(true);
        expect(canAcknowledgePromotionAuditErrors([
            '이전 게시본의 계산 필드가 누락되었습니다: condition.eligibleItemSummary',
        ])).toBe(true);
        expect(canAcknowledgePromotionAuditErrors([
            '계산 필드의 공식 원문 근거가 없습니다: action.value',
        ])).toBe(false);
        expect(canAcknowledgePromotionAuditErrors([])).toBe(false);
    });

    it('clarifies the legacy high-risk removal message for display', () => {
        expect(formatPromotionAuditError(
            '이전 게시본의 계산 필드가 누락되었습니다: condition.eligibleItemSummary'
        )).toBe(
            '게시 후보에서 기존 고위험 계산 필드가 제거됩니다: condition.eligibleItemSummary'
        );
    });

    it('resolves a removal blocker when the reviewer restores that field', () => {
        const errors = [
            '게시 후보에서 기존 고위험 계산 필드가 제거됩니다: condition.eligibleItemSummary',
            '계산 필드의 공식 원문 근거가 없습니다: action.value',
        ];

        expect(unresolvedPromotionAuditErrors(errors, {
            condition: {
                eligibleItemSummary: '제휴사가 지정한 상품·서비스에 한해 적용',
            },
        })).toEqual([
            '계산 필드의 공식 원문 근거가 없습니다: action.value',
        ]);
        expect(unresolvedPromotionAuditErrors(errors, {
            condition: { eligibleItemSummary: '' },
        })).toEqual(errors);
    });
});
