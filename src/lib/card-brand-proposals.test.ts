import { describe, expect, it } from 'vitest';
import type { BenefitRule } from '@/types';
import {
    referencedProposedBrands,
    resolveCardBrandProposals,
    type CardBrandProposalDraft,
} from './card-brand-proposals';
import { officialBrandIdFor } from './promotion-parsers';

const rule = (id: string, includedBrands: string[]): BenefitRule => ({
    id,
    cardId: 'card_a',
    includedBrands,
    description: id,
    detail: '',
    condition: {},
    action: { type: 'PERCENT', value: 10 },
    limitConfig: {},
});

const draft = (ref: string, name: string, aliases: string[] = []): CardBrandProposalDraft => ({
    ref,
    name,
    categoryId: 'shopping',
    aliases,
    sourceUrl: 'https://card.example.com',
    quote: `${name} 결제 시 10% 할인`,
});

const catalogBrands = [
    { id: 'oliveyoung', name: '올리브영' },
    { id: 'gs25', name: 'GS25' },
];

describe('card brand proposals', () => {
    it('links a proposal to an existing brand by name or alias instead of duplicating it', () => {
        const { extraction, proposedBrands, notes } = resolveCardBrandProposals(
            { rules: [rule('by_name', ['new_olive']), rule('by_alias', ['new_gs'])] },
            [draft('new_olive', '올리브 영'), draft('new_gs', '지에스25', ['GS 25'])],
            catalogBrands,
        );

        expect(extraction.rules.map(item => item.includedBrands)).toEqual([['oliveyoung'], ['gs25']]);
        expect(proposedBrands).toEqual([]);
        expect(notes).toEqual([
            '제안 브랜드 올리브 영을(를) 기존 브랜드 oliveyoung로 연결했습니다.',
            '제안 브랜드 지에스25을(를) 기존 브랜드 gs25로 연결했습니다.',
        ]);
    });

    it('assigns the shared official ID to a new merchant in legacy and DSL scopes', () => {
        const dslRule: BenefitRule = {
            ...rule('dsl', []),
            program: {
                languageVersion: 1,
                target: { includedBrandIds: ['new_wefan'], excludedBrandIds: ['new_wefan'] },
                eligibility: { op: 'literal', value: true },
                benefit: { op: 'literal', value: 0 },
            },
        };
        const { extraction, proposedBrands } = resolveCardBrandProposals(
            { rules: [rule('legacy', ['new_wefan', 'gs25']), dslRule] },
            [draft('new_wefan', '위팬샵', ['WE FAN'])],
            catalogBrands,
        );
        const id = officialBrandIdFor('위팬샵');

        expect(extraction.rules[0].includedBrands).toEqual([id, 'gs25']);
        expect(extraction.rules[1].program?.target).toEqual({
            includedBrandIds: [id],
            excludedBrandIds: [id],
        });
        expect(proposedBrands).toEqual([{
            id,
            name: '위팬샵',
            categoryId: 'shopping',
            aliases: ['WE FAN'],
            sourceUrl: 'https://card.example.com',
            quote: '위팬샵 결제 시 10% 할인',
        }]);
    });

    it('keeps only proposals that published rules still reference', () => {
        const kept = { ...draft('x', '위팬샵'), id: officialBrandIdFor('위팬샵') };
        const dropped = { ...draft('y', '베어스하우스'), id: officialBrandIdFor('베어스하우스') };

        expect(referencedProposedBrands([rule('kept', [kept.id])], [kept, dropped])
            .map(brand => brand.id)).toEqual([kept.id]);
    });
});
