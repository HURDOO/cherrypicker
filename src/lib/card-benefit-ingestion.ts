import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cardBenefitCandidates,
    cardBenefitCandidateDocuments,
    cardBenefitCollectionRuns,
    cardBenefitDocuments,
    cardBenefitRevisions,
    cards,
    categories,
} from '@/db/schema';
import type {
    CardBenefitCandidateStatus,
    CardBenefitDocumentMetadata,
    CardBenefitExtraction,
    CardBenefitNoticeDates,
    CardBenefitRevisionSnapshot,
} from '@/types';
import {
    CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
    CardBenefitExtractionBudgetError,
    createCardBenefitExtractionProvider,
    evidenceRepresentsBenefitClaim,
    extractShinhanSolTravelWithRules,
    normalizeEvidenceBackedCardBenefitExtraction,
    type CardBenefitExtractionInput,
    type CardBenefitExtractionProvider,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { createCardBenefitCandidateAudit } from './card-benefit-audit';
import {
    isReusableCardBenefitCandidate,
    shouldReplacePendingCardBenefitCandidate,
} from './card-benefit-candidate-selection';
import {
    getManagedSystemCardBenefitSourceInventory,
    getManagedSystemCardBenefitSources,
} from './system-card-onboarding';
import { toCard, toRule } from './db-mappers';
import {
    collectOfficialDocument,
    createOfficialDocumentSemanticHash,
    createOfficialSourceBundleHash,
    discoverOfficialPdfSources,
    splitPdfPages,
    type CollectedOfficialDocument,
    type OfficialDocumentSourceDefinition,
} from './official-document-source';

export class CardBenefitIngestionError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'CardBenefitIngestionError';
    }
}

export type CardBenefitCollectionResult = {
    status: 'created' | 'unchanged';
    documentId: string;
    candidateId: string;
    cardId: string;
    sourceUrl: string;
    version: number;
    extractor: string;
    model?: string;
    confidence: number;
    validationErrors: string[];
    candidatePreserved?: boolean;
    cacheHit?: boolean;
    localRepair?: boolean;
    sources: Array<{
        documentId: string;
        label: string;
        sourceUrl: string;
        sourceKind: (typeof cardBenefitDocuments.$inferSelect)['sourceKind'];
        mediaType: string;
        version: number;
        status: 'created' | 'unchanged';
        pageCount?: number;
        noticeDates?: CardBenefitNoticeDates;
    }>;
    sourceFailures: Array<{
        label: string;
        sourceUrl: string;
        message: string;
    }>;
};

type StoredSource = {
    collected: CollectedOfficialDocument;
    document: typeof cardBenefitDocuments.$inferSelect;
    status: 'created' | 'unchanged';
};

type SourceFailure = CardBenefitCollectionResult['sourceFailures'][number];

const collectSourceDefinitions = async (
    definitions: OfficialDocumentSourceDefinition[],
): Promise<{ collected: CollectedOfficialDocument[]; failures: SourceFailure[] }> => {
    const settled = await Promise.all(definitions.map(async definition => {
        try {
            return {
                ok: true as const,
                definition,
                document: await collectOfficialDocument(definition),
            };
        } catch (error) {
            if (definition.required) throw error;
            return {
                ok: false as const,
                definition,
                error: error instanceof Error ? error.message : '알 수 없는 수집 오류',
            };
        }
    }));
    return {
        collected: settled.flatMap(result => result.ok ? [result.document] : []),
        failures: settled.flatMap(result => !result.ok ? [{
            label: result.definition.label,
            sourceUrl: result.definition.sourceUrl,
            message: result.error.slice(0, 500),
        }] : []),
    };
};

const collectCardSourceBundle = async (cardId: string) => {
    const configured = getManagedSystemCardBenefitSources(cardId);
    if (configured.length === 0) {
        throw new CardBenefitIngestionError(400, '아직 수집을 지원하지 않는 시스템 카드입니다.');
    }
    const initial = await collectSourceDefinitions(configured);
    const configuredUrls = new Set(configured.map(source => source.sourceUrl));
    const discoveredByUrl = new Map(initial.collected
        .filter(source => source.definition.format === 'html')
        .flatMap(source => discoverOfficialPdfSources(source.rawContent, source.definition))
        .filter(source => !configuredUrls.has(source.sourceUrl))
        .map(source => [source.sourceUrl, source]));
    const discovered = [...discoveredByUrl.values()];
    const discoveredResult = discovered.length > 0
        ? await collectSourceDefinitions(discovered)
        : { collected: [], failures: [] };
    return {
        collected: [...initial.collected, ...discoveredResult.collected],
        failures: [...initial.failures, ...discoveredResult.failures],
    };
};

const storeCollectedSource = (
    cardId: string,
    collected: CollectedOfficialDocument,
): StoredSource => {
    const existingDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, cardId),
            eq(cardBenefitDocuments.sourceUrl, collected.sourceUrl),
            eq(cardBenefitDocuments.contentHash, collected.contentHash),
        ))
        .get();
    if (existingDocument) {
        const document = db.update(cardBenefitDocuments)
            .set({
                responseMetadata: collected.responseMetadata,
                extractedText: collected.extractedText,
                collectedAt: new Date(),
            })
            .where(eq(cardBenefitDocuments.id, existingDocument.id))
            .returning()
            .get();
        return { collected, document, status: 'unchanged' };
    }
    const semanticallyUnchangedDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, cardId),
            eq(cardBenefitDocuments.sourceUrl, collected.sourceUrl),
        ))
        .orderBy(desc(cardBenefitDocuments.version))
        .all()
        .find(document => (
            document.mediaType === collected.mediaType &&
            createOfficialDocumentSemanticHash(document.extractedText) ===
                createOfficialDocumentSemanticHash(collected.extractedText)
        ));
    if (semanticallyUnchangedDocument) {
        const document = db.update(cardBenefitDocuments)
            .set({
                responseMetadata: collected.responseMetadata,
                collectedAt: new Date(),
            })
            .where(eq(cardBenefitDocuments.id, semanticallyUnchangedDocument.id))
            .returning()
            .get();
        return { collected, document, status: 'unchanged' };
    }
    const latestDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, cardId),
            eq(cardBenefitDocuments.sourceUrl, collected.sourceUrl),
        ))
        .orderBy(desc(cardBenefitDocuments.version))
        .get();
    const document = db.insert(cardBenefitDocuments).values({
        id: randomUUID(),
        cardId,
        sourceUrl: collected.sourceUrl,
        sourceKind: collected.definition.sourceKind,
        mediaType: collected.mediaType.slice(0, 200),
        contentHash: collected.contentHash,
        version: (latestDocument?.version ?? 0) + 1,
        rawContent: collected.rawContent,
        extractedText: collected.extractedText,
        responseMetadata: collected.responseMetadata,
        collectedAt: new Date(),
    }).returning().get();
    return { collected, document, status: 'created' };
};

