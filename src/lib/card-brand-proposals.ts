import type { BenefitProgramV1, BenefitRule, CardBenefitProposedBrand } from '@/types';
import {
    findSystemBrandId,
    normalizeOfficialBrandName,
    officialBrandIdFor,
} from './promotion-parsers';

/** Brand proposal as the AI returns it: rules point at `ref` until the server assigns an ID. */
export interface CardBrandProposalDraft {
    ref: string;
    name: string;
    categoryId: string;
    aliases: string[];
    sourceUrl: string;
    quote: string;
}

type CatalogBrand = { id: string; name: string };

/** Structural rule shape shared by parsed AI rules (nullable fields) and BenefitRule. */
type BrandScopedRule = {
    includedBrands?: string[] | null;
    excludedBrands?: string[] | null;
    program?: BenefitProgramV1 | null;
};

export const CARD_BRAND_PROPOSAL_REF_PATTERN = /^new_[a-z0-9_]{2,60}$/;

const replaceIds = (ids: string[], mapping: ReadonlyMap<string, string>) => (
    [...new Set(ids.map(id => mapping.get(id) ?? id))]
);

/** Normalized name → existing brand ID, for spotting a proposal that duplicates a registered brand. */
export const brandNameIndex = (brands: CatalogBrand[]) => new Map(
    brands.map(brand => [normalizeOfficialBrandName(brand.name), brand.id]),
);

/**
 * Matches each proposed merchant against registered brands by name and alias first, so an
 * existing brand is reused instead of duplicated; otherwise assigns the shared official ID.
 */
export function resolveCardBrandProposals<R extends BrandScopedRule, T extends { rules: R[] }>(
    extraction: T,
    drafts: CardBrandProposalDraft[],
    catalogBrands: CatalogBrand[],
): { extraction: T; proposedBrands: CardBenefitProposedBrand[]; notes: string[] } {
    if (drafts.length === 0) return { extraction, proposedBrands: [], notes: [] };
    const catalogIds = new Set(catalogBrands.map(brand => brand.id));
    const names = brandNameIndex(catalogBrands);
    const mapping = new Map<string, string>();
    const proposals = new Map<string, CardBenefitProposedBrand>();
    const notes: string[] = [];

    drafts.forEach(draft => {
        const existingId = [draft.name, ...draft.aliases].map(name => (
            names.get(normalizeOfficialBrandName(name)) ??
            [findSystemBrandId(name)].find(id => id && catalogIds.has(id))
        )).find(Boolean);
        if (existingId) {
            mapping.set(draft.ref, existingId);
            notes.push(`제안 브랜드 ${draft.name}을(를) 기존 브랜드 ${existingId}로 연결했습니다.`);
            return;
        }
        const id = officialBrandIdFor(draft.name);
        mapping.set(draft.ref, id);
        if (catalogIds.has(id) || proposals.has(id)) return;
        proposals.set(id, {
            id,
            name: draft.name.trim(),
            categoryId: draft.categoryId,
            aliases: [...new Set(draft.aliases.map(alias => alias.trim()).filter(Boolean))],
            sourceUrl: draft.sourceUrl,
            quote: draft.quote,
        });
    });

    const rules = extraction.rules.map((rule): R => {
        const target = rule.program?.target;
        return {
            ...rule,
            ...(rule.includedBrands && { includedBrands: replaceIds(rule.includedBrands, mapping) }),
            ...(rule.excludedBrands && { excludedBrands: replaceIds(rule.excludedBrands, mapping) }),
            ...(rule.program && target && {
                program: {
                    ...rule.program,
                    target: {
                        ...target,
                        ...(target.includedBrandIds && {
                            includedBrandIds: replaceIds(target.includedBrandIds, mapping),
                        }),
                        ...(target.excludedBrandIds && {
                            excludedBrandIds: replaceIds(target.excludedBrandIds, mapping),
                        }),
                    },
                },
            }),
        };
    });

    return { extraction: { ...extraction, rules }, proposedBrands: [...proposals.values()], notes };
}

const ruleBrandIds = (rule: BenefitRule) => [
    ...(rule.includedBrands ?? []),
    ...(rule.excludedBrands ?? []),
    ...(rule.program?.target?.includedBrandIds ?? []),
    ...(rule.program?.target?.excludedBrandIds ?? []),
];

/** Proposals still referenced after rule-level coverage; only these are registered at approval. */
export const referencedProposedBrands = (
    rules: BenefitRule[],
    proposals: CardBenefitProposedBrand[] | undefined,
) => {
    const referenced = new Set(rules.flatMap(ruleBrandIds));
    return (proposals ?? []).filter(brand => referenced.has(brand.id));
};
