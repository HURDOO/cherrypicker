import { describe, expect, it } from 'vitest';
import type { BenefitRule, CardBenefitExtraction } from '@/types';
import { applyCardBenefitRevisionPatch } from './card-benefit-revision';

const sourceUrl = 'https://card.example.com/benefits';

const rule = (id: string, overrides: Partial<BenefitRule> = {}): BenefitRule => ({
    id,
    cardId: 'card',
    includedBrands: ['merchant'],
    excludedBrands: [],
    platformType: 'ALL',
    usesCardLimit: false,
    description: id,
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value: 10 },
    limitConfig: {},
    ...overrides,
});

const extraction: CardBenefitExtraction = {
    schemaVersion: 2,
    completeness: 'FULL',
    card: { id: 'card', name: '카드', company: '카드사', limitTable: [] },
    rules: [
        rule('base', {
            condition: {
                minPerformance: 300_000,
                manualCheckRequired: true,
                requiredNote: '실적 메모',
                stackableWithRuleIds: ['unmapped', 'extra'],
                fallbackAfterRuleIds: ['unmapped'],
            },
        }),
        rule('unmapped', { action: { type: 'PERCENT', value: 0 }, includedBrands: [] }),
        rule('extra'),
    ],
    evidence: [
        { id: 'shared', ruleIds: ['base', 'unmapped'], fields: ['condition'], sourceUrl, quote: '공통 조건' },
        { id: 'only-unmapped', ruleIds: ['unmapped'], fields: ['description'], sourceUrl, quote: '미매핑' },
    ],
    unsupportedClauses: [
        {
            id: 'linked',
            ruleIds: ['unmapped'],
            sourceUrl,
            quote: '미매핑',
            reason: '대상 확인',
            affectsValue: true,
        },
        {
            id: 'card-wide',
            ruleIds: [],
            sourceUrl,
            quote: '공통 조건',
            reason: '카드 전체',
            affectsValue: true,
        },
    ],
    notes: ['원래 메모'],
};

describe('applyCardBenefitRevisionPatch', () => {
    it('merges rule patches, drops removed rules everywhere and appends additions', () => {
        const next = applyCardBenefitRevisionPatch(extraction, {
            note: '재분류',
            rules: {
                base: {
                    includedBrands: ['merchant', 'new-merchant'],
                    condition: { manualCheckRequired: null, requiredNote: null },
                },
            },
            removeRuleIds: ['unmapped'],
            addEvidence: [{
                id: 'new-merchant',
                ruleIds: ['base'],
                fields: ['condition'],
                sourceUrl,
                quote: '새 가맹점',
            }],
            addProposedBrands: [{
                id: 'official_new',
                name: '새 가맹점',
                categoryId: 'cafe',
                aliases: [],
                sourceUrl,
                quote: '새 가맹점',
            }],
        });

        expect(next.rules.map(item => item.id)).toEqual(['base', 'extra']);
        expect(next.rules[0]).toMatchObject({
            includedBrands: ['merchant', 'new-merchant'],
            condition: { minPerformance: 300_000, stackableWithRuleIds: ['extra'] },
        });
        expect(next.rules[0].condition).not.toHaveProperty('manualCheckRequired');
        expect(next.rules[0].condition).not.toHaveProperty('requiredNote');
        expect(next.rules[0].condition).not.toHaveProperty('fallbackAfterRuleIds');
        expect(next.evidence.map(item => [item.id, item.ruleIds])).toEqual([
            ['shared', ['base']],
            ['new-merchant', ['base']],
        ]);
        expect(next.unsupportedClauses?.map(clause => clause.id)).toEqual(['card-wide']);
        expect(next.proposedBrands?.map(brand => brand.id)).toEqual(['official_new']);
        expect(next.notes).toEqual(['원래 메모', '재분류']);
        expect(extraction.rules[0].condition.manualCheckRequired).toBe(true);
    });

    it('patches or drops existing evidence by ID', () => {
        const next = applyCardBenefitRevisionPatch(extraction, {
            note: '근거 경로 정리',
            evidence: {
                shared: { fields: ['condition', 'program'], programPaths: ['program.target.purchaseScenario.notes[0]'] },
                'only-unmapped': null,
            },
        });

        expect(next.evidence).toEqual([expect.objectContaining({
            id: 'shared',
            fields: ['condition', 'program'],
            programPaths: ['program.target.purchaseScenario.notes[0]'],
        })]);
        expect(() => applyCardBenefitRevisionPatch(extraction, {
            note: '오타',
            evidence: { missing: null },
        })).toThrow('missing');
    });

    it('patches or drops existing unsupported clauses by ID', () => {
        const next = applyCardBenefitRevisionPatch(extraction, {
            note: '문구 재분류',
            unsupportedClauses: {
                linked: { patternId: 'HOSTED_STORE_EXCLUSION', ruleIds: [] },
                'card-wide': null,
            },
        });

        expect(next.unsupportedClauses).toEqual([expect.objectContaining({
            id: 'linked',
            ruleIds: [],
            patternId: 'HOSTED_STORE_EXCLUSION',
            quote: '미매핑',
        })]);
        expect(() => applyCardBenefitRevisionPatch(extraction, {
            note: '오타',
            unsupportedClauses: { missing: null },
        })).toThrow('missing');
    });

    it('patches card fields but keeps the card ID', () => {
        const next = applyCardBenefitRevisionPatch(extraction, {
            note: '상품명 변경',
            card: { name: '새 카드' },
        });

        expect(next.card).toEqual({ ...extraction.card, name: '새 카드' });
        expect(extraction.card.name).toBe('카드');
        expect(() => applyCardBenefitRevisionPatch(extraction, {
            note: '오타',
            card: { id: 'other' },
        })).toThrow('카드 ID');
    });

    it('refuses rule IDs that are not in the approved extraction', () => {
        expect(() => applyCardBenefitRevisionPatch(extraction, {
            note: '오타',
            rules: { missing: { description: '없음' } },
        })).toThrow('missing');
    });
});
