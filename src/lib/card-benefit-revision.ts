import type {
    BenefitRule,
    CardBenefitEvidence,
    CardBenefitExtraction,
    CardBenefitProposedBrand,
    CardBenefitUnsupportedClause,
} from '@/types';

/**
 * A reviewed, deterministic change to a card's approved extraction. It re-enters the normal
 * candidate validation, audit and approval path, so every changed value still needs an official
 * quote in the stored source documents.
 */
export interface CardBenefitRevisionPatch {
    /** Why the revision exists; appended to the candidate notes. */
    note: string;
    /** JSON merge patches (RFC 7396) keyed by rule ID. `null` removes a field. */
    rules?: Record<string, Record<string, unknown>>;
    removeRuleIds?: string[];
    /** JSON merge patches keyed by unsupported clause ID. `null` removes the clause. */
    unsupportedClauses?: Record<string, Record<string, unknown> | null>;
    /** JSON merge patches keyed by evidence ID. `null` removes the evidence. */
    evidence?: Record<string, Record<string, unknown> | null>;
    addEvidence?: CardBenefitEvidence[];
    addUnsupportedClauses?: CardBenefitUnsupportedClause[];
    addProposedBrands?: CardBenefitProposedBrand[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const mergePatch = (target: unknown, patch: unknown): unknown => {
    if (!isPlainObject(patch)) return structuredClone(patch);
    const result: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
    Object.entries(patch).forEach(([key, value]) => {
        if (value === null) {
            delete result[key];
            return;
        }
        result[key] = mergePatch(result[key], value);
    });
    return result;
};

const withoutRuleIds = (
    condition: BenefitRule['condition'],
    field: 'stackableWithRuleIds' | 'fallbackAfterRuleIds',
    removed: ReadonlySet<string>,
) => {
    const ids = condition[field];
    if (!ids) return condition;
    const kept = ids.filter(ruleId => !removed.has(ruleId));
    const next = { ...condition };
    if (kept.length > 0) next[field] = kept;
    else delete next[field];
    return next;
};

export function applyCardBenefitRevisionPatch(
    extraction: CardBenefitExtraction,
    patch: CardBenefitRevisionPatch,
): CardBenefitExtraction {
    const ruleIds = new Set(extraction.rules.map(rule => rule.id));
    const unknownIds = [...Object.keys(patch.rules ?? {}), ...(patch.removeRuleIds ?? [])]
        .filter(ruleId => !ruleIds.has(ruleId));
    if (unknownIds.length > 0) {
        throw new Error(`수정 대상 규칙이 승인 후보에 없습니다: ${unknownIds.join(', ')}`);
    }
    const clauseIds = new Set((extraction.unsupportedClauses ?? []).map(clause => clause.id));
    const unknownClauseIds = Object.keys(patch.unsupportedClauses ?? {}).filter(id => !clauseIds.has(id));
    if (unknownClauseIds.length > 0) {
        throw new Error(`수정 대상 미지원 문구가 승인 후보에 없습니다: ${unknownClauseIds.join(', ')}`);
    }
    const evidenceIds = new Set(extraction.evidence.map(item => item.id));
    const unknownEvidenceIds = Object.keys(patch.evidence ?? {}).filter(id => !evidenceIds.has(id));
    if (unknownEvidenceIds.length > 0) {
        throw new Error(`수정 대상 근거가 승인 후보에 없습니다: ${unknownEvidenceIds.join(', ')}`);
    }
    const removed = new Set(patch.removeRuleIds ?? []);
    const rules = extraction.rules
        .filter(rule => !removed.has(rule.id))
        .map(rule => {
            const patched = patch.rules?.[rule.id]
                ? mergePatch(rule, patch.rules[rule.id]) as BenefitRule
                : structuredClone(rule);
            if (patched.id !== rule.id) throw new Error(`규칙 ID는 바꿀 수 없습니다: ${rule.id}`);
            let condition = withoutRuleIds(patched.condition, 'stackableWithRuleIds', removed);
            condition = withoutRuleIds(condition, 'fallbackAfterRuleIds', removed);
            return { ...patched, condition };
        });
    const evidence = extraction.evidence.flatMap(original => {
        const evidencePatch = patch.evidence?.[original.id];
        if (evidencePatch === null) return [];
        const item = evidencePatch
            ? mergePatch(original, evidencePatch) as CardBenefitEvidence
            : original;
        const kept = item.ruleIds.filter(ruleId => !removed.has(ruleId));
        return kept.length > 0 ? [{ ...item, ruleIds: kept }] : [];
    });
    // A clause tied only to removed rules goes with them; an empty list would mean card-wide.
    const unsupportedClauses = (extraction.unsupportedClauses ?? []).flatMap(original => {
        const clausePatch = patch.unsupportedClauses?.[original.id];
        if (clausePatch === null) return [];
        const clause = clausePatch
            ? mergePatch(original, clausePatch) as CardBenefitUnsupportedClause
            : original;
        if (clause.ruleIds.length === 0) return [clause];
        const kept = clause.ruleIds.filter(ruleId => !removed.has(ruleId));
        return kept.length > 0 ? [{ ...clause, ruleIds: kept }] : [];
    });
    const next: CardBenefitExtraction = {
        ...structuredClone(extraction),
        rules,
        evidence: [...evidence, ...structuredClone(patch.addEvidence ?? [])],
        notes: [...extraction.notes, patch.note],
    };
    const clauses = [...unsupportedClauses, ...structuredClone(patch.addUnsupportedClauses ?? [])];
    if (clauses.length > 0) next.unsupportedClauses = clauses;
    else delete next.unsupportedClauses;
    const proposedBrands = [
        ...(extraction.proposedBrands ?? []),
        ...structuredClone(patch.addProposedBrands ?? []),
    ];
    if (proposedBrands.length > 0) next.proposedBrands = proposedBrands;
    return next;
}