const noticeDocumentsFrom = (
    documents: Array<{ sourceUrl: string; responseMetadata: CardBenefitDocumentMetadata }>,
) => documents.flatMap(document => {
    const noticeDates = document.responseMetadata.noticeDates;
    return noticeDates ? [{ sourceUrl: document.sourceUrl, noticeDates }] : [];
});

const applyOfficialNoticeDates = (
    extraction: CardBenefitExtraction,
    notices: Array<{ sourceUrl: string; noticeDates: CardBenefitNoticeDates }>,
) => {
    const normalized = structuredClone(extraction);
    const ruleById = new Map(normalized.rules.map(ruleRow => [ruleRow.id, ruleRow]));
    notices.forEach(({ sourceUrl, noticeDates }) => {
        const isKnownConditionAmendment = sourceUrl.includes('ARTICLE_SERIAL=11274');
        if (noticeDates.applyAsRulePeriod === false || isKnownConditionAmendment) return;
        noticeDates.affectedRuleIds.forEach(ruleId => {
            const ruleRow = ruleById.get(ruleId);
            if (!ruleRow) return;
            if (noticeDates.effectiveFrom) {
                ruleRow.condition.startsAt = noticeDates.effectiveFrom;
            }
            if (noticeDates.effectiveTo) {
                ruleRow.condition.endsAt = noticeDates.effectiveTo;
            }
        });
    });
    return normalized;
};

const normalizedErrorTokens = (value: string) => (
    value.toLocaleLowerCase('ko-KR').match(/[\p{L}\p{N}]+/gu) ?? []
).filter(token => token.length >= 2 && ![
    '공식', '혜택', '섹션', '영역', '구조화', '결과', '누락되었습니다',
].includes(token));

const providerInventoryErrorResolved = (
    error: string,
    extraction: CardBenefitExtraction,
) => {
    const unknownReference = error.match(
        /^알 수 없는 혜택 인벤토리\s+(\S+)를 구조화 coverage가 참조합니다\.$/
    )?.[1];
    if (unknownReference) {
        const suffix = unknownReference.replace(/^[a-z]\d+_/i, '');
        return extraction.evidence.some(item => (
            item.fields.includes('condition') && item.ruleIds.length > 0 &&
            item.id.replace(/^inventory-[a-z]\d+_/i, '').includes(suffix)
        ));
    }
    const missingSection = error.match(
        /^공식 혜택 섹션\s+(.+)\(([^()]+)\)이 구조화 결과에서 누락되었습니다\.$/
    );
    if (!missingSection) return false;
    const tokens = normalizedErrorTokens(missingSection[1]);
    if (tokens.length === 0) return false;
    const matchingRuleIds = extraction.rules.filter(ruleRow => {
        const description = ruleRow.description.toLocaleLowerCase('ko-KR');
        return tokens.every(token => description.includes(token));
    }).map(ruleRow => ruleRow.id);
    return matchingRuleIds.length > 0 && extraction.evidence.some(item => (
        item.fields.includes('condition') &&
        item.ruleIds.some(ruleId => matchingRuleIds.includes(ruleId))
    ));
};

const retainUnresolvedProviderErrors = (
    errors: string[],
    extraction: CardBenefitExtraction,
    recomputedErrors: Set<string>,
) => errors.filter(error => {
    if (recomputedErrors.has(error)) return true;
    if (error.startsWith('공식 혜택 문장이 인벤토리에서 누락됐습니다')) {
        const claim = error.split(':').slice(1).join(':').trim();
        if (/^(?:예시|예)\s*\)?\s*/i.test(claim)) return false;
        return !claim || !evidenceRepresentsBenefitClaim(extraction.evidence, claim);
    }
    if (error.startsWith('신규·최초 이용 조건이 혜택 인벤토리에서 누락됐습니다') &&
        /연회비\s*반환|반환\s*금액|발행[·\s]*배송/.test(error)) {
        return false;
    }
    if (/^규칙 \d+이 존재하지 않는 브랜드 .+를 참조합니다\.$/.test(error)) {
        return false;
    }
    if (/^(?:혜택 인벤토리|근거) \d+이 수집되지 않은 공식 원문을 참조합니다\.$/.test(error) ||
        /^혜택 인벤토리 .+가 없는 규칙 .+를 참조합니다\.$/.test(error) ||
        /^근거 \d+이 알 수 없는 규칙 .+를 참조합니다\.$/.test(error)) {
        return false;
    }
    if (/^(?:공유 필드가 있지만 공유 한도 그룹이 없습니다|공식 사이트 전용 혜택에 가맹점 매핑이 없습니다|결제금액 미만 구간에 배타적 상한이 없습니다):/.test(error)) {
        return false;
    }
    if (providerInventoryErrorResolved(error, extraction)) return false;
    if (/^(?:규칙 .* 근거가 없습니다\.|규칙 .+의 DSL (?:노드|숫자) 근거가 없습니다:|근거 \d+이 규칙 .+의 없는 DSL 노드 |할인율 |최소 결제금액 |최대 결제금액 |배타적 최대 결제금액 |최소 실적 |일 금액 한도 |월 금액 한도 |건별 최대 혜택이 |필수 조건의 공식 근거가 없습니다:|계산 불가 정보성 혜택에 금액 한도가 설정됐습니다:|카드 통합 한도를 쓰지 않는 DSL에 카드 월 한도가 있습니다:|신규카드 유예의 비율형 월 한도를 자동 계산할 수 없습니다:|특정 결제처 DSL 혜택이 카테고리 전체로 설정됐습니다:|공식 공지 |공식 혜택 |공식 거래 대상 브랜드가 |특정 상품 혜택이 |동일한 최소 실적 |복수 한도 표의 열 제목이 근거 문장에 없습니다:)/
        .test(error)) {
        return false;
    }
    return true;
});

