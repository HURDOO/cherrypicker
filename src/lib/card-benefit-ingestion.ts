import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cardBenefitCandidates,
    cardBenefitCandidateDocuments,
    cardBenefitDocuments,
    cardBenefitRevisions,
    cards,
    categories,
} from '@/db/schema';
import type {
    CardBenefitCandidateStatus,
    CardBenefitDocumentMetadata,
    CardBenefitNoticeDates,
    CardBenefitRevisionSnapshot,
} from '@/types';
import {
    CARD_BENEFIT_EXTRACTION_SCHEMA_VERSION,
    createCardBenefitExtractionProvider,
    extractShinhanSolTravelWithRules,
    type CardBenefitExtractionInput,
    type CardBenefitExtractionProvider,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { createCardBenefitCandidateAudit } from './card-benefit-audit';
import {
    getShinhanSolTravelSources,
    SHINHAN_SOL_TRAVEL_SOURCE_URL,
} from './card-benefit-source-registry';
import { toCard, toRule } from './db-mappers';
import {
    collectOfficialDocument,
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

const collectShinhanSourceBundle = async () => {
    const configured = getShinhanSolTravelSources();
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
            .set({ responseMetadata: collected.responseMetadata })
            .where(eq(cardBenefitDocuments.id, existingDocument.id))
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
    validationErrors: candidate.validationErrors,
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

export async function collectShinhanSolTravelBenefits(options: {
    provider?: CardBenefitExtractionProvider;
    collectedSources?: CollectedOfficialDocument[];
} = {}): Promise<CardBenefitCollectionResult> {
    const cardRow = db.select().from(cards)
        .where(and(eq(cards.id, 'shinhan_sol'), isNull(cards.userId)))
        .get();
    if (!cardRow) throw new CardBenefitIngestionError(404, '대표 카드 신한 SOL트래블 체크카드를 찾을 수 없습니다.');
    const card = toCard(cardRow);
    const bundle = options.collectedSources
        ? { collected: options.collectedSources, failures: [] }
        : await collectShinhanSourceBundle();
    const primarySource = bundle.collected.find(source => (
        source.definition.candidateRole === 'PRIMARY' &&
        source.sourceUrl === SHINHAN_SOL_TRAVEL_SOURCE_URL
    ));
    if (!primarySource) {
        throw new CardBenefitIngestionError(400, '허용된 대표 카드 공식 출처가 아닙니다.');
    }
    const storedSources = bundle.collected.map(source => storeCollectedSource(card.id, source));
    const primaryStored = storedSources.find(source => source.collected === primarySource)!;
    const baseRevision = activeRevisionNumber(card.id);
    const sourceBundleHash = createOfficialSourceBundleHash([
        ...bundle.collected,
        ...bundle.failures.map(failure => ({
            sourceUrl: failure.sourceUrl,
            contentHash: '__COLLECTION_FAILED__',
        })),
    ]);
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
    };
    const provider = options.provider ?? createCardBenefitExtractionProvider();
    let extractionResult;
    try {
        extractionResult = provider
            ? await provider.extract(input)
            : extractShinhanSolTravelWithRules(input);
    } catch (error) {
        extractionResult = extractShinhanSolTravelWithRules(input);
        extractionResult.extraction.notes.push(
            `AI 구조화 실패 후 규칙 추출기로 전환: ${error instanceof Error
                ? error.message.slice(0, 300)
                : '알 수 없는 오류'}`
        );
    }
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
        const existingValidation = validateCardBenefitExtraction(
            existingCandidate.extraction,
            input,
            currentReferences(),
        );
        const existingAudit = createCardBenefitCandidateAudit({
            extraction: existingCandidate.extraction,
            baseline: currentSnapshot(card.id),
            baselineRevision: baseRevision,
            noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
        });
        const existingValidationErrors = [...new Set([
            ...existingValidation.errors,
            ...existingAudit.blockingErrors,
            ...bundle.failures.map(failure => (
                `공식 보조 출처를 수집하지 못했습니다: ${failure.label} (${failure.message})`
            )),
        ])];
        const updatedCandidate = db.update(cardBenefitCandidates)
            .set({ audit: existingAudit, validationErrors: existingValidationErrors })
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
        baseline: currentSnapshot(card.id),
        baselineRevision: baseRevision,
        noticeDocuments: noticeDocumentsFrom(storedSources.map(source => source.document)),
    });
    const validationErrors = [...new Set([
        ...validation.errors,
        ...audit.blockingErrors,
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

const getCandidateDocuments = (candidate: typeof cardBenefitCandidates.$inferSelect) => {
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
};

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
        if (latestDocument && latestDocument.version > item.document.version) {
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
    return {
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