const currentReferences = () => ({
    categoryIds: new Set(db.select({ id: categories.id }).from(categories).all().map(row => row.id)),
    brandIds: new Set(db.select({ id: brands.id }).from(brands).all().map(row => row.id)),
    ruleOwners: new Map(db.select({
        id: benefitRules.id,
        cardId: benefitRules.cardId,
        userId: benefitRules.userId,
    }).from(benefitRules).all().map(row => [row.id, {
        cardId: row.cardId,
        userId: row.userId,
    }])),
});

const currentExtractionCatalog = () => ({
    categories: db.select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(isNull(categories.userId))
        .all(),
    brands: db.select({
        id: brands.id,
        name: brands.name,
        categoryId: brands.categoryId,
    }).from(brands)
        .where(isNull(brands.userId))
        .all(),
});

const activeRevisionNumber = (cardId: string) => db.select({
    revision: cardBenefitRevisions.revision,
}).from(cardBenefitRevisions)
    .where(and(
        eq(cardBenefitRevisions.cardId, cardId),
        eq(cardBenefitRevisions.isActive, true),
    ))
    .get()?.revision ?? 0;

const toCollectionResult = (
    status: CardBenefitCollectionResult['status'],
    sources: StoredSource[],
    candidate: typeof cardBenefitCandidates.$inferSelect,
    sourceFailures: SourceFailure[],
    overrides: {
        validationErrors?: string[];
        candidatePreserved?: boolean;
        cacheHit?: boolean;
        localRepair?: boolean;
    } = {},
): CardBenefitCollectionResult => ({
    status,
    documentId: candidate.documentId,
    candidateId: candidate.id,
    cardId: candidate.cardId,
    sourceUrl: sources.find(source => source.document.id === candidate.documentId)?.document.sourceUrl ?? '',
    version: sources.find(source => source.document.id === candidate.documentId)?.document.version ?? 0,
    extractor: candidate.extractor,
    ...(candidate.model && { model: candidate.model }),
    confidence: candidate.confidence,
    validationErrors: overrides.validationErrors ?? candidate.validationErrors,
    ...(overrides.candidatePreserved && { candidatePreserved: true }),
    ...(overrides.cacheHit && { cacheHit: true }),
    ...(overrides.localRepair && { localRepair: true }),
    sources: sources.map(source => ({
        documentId: source.document.id,
        label: source.collected.definition.label,
        sourceUrl: source.document.sourceUrl,
        sourceKind: source.document.sourceKind,
        mediaType: source.document.mediaType,
        version: source.document.version,
        status: source.status,
        ...(source.document.responseMetadata.pageCount && {
            pageCount: source.document.responseMetadata.pageCount,
        }),
        ...(source.document.responseMetadata.noticeDates && {
            noticeDates: source.document.responseMetadata.noticeDates,
        }),
    })),
    sourceFailures,
});

export async function collectSystemCardBenefits(cardId: string, options: {
    provider?: CardBenefitExtractionProvider;
    collectedSources?: CollectedOfficialDocument[];
    forceExtraction?: boolean;
} = {}): Promise<CardBenefitCollectionResult> {
    const cardRow = db.select().from(cards)
        .where(and(eq(cards.id, cardId), isNull(cards.userId)))
        .get();
    if (!cardRow) throw new CardBenefitIngestionError(404, '수집할 시스템 카드를 찾을 수 없습니다.');
    const card = toCard(cardRow);
    const bundle = options.collectedSources
        ? { collected: options.collectedSources, failures: [] }
        : await collectCardSourceBundle(card.id);
    const primarySource = bundle.collected.find(source => (
        source.definition.candidateRole === 'PRIMARY'
    ));
    if (!primarySource) {
        throw new CardBenefitIngestionError(400, '허용된 대표 카드 공식 출처가 없습니다.');
    }
    const storedSources = bundle.collected.map(source => storeCollectedSource(card.id, source));
    const primaryStored = storedSources.find(source => source.collected === primarySource)!;
    const baseRevision = activeRevisionNumber(card.id);
    const sourceBundleHash = createOfficialSourceBundleHash([
        ...storedSources.map(source => ({
            sourceUrl: source.document.sourceUrl,
            contentHash: source.document.contentHash,
        })),
        ...bundle.failures.map(failure => ({
            sourceUrl: failure.sourceUrl,
            contentHash: '__COLLECTION_FAILED__',
        })),
    ]);
    const publishedSnapshot = currentSnapshot(card.id);
    const pendingBaselineCandidate = db.select().from(cardBenefitCandidates)
        .where(and(
            eq(cardBenefitCandidates.cardId, card.id),
            eq(cardBenefitCandidates.sourceBundleHash, sourceBundleHash),
            eq(cardBenefitCandidates.schemaVersion, CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION),
            eq(cardBenefitCandidates.baseRevision, baseRevision),
            eq(cardBenefitCandidates.status, 'PENDING'),
        ))
        .orderBy(desc(cardBenefitCandidates.createdAt))
        .get();
    const input: CardBenefitExtractionInput = {
        card,
        sourceUrl: primaryStored.document.sourceUrl,
        sourceText: primaryStored.document.extractedText,
        sources: storedSources.map(source => ({
            sourceUrl: source.document.sourceUrl,
            sourceText: source.document.extractedText,
            mediaType: source.document.mediaType,
            ...(source.document.mediaType === 'application/pdf' && {
                pageTexts: source.collected.pageTexts ?? splitPdfPages(source.document.extractedText),
            }),
        })),
        catalog: currentExtractionCatalog(),
        baselineRules: pendingBaselineCandidate?.extraction.rules ?? publishedSnapshot.rules,
    };
    const provider = options.provider ?? createCardBenefitExtractionProvider();
    if (!options.forceExtraction) {
        const sameSourceCandidates = db.select().from(cardBenefitCandidates)
            .where(and(
                eq(cardBenefitCandidates.cardId, card.id),
                eq(cardBenefitCandidates.schemaVersion, CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION),
            ))
            .orderBy(desc(cardBenefitCandidates.createdAt))
            .all()
            .filter(candidate => (
                candidate.sourceBundleHash === sourceBundleHash ||
                candidateDocumentsSemanticallyMatch(candidate, storedSources)
            ));
        let repairCandidate = sameSourceCandidates.find(candidate => (
            candidate.status === 'PENDING' && candidate.baseRevision === baseRevision
        ));
        if (!repairCandidate && !provider && sameSourceCandidates.length === 0) {
            repairCandidate = db.select().from(cardBenefitCandidates)
                .where(and(
                    eq(cardBenefitCandidates.cardId, card.id),
                    eq(cardBenefitCandidates.schemaVersion, CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION),
                    eq(cardBenefitCandidates.baseRevision, baseRevision),
                    eq(cardBenefitCandidates.status, 'PENDING'),
                ))
                .orderBy(desc(cardBenefitCandidates.createdAt))
                .get();
        }
        const reusableCandidate = repairCandidate?.validationErrors.length
            ? undefined
            : sameSourceCandidates.find(candidate => (
                candidate.validationErrors.length === 0 &&
                isReusableCardBenefitCandidate(
                    candidate.status,
                    candidate.baseRevision,
                    baseRevision,
                )
            ));
        if (reusableCandidate) {
            const cachedExtraction = applyOfficialNoticeDates(
                normalizeEvidenceBackedCardBenefitExtraction(
                    reusableCandidate.extraction,
                    input,
                ),
                noticeDocumentsFrom(storedSources.map(source => source.document)),
            );
            const cachedValidation = validateCardBenefitExtraction(
                cachedExtraction,
                input,
                currentReferences(),
            );
            const cachedAudit = createCardBenefitCandidateAudit({
                extraction: cachedExtraction,
                baseline: publishedSnapshot,
                baselineRevision: baseRevision,
                noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
            });
            const cachedErrors = [...new Set([
                ...cachedValidation.errors,
                ...cachedAudit.blockingErrors,
                ...bundle.failures.map(failure => (
                    `공식 보조 출처를 수집하지 못했습니다: ${failure.label} (${failure.message})`
                )),
            ])];
            if (cachedErrors.length === 0) {
                const wasLocallyRepaired = reusableCandidate.status === 'PENDING' &&
                    JSON.stringify(cachedExtraction) !== JSON.stringify(reusableCandidate.extraction);
                const cachedCandidate = wasLocallyRepaired
                    ? db.update(cardBenefitCandidates)
                        .set({ extraction: cachedExtraction, audit: cachedAudit })
                        .where(eq(cardBenefitCandidates.id, reusableCandidate.id))
                        .returning()
                        .get()
                    : reusableCandidate;
                if (cachedCandidate.status === 'PENDING') {
                    db.update(cardBenefitCandidates)
                        .set({ status: 'REJECTED', reviewedAt: new Date() })
                        .where(and(
                            eq(cardBenefitCandidates.cardId, card.id),
                            eq(cardBenefitCandidates.status, 'PENDING'),
                            notInArray(cardBenefitCandidates.id, [cachedCandidate.id]),
                        ))
                        .run();
                }
                return toCollectionResult(
                    'unchanged',
                    storedSources,
                    cachedCandidate,
                    bundle.failures,
                    { cacheHit: true, localRepair: wasLocallyRepaired },
                );
            }
        }
        if (repairCandidate) {
            const repairedExtraction = applyOfficialNoticeDates(
                normalizeEvidenceBackedCardBenefitExtraction(
                    repairCandidate.extraction,
                    input,
                ),
                noticeDocumentsFrom(storedSources.map(source => source.document)),
            );
            const repairedValidation = validateCardBenefitExtraction(
                repairedExtraction,
                input,
                currentReferences(),
            );
            const repairedAudit = createCardBenefitCandidateAudit({
                extraction: repairedExtraction,
                baseline: publishedSnapshot,
                baselineRevision: baseRevision,
                noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
            });
            const recomputedErrors = new Set([
                ...repairedValidation.errors,
                ...repairedAudit.blockingErrors,
            ]);
            const retainedStoredErrors = retainUnresolvedProviderErrors(
                repairCandidate.validationErrors,
                repairedExtraction,
                recomputedErrors,
            );
            const repairedErrors = [...new Set([
                ...retainedStoredErrors,
                ...repairedValidation.errors,
                ...repairedAudit.blockingErrors,
                ...bundle.failures.map(failure => (
                    `공식 보조 출처를 수집하지 못했습니다: ${failure.label} (${failure.message})`
                )),
            ])];
            const updatedCandidate = db.transaction(tx => {
                if (repairedErrors.length === 0) {
                    tx.update(cardBenefitCandidates)
                        .set({ status: 'REJECTED', reviewedAt: new Date() })
                        .where(and(
                            eq(cardBenefitCandidates.cardId, card.id),
                            eq(cardBenefitCandidates.status, 'PENDING'),
                            notInArray(cardBenefitCandidates.id, [repairCandidate.id]),
                        ))
                        .run();
                }
                tx.delete(cardBenefitCandidateDocuments)
                    .where(eq(cardBenefitCandidateDocuments.candidateId, repairCandidate.id))
                    .run();
                tx.insert(cardBenefitCandidateDocuments).values(storedSources.map(source => ({
                    candidateId: repairCandidate.id,
                    documentId: source.document.id,
                    role: source.collected.definition.candidateRole,
                }))).run();
                return tx.update(cardBenefitCandidates)
                    .set({
                        documentId: primaryStored.document.id,
                        sourceBundleHash,
                        extraction: repairedExtraction,
                        audit: repairedAudit,
                        validationErrors: repairedErrors,
                    })
                    .where(eq(cardBenefitCandidates.id, repairCandidate.id))
                    .returning()
                    .get();
            });
            if (repairedErrors.length === 0 || !provider) {
                return toCollectionResult(
                    'unchanged',
                    storedSources,
                    updatedCandidate,
                    bundle.failures,
                    { cacheHit: true, localRepair: true },
                );
            }
        }
    }
    if (!provider && card.id !== 'shinhan_sol') {
        throw new CardBenefitIngestionError(
            503,
            'OPENAI_API_KEY가 없어 이 카드의 AI 우선 혜택 구조화를 실행할 수 없습니다.',
        );
    }
    let extractionResult;
    try {
        extractionResult = provider
            ? await provider.extract(input)
            : extractShinhanSolTravelWithRules(input);
    } catch (error) {
        if (error instanceof CardBenefitExtractionBudgetError) {
            throw new CardBenefitIngestionError(429, error.message);
        }
        if (card.id !== 'shinhan_sol') {
            throw new CardBenefitIngestionError(
                502,
                `AI 카드 혜택 구조화에 실패했습니다: ${error instanceof Error
                    ? error.message.slice(0, 500)
                    : '알 수 없는 오류'}`,
            );
        }
        extractionResult = extractShinhanSolTravelWithRules(input);
        extractionResult.extraction.notes.push(
            `AI 구조화 실패 후 규칙 추출기로 전환: ${error instanceof Error
                ? error.message.slice(0, 300)
                : '알 수 없는 오류'}`
        );
    }
    extractionResult.extraction = applyOfficialNoticeDates(
        extractionResult.extraction,
        noticeDocumentsFrom(storedSources.map(source => source.document)),
    );
    const existingCandidate = db.select().from(cardBenefitCandidates)
        .where(and(
            eq(cardBenefitCandidates.cardId, card.id),
            eq(cardBenefitCandidates.sourceBundleHash, sourceBundleHash),
            eq(cardBenefitCandidates.extractor, extractionResult.extractor),
            eq(cardBenefitCandidates.schemaVersion, CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION),
            eq(cardBenefitCandidates.baseRevision, baseRevision),
        ))
        .get();
    if (existingCandidate) {
        if (existingCandidate.status !== 'PENDING') {
            return toCollectionResult('unchanged', storedSources, existingCandidate, bundle.failures);
        }
        const existingValidation = validateCardBenefitExtraction(
            extractionResult.extraction,
            input,
            currentReferences(),
        );
        const existingAudit = createCardBenefitCandidateAudit({
            extraction: extractionResult.extraction,
            baseline: publishedSnapshot,
            baselineRevision: baseRevision,
            noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
        });
        const existingRecomputedErrors = new Set([
            ...existingValidation.errors,
            ...existingAudit.blockingErrors,
        ]);
        const existingValidationErrors = [...new Set([
            ...retainUnresolvedProviderErrors(
                extractionResult.validationErrors ?? [],
                extractionResult.extraction,
                existingRecomputedErrors,
            ),
            ...existingRecomputedErrors,
            ...bundle.failures.map(failure => (
                `공식 보조 출처를 수집하지 못했습니다: ${failure.label} (${failure.message})`
            )),
        ])];
        if (!shouldReplacePendingCardBenefitCandidate(
            existingCandidate.validationErrors.length,
            existingValidationErrors.length,
        )) {
            return toCollectionResult(
                'unchanged',
                storedSources,
                existingCandidate,
                bundle.failures,
                {
                    validationErrors: existingValidationErrors,
                    candidatePreserved: true,
                },
            );
        }
        const updatedCandidate = db.update(cardBenefitCandidates)
            .set({
                documentId: primaryStored.document.id,
                model: extractionResult.model ?? null,
                confidence: extractionResult.confidence,
                extraction: extractionResult.extraction,
                audit: existingAudit,
                validationErrors: existingValidationErrors,
            })
            .where(eq(cardBenefitCandidates.id, existingCandidate.id))
            .returning()
            .get();
        return toCollectionResult('unchanged', storedSources, updatedCandidate, bundle.failures);
    }
    const validation = validateCardBenefitExtraction(
        extractionResult.extraction,
        input,
        currentReferences(),
    );
    const audit = createCardBenefitCandidateAudit({
        extraction: extractionResult.extraction,
        baseline: publishedSnapshot,
        baselineRevision: baseRevision,
        noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
    });
    const recomputedErrors = new Set([
        ...validation.errors,
        ...audit.blockingErrors,
    ]);
    const validationErrors = [...new Set([
        ...retainUnresolvedProviderErrors(
            extractionResult.validationErrors ?? [],
            extractionResult.extraction,
            recomputedErrors,
        ),
        ...recomputedErrors,
        ...bundle.failures.map(failure => (
            `공식 보조 출처를 수집하지 못했습니다: ${failure.label} (${failure.message})`
        )),
    ])];
    const now = new Date();
    const candidate = db.transaction(tx => {
        if (validationErrors.length === 0) {
            tx.update(cardBenefitCandidates)
                .set({ status: 'REJECTED', reviewedAt: now })
                .where(and(
                    eq(cardBenefitCandidates.cardId, card.id),
                    eq(cardBenefitCandidates.status, 'PENDING'),
                ))
                .run();
        }
        const inserted = tx.insert(cardBenefitCandidates).values({
            id: randomUUID(),
            documentId: primaryStored.document.id,
            cardId: card.id,
            schemaVersion: CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
            baseRevision,
            sourceBundleHash,
            extractor: extractionResult.extractor,
            model: extractionResult.model ?? null,
            confidence: extractionResult.confidence,
            extraction: extractionResult.extraction,
            audit,
            validationErrors,
            status: 'PENDING',
            createdAt: now,
        }).returning().get();
        tx.insert(cardBenefitCandidateDocuments).values(storedSources.map(source => ({
            candidateId: inserted.id,
            documentId: source.document.id,
            role: source.collected.definition.candidateRole,
        }))).run();
        return inserted;
    });
    return toCollectionResult('created', storedSources, candidate, bundle.failures);
}

export const collectShinhanSolTravelBenefits = (options: {
    provider?: CardBenefitExtractionProvider;
    collectedSources?: CollectedOfficialDocument[];
} = {}) => collectSystemCardBenefits('shinhan_sol', options);

function getCandidateDocuments(candidate: typeof cardBenefitCandidates.$inferSelect) {
    const relations = db.select().from(cardBenefitCandidateDocuments)
        .where(eq(cardBenefitCandidateDocuments.candidateId, candidate.id))
        .all();
    const relationByDocumentId = new Map(relations.map(relation => [
        relation.documentId,
        relation.role,
    ]));
    const documentIds = relations.length > 0
        ? new Set(relations.map(relation => relation.documentId))
        : new Set([candidate.documentId]);
    return db.select().from(cardBenefitDocuments)
        .where(eq(cardBenefitDocuments.cardId, candidate.cardId))
        .all()
        .filter(document => documentIds.has(document.id))
        .map(document => ({
            document,
            role: relationByDocumentId.get(document.id) ?? (
                document.id === candidate.documentId ? 'PRIMARY' as const : 'SUPPORTING' as const
            ),
        }));
}

function candidateDocumentsSemanticallyMatch(
    candidate: typeof cardBenefitCandidates.$inferSelect,
    storedSources: Array<ReturnType<typeof storeCollectedSource>>,
) {
    const candidateDocuments = getCandidateDocuments(candidate);
    if (candidateDocuments.length !== storedSources.length) return false;
    return storedSources.every(stored => {
        const matchingDocument = candidateDocuments.find(item => (
            item.document.sourceUrl === stored.document.sourceUrl &&
            item.role === stored.collected.definition.candidateRole
        ));
        return Boolean(matchingDocument) &&
            createOfficialDocumentSemanticHash(matchingDocument!.document.extractedText) ===
            createOfficialDocumentSemanticHash(stored.document.extractedText);
    });
}

const createExtractionInputFromDocuments = (
    card: ReturnType<typeof toCard>,
    candidate: typeof cardBenefitCandidates.$inferSelect,
    documents: ReturnType<typeof getCandidateDocuments>,
): CardBenefitExtractionInput => {
    const primary = documents.find(item => item.document.id === candidate.documentId) ??
        documents.find(item => item.role === 'PRIMARY');
    if (!primary) throw new CardBenefitIngestionError(409, '후보의 대표 공식 문서가 없습니다.');
    return {
        card,
        sourceUrl: primary.document.sourceUrl,
        sourceText: primary.document.extractedText,
        catalog: currentExtractionCatalog(),
        sources: documents.map(item => ({
            sourceUrl: item.document.sourceUrl,
            sourceText: item.document.extractedText,
            mediaType: item.document.mediaType,
            ...(item.document.mediaType === 'application/pdf' && {
                pageTexts: splitPdfPages(item.document.extractedText),
            }),
        })),
    };
};

const currentSnapshot = (cardId: string): CardBenefitRevisionSnapshot => {
    const cardRow = db.select().from(cards).where(eq(cards.id, cardId)).get();
    if (!cardRow) throw new CardBenefitIngestionError(404, '카드를 찾을 수 없습니다.');
    return {
        card: toCard(cardRow),
        rules: db.select().from(benefitRules)
            .where(and(eq(benefitRules.cardId, cardId), isNull(benefitRules.userId)))
            .all()
            .map(toRule),
    };
};

const applySnapshot = (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    snapshot: CardBenefitRevisionSnapshot,
) => {
    tx.update(cards)
        .set({
            name: snapshot.card.name,
            company: snapshot.card.company,
            limitTable: snapshot.card.limitTable,
            network: snapshot.card.network ?? null,
            performancePolicy: snapshot.card.performancePolicy ?? null,
        })
        .where(eq(cards.id, snapshot.card.id))
        .run();
    snapshot.rules.forEach(ruleRow => {
        const values = {
            cardId: snapshot.card.id,
            userId: null,
            category: ruleRow.category ?? null,
            includedBrands: ruleRow.includedBrands ?? [],
            excludedBrands: ruleRow.excludedBrands ?? [],
            platformType: ruleRow.platformType ?? 'ALL' as const,
            sharedGroupId: ruleRow.sharedGroupId ?? null,
            usesCardLimit: ruleRow.usesCardLimit ?? true,
            description: ruleRow.description,
            detail: ruleRow.detail,
            condition: ruleRow.condition,
            action: ruleRow.action,
            limitConfig: ruleRow.limitConfig,
            programVersion: ruleRow.program?.languageVersion ?? null,
            program: ruleRow.program ?? null,
        };
        tx.insert(benefitRules)
            .values({ id: ruleRow.id, ...values })
            .onConflictDoUpdate({ target: benefitRules.id, set: values })
            .run();
    });
    const ruleIds = snapshot.rules.map(ruleRow => ruleRow.id);
    if (ruleIds.length > 0) {
        tx.delete(benefitRules)
            .where(and(
                eq(benefitRules.cardId, snapshot.card.id),
                isNull(benefitRules.userId),
                notInArray(benefitRules.id, ruleIds),
            ))
            .run();
    } else {
        tx.delete(benefitRules)
            .where(and(
                eq(benefitRules.cardId, snapshot.card.id),
                isNull(benefitRules.userId),
            ))
            .run();
    }
};

export function reviewCardBenefitCandidate(
    candidateId: string,
    status: Exclude<CardBenefitCandidateStatus, 'PENDING'>,
    reviewerId: string,
) {
    const candidate = db.select().from(cardBenefitCandidates)
        .where(eq(cardBenefitCandidates.id, candidateId))
        .get();
    if (!candidate) throw new CardBenefitIngestionError(404, '카드 혜택 후보를 찾을 수 없습니다.');
    if (candidate.status !== 'PENDING') {
        throw new CardBenefitIngestionError(409, '이미 검수된 카드 혜택 후보입니다.');
    }
    const now = new Date();
    if (status === 'REJECTED') {
        return db.update(cardBenefitCandidates)
            .set({ status, reviewerId, reviewedAt: now })
            .where(eq(cardBenefitCandidates.id, candidate.id))
            .returning()
            .get();
    }
    const currentBaseRevision = activeRevisionNumber(candidate.cardId);
    if (candidate.baseRevision !== currentBaseRevision) {
        throw new CardBenefitIngestionError(
            409,
            '후보 생성 후 게시 revision이 변경되었습니다. 공식 출처를 다시 수집해주세요.',
        );
    }
    const cardRow = db.select().from(cards).where(eq(cards.id, candidate.cardId)).get();
    const documents = getCandidateDocuments(candidate);
    const document = documents.find(item => item.document.id === candidate.documentId)?.document;
    if (!document || !cardRow || documents.length === 0) {
        throw new CardBenefitIngestionError(409, '후보의 카드 또는 공식 문서가 없습니다.');
    }
    for (const item of documents) {
        const latestDocument = db.select().from(cardBenefitDocuments)
            .where(and(
                eq(cardBenefitDocuments.cardId, candidate.cardId),
                eq(cardBenefitDocuments.sourceUrl, item.document.sourceUrl),
            ))
            .orderBy(desc(cardBenefitDocuments.version))
            .get();
        if (latestDocument && latestDocument.version > item.document.version &&
            createOfficialDocumentSemanticHash(latestDocument.extractedText) !==
            createOfficialDocumentSemanticHash(item.document.extractedText)) {
            throw new CardBenefitIngestionError(409, '더 최신 공식 문서 묶음 후보를 먼저 검수해야 합니다.');
        }
    }
    const extractionInput = createExtractionInputFromDocuments(
        toCard(cardRow),
        candidate,
        documents,
    );
    const validation = validateCardBenefitExtraction(
        candidate.extraction,
        extractionInput,
        currentReferences(),
    );
    const audit = createCardBenefitCandidateAudit({
        extraction: candidate.extraction,
        baseline: currentSnapshot(candidate.cardId),
        baselineRevision: currentBaseRevision,
        noticeDocuments: noticeDocumentsFrom(documents.map(item => item.document)),
    });
    if (candidate.validationErrors.length > 0 || validation.errors.length > 0 ||
        audit.blockingErrors.length > 0 ||
        !validation.extraction) {
        throw new CardBenefitIngestionError(400, '검증 오류가 있는 카드 혜택 후보는 승인할 수 없습니다.');
    }
    const before = currentSnapshot(candidate.cardId);
    const publishedSnapshot: CardBenefitRevisionSnapshot = {
        card: {
            ...before.card,
            name: validation.extraction.card.name,
            company: validation.extraction.card.company,
            limitTable: validation.extraction.card.limitTable,
            network: validation.extraction.card.network,
            performancePolicy: validation.extraction.card.performancePolicy ?? before.card.performancePolicy,
        },
        rules: validation.extraction.rules.map(ruleRow => ({
            ...ruleRow,
            cardId: candidate.cardId,
        })),
    };
    let revision = 0;
    db.transaction(tx => {
        const revisions = tx.select().from(cardBenefitRevisions)
            .where(eq(cardBenefitRevisions.cardId, candidate.cardId))
            .orderBy(desc(cardBenefitRevisions.revision))
            .all();
        revision = (revisions[0]?.revision ?? 0) + 1;
        if (revisions.length === 0) {
            tx.insert(cardBenefitRevisions).values({
                id: randomUUID(),
                cardId: candidate.cardId,
                revision,
                snapshot: before,
                isActive: false,
                reviewerId,
                publishedAt: now,
            }).run();
            revision += 1;
        }
        tx.update(cardBenefitRevisions)
            .set({ isActive: false })
            .where(eq(cardBenefitRevisions.cardId, candidate.cardId))
            .run();
        applySnapshot(tx, publishedSnapshot);
        tx.insert(cardBenefitRevisions).values({
            id: randomUUID(),
            cardId: candidate.cardId,
            revision,
            candidateId: candidate.id,
            documentId: document.id,
            snapshot: publishedSnapshot,
            isActive: true,
            reviewerId,
            publishedAt: now,
        }).run();
        tx.update(cardBenefitCandidates)
            .set({ status: 'APPROVED', reviewerId, reviewedAt: now })
            .where(eq(cardBenefitCandidates.id, candidate.id))
            .run();
        tx.update(cards)
            .set({ catalogStatus: 'PUBLISHED' })
            .where(and(eq(cards.id, candidate.cardId), isNull(cards.userId)))
            .run();
    });
    return db.select().from(cardBenefitRevisions)
        .where(and(
            eq(cardBenefitRevisions.cardId, candidate.cardId),
            eq(cardBenefitRevisions.revision, revision),
        ))
        .get();
}

export function rollbackCardBenefitRevision(
    cardId: string,
    targetRevision: number,
    reviewerId: string,
) {
    const target = db.select().from(cardBenefitRevisions)
        .where(and(
            eq(cardBenefitRevisions.cardId, cardId),
            eq(cardBenefitRevisions.revision, targetRevision),
        ))
        .get();
    if (!target) {
        throw new CardBenefitIngestionError(404, '되돌릴 카드 혜택 revision을 찾을 수 없습니다.');
    }
    if (target.isActive) throw new CardBenefitIngestionError(409, '이미 활성화된 revision입니다.');
    const latest = db.select().from(cardBenefitRevisions)
        .where(eq(cardBenefitRevisions.cardId, cardId))
        .orderBy(desc(cardBenefitRevisions.revision))
        .get();
    const revision = (latest?.revision ?? 0) + 1;
    const now = new Date();
    db.transaction(tx => {
        tx.update(cardBenefitRevisions)
            .set({ isActive: false })
            .where(eq(cardBenefitRevisions.cardId, cardId))
            .run();
        applySnapshot(tx, target.snapshot);
        tx.insert(cardBenefitRevisions).values({
            id: randomUUID(),
            cardId,
            revision,
            candidateId: target.candidateId,
            documentId: target.documentId,
            snapshot: target.snapshot,
            rollbackOfRevision: targetRevision,
            isActive: true,
            reviewerId,
            publishedAt: now,
        }).run();
    });
    return db.select().from(cardBenefitRevisions)
        .where(and(
            eq(cardBenefitRevisions.cardId, cardId),
            eq(cardBenefitRevisions.revision, revision),
        ))
        .get();
}

export function getCardBenefitReviewData() {
    const documents = db.select().from(cardBenefitDocuments)
        .orderBy(desc(cardBenefitDocuments.collectedAt))
        .all();
    const documentById = new Map(documents.map(document => [document.id, document]));
    const candidateDocuments = db.select().from(cardBenefitCandidateDocuments).all();
    const candidateDocumentIds = new Map<string, Array<{
        documentId: string;
        role: 'PRIMARY' | 'SUPPORTING';
    }>>();
    candidateDocuments.forEach(relation => {
        const current = candidateDocumentIds.get(relation.candidateId) ?? [];
        current.push({ documentId: relation.documentId, role: relation.role });
        candidateDocumentIds.set(relation.candidateId, current);
    });
    const collectionRuns = db.select().from(cardBenefitCollectionRuns)
        .orderBy(desc(cardBenefitCollectionRuns.finishedAt))
        .limit(20)
        .all();
    return {
        collectionTargets: getManagedSystemCardBenefitSourceInventory()
            .filter(item => item.revisionReviewEnabled)
            .map(item => {
                const card = db.select({ id: cards.id, name: cards.name })
                    .from(cards)
                    .where(and(eq(cards.id, item.cardId), isNull(cards.userId)))
                    .get();
                return card ? {
                    cardId: card.id,
                    cardName: card.name,
                    sourceCount: item.sources.length,
                    lastCheckedAt: documents.find(document => (
                        document.cardId === card.id
                    ))?.collectedAt.toISOString(),
                    activeRevision: db.select({
                        revision: cardBenefitRevisions.revision,
                    }).from(cardBenefitRevisions)
                        .where(and(
                            eq(cardBenefitRevisions.cardId, card.id),
                            eq(cardBenefitRevisions.isActive, true),
                        ))
                        .get()?.revision,
                } : undefined;
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item)),
        collectionRuns: collectionRuns.map(run => ({
            id: run.id,
            status: run.status,
            trigger: run.trigger,
            startedAt: run.startedAt.toISOString(),
            finishedAt: run.finishedAt.toISOString(),
            maxAiCards: run.maxAiCards,
            totals: {
                targets: run.targetCount,
                created: run.createdCount,
                unchanged: run.unchangedCount,
                deferred: run.deferredCount,
                failed: run.failedCount,
                cacheHits: run.cacheHitCount,
                aiExtractions: run.aiExtractionCount,
                validationErrors: run.validationErrorCount,
                sourceFailures: run.sourceFailureCount,
            },
            items: run.items,
        })),
        candidates: db.select().from(cardBenefitCandidates)
            .orderBy(desc(cardBenefitCandidates.createdAt))
            .all()
            .map(candidate => {
                const document = documentById.get(candidate.documentId);
                const currentBaseRevision = activeRevisionNumber(candidate.cardId);
                const staleError = candidate.status === 'PENDING' &&
                    candidate.baseRevision !== currentBaseRevision
                    ? ['후보 생성 후 게시 revision이 변경되었습니다. 공식 출처를 다시 수집해주세요.']
                    : [];
                const relations = candidateDocumentIds.get(candidate.id) ?? [{
                    documentId: candidate.documentId,
                    role: 'PRIMARY' as const,
                }];
                const sourceDocuments = relations.flatMap(relation => {
                    const source = documentById.get(relation.documentId);
                    return source ? [{ source, role: relation.role }] : [];
                });
                const audit = candidate.status === 'PENDING'
                    ? createCardBenefitCandidateAudit({
                        extraction: candidate.extraction,
                        baseline: currentSnapshot(candidate.cardId),
                        baselineRevision: currentBaseRevision,
                        noticeDocuments: noticeDocumentsFrom(
                            sourceDocuments.map(item => item.source)
                        ),
                    })
                    : candidate.audit ?? createCardBenefitCandidateAudit({
                        extraction: candidate.extraction,
                        baseline: currentSnapshot(candidate.cardId),
                        baselineRevision: currentBaseRevision,
                        noticeDocuments: noticeDocumentsFrom(
                            sourceDocuments.map(item => item.source)
                        ),
                    });
                return {
                    ...candidate,
                    validationErrors: [...new Set([
                        ...candidate.validationErrors,
                        ...staleError,
                        ...audit.blockingErrors,
                    ])],
                    audit,
                    sourceUrl: document?.sourceUrl ?? '',
                    documentVersion: document?.version ?? 0,
                    contentHash: document?.contentHash ?? '',
                    collectedAt: document?.collectedAt.toISOString(),
                    sources: sourceDocuments.map(({ source, role }) => ({
                            documentId: source.id,
                            role,
                            sourceUrl: source.sourceUrl,
                            sourceKind: source.sourceKind,
                            mediaType: source.mediaType,
                            version: source.version,
                            contentHash: source.contentHash,
                            pageCount: source.responseMetadata.pageCount,
                            noticeDates: source.responseMetadata.noticeDates,
                            collectedAt: source.collectedAt.toISOString(),
                    })),
                    createdAt: candidate.createdAt.toISOString(),
                    reviewedAt: candidate.reviewedAt?.toISOString(),
                };
            }),
        revisions: db.select().from(cardBenefitRevisions)
            .orderBy(desc(cardBenefitRevisions.publishedAt))
            .all()
            .map(revision => ({
                ...revision,
                publishedAt: revision.publishedAt.toISOString(),
            })),
    };
}
