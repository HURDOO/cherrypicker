import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import {
    benefitRules,
    brands,
    cardBenefitCandidates,
    cardBenefitDocuments,
    cardBenefitRevisions,
    cards,
    categories,
} from '@/db/schema';
import type {
    CardBenefitCandidateStatus,
    CardBenefitRevisionSnapshot,
} from '@/types';
import {
    createCardBenefitExtractionProvider,
    extractShinhanSolTravelWithRules,
    type CardBenefitExtractionInput,
    type CardBenefitExtractionProvider,
    validateCardBenefitExtraction,
} from './card-benefit-extraction';
import { decodePromotionHtml } from './html-decoding';
import { toCard, toRule } from './db-mappers';
import { htmlToText } from './promotion-parsers';

export class CardBenefitIngestionError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'CardBenefitIngestionError';
    }
}

export const SHINHAN_SOL_TRAVEL_SOURCE_URL =
    'https://www.shinhancard.com/pconts/html/card/apply/check/1225714_2206.html';

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const requestHeaders = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml',
    'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
};

type CollectedSource = {
    sourceUrl: string;
    mediaType: string;
    rawContent: string;
    extractedText: string;
    contentHash: string;
    responseMetadata: { etag?: string; lastModified?: string };
};

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
};

const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fetchOfficialHtml(sourceUrl: string): Promise<CollectedSource> {
    const response = await fetch(sourceUrl, {
        headers: requestHeaders,
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`카드 공식 문서 HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_SOURCE_BYTES) {
        throw new Error('카드 공식 문서가 허용 크기를 초과했습니다.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error('카드 공식 문서 크기가 올바르지 않습니다.');
    }
    const mediaType = response.headers.get('content-type') ?? 'text/html';
    if (!mediaType.toLowerCase().includes('html')) {
        throw new Error(`지원하지 않는 카드 공식 문서 형식입니다: ${mediaType}`);
    }
    const rawContent = decodePromotionHtml(bytes, mediaType);
    const extractedText = htmlToText(rawContent);
    if (extractedText.length < 100 || /Request Rejected|requested URL was rejected/i.test(extractedText)) {
        throw new Error('카드 공식 문서에서 충분한 텍스트를 추출하지 못했습니다.');
    }
    return {
        sourceUrl,
        mediaType: mediaType.slice(0, 200),
        rawContent,
        extractedText,
        contentHash: hashBytes(bytes),
        responseMetadata: {
            ...(response.headers.get('etag') && { etag: response.headers.get('etag')! }),
            ...(response.headers.get('last-modified') && {
                lastModified: response.headers.get('last-modified')!,
            }),
        },
    };
}

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

const toCollectionResult = (
    status: CardBenefitCollectionResult['status'],
    document: typeof cardBenefitDocuments.$inferSelect,
    candidate: typeof cardBenefitCandidates.$inferSelect,
): CardBenefitCollectionResult => ({
    status,
    documentId: document.id,
    candidateId: candidate.id,
    cardId: candidate.cardId,
    sourceUrl: document.sourceUrl,
    version: document.version,
    extractor: candidate.extractor,
    ...(candidate.model && { model: candidate.model }),
    confidence: candidate.confidence,
    validationErrors: candidate.validationErrors,
});

export async function collectShinhanSolTravelBenefits(options: {
    provider?: CardBenefitExtractionProvider;
    collectedSource?: CollectedSource;
} = {}): Promise<CardBenefitCollectionResult> {
    const cardRow = db.select().from(cards)
        .where(and(eq(cards.id, 'shinhan_sol'), isNull(cards.userId)))
        .get();
    if (!cardRow) throw new CardBenefitIngestionError(404, '대표 카드 신한 SOL트래블 체크카드를 찾을 수 없습니다.');
    const card = toCard(cardRow);
    const source = options.collectedSource ?? await fetchOfficialHtml(SHINHAN_SOL_TRAVEL_SOURCE_URL);
    if (source.sourceUrl !== SHINHAN_SOL_TRAVEL_SOURCE_URL) {
        throw new CardBenefitIngestionError(400, '허용된 대표 카드 공식 출처가 아닙니다.');
    }
    const existingDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, card.id),
            eq(cardBenefitDocuments.sourceUrl, source.sourceUrl),
            eq(cardBenefitDocuments.contentHash, source.contentHash),
        ))
        .get();
    const latestDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, card.id),
            eq(cardBenefitDocuments.sourceUrl, source.sourceUrl),
        ))
        .orderBy(desc(cardBenefitDocuments.version))
        .get();
    const document = existingDocument ?? db.insert(cardBenefitDocuments).values({
        id: randomUUID(),
        cardId: card.id,
        sourceUrl: source.sourceUrl,
        sourceKind: 'PRODUCT_PAGE',
        mediaType: source.mediaType,
        contentHash: source.contentHash,
        version: (latestDocument?.version ?? 0) + 1,
        rawContent: source.rawContent,
        extractedText: source.extractedText,
        responseMetadata: source.responseMetadata,
        collectedAt: new Date(),
    }).returning().get();

    const input: CardBenefitExtractionInput = {
        card,
        sourceUrl: document.sourceUrl,
        sourceText: document.extractedText,
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
            eq(cardBenefitCandidates.documentId, document.id),
            eq(cardBenefitCandidates.extractor, extractionResult.extractor),
            eq(cardBenefitCandidates.schemaVersion, 1),
        ))
        .get();
    if (existingCandidate) {
        return toCollectionResult('unchanged', document, existingCandidate);
    }
    const validation = validateCardBenefitExtraction(
        extractionResult.extraction,
        input,
        currentReferences(),
    );
    const now = new Date();
    const candidate = db.transaction(tx => {
        tx.update(cardBenefitCandidates)
            .set({ status: 'REJECTED', reviewedAt: now })
            .where(and(
                eq(cardBenefitCandidates.cardId, card.id),
                eq(cardBenefitCandidates.status, 'PENDING'),
            ))
            .run();
        return tx.insert(cardBenefitCandidates).values({
            id: randomUUID(),
            documentId: document.id,
            cardId: card.id,
            schemaVersion: 1,
            extractor: extractionResult.extractor,
            model: extractionResult.model ?? null,
            confidence: extractionResult.confidence,
            extraction: extractionResult.extraction,
            validationErrors: validation.errors,
            status: 'PENDING',
            createdAt: now,
        }).returning().get();
    });
    return toCollectionResult('created', document, candidate);
}

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
    const document = db.select().from(cardBenefitDocuments)
        .where(eq(cardBenefitDocuments.id, candidate.documentId))
        .get();
    const cardRow = db.select().from(cards).where(eq(cards.id, candidate.cardId)).get();
    if (!document || !cardRow) {
        throw new CardBenefitIngestionError(409, '후보의 카드 또는 공식 문서가 없습니다.');
    }
    const latestDocument = db.select().from(cardBenefitDocuments)
        .where(and(
            eq(cardBenefitDocuments.cardId, candidate.cardId),
            eq(cardBenefitDocuments.sourceUrl, document.sourceUrl),
        ))
        .orderBy(desc(cardBenefitDocuments.version))
        .get();
    if (latestDocument && latestDocument.version > document.version) {
        throw new CardBenefitIngestionError(409, '더 최신 공식 문서 후보를 먼저 검수해야 합니다.');
    }
    const validation = validateCardBenefitExtraction(
        candidate.extraction,
        {
            card: toCard(cardRow),
            sourceUrl: document.sourceUrl,
            sourceText: document.extractedText,
        },
        currentReferences(),
    );
    if (candidate.validationErrors.length > 0 || validation.errors.length > 0 ||
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
    return {
        candidates: db.select().from(cardBenefitCandidates)
            .orderBy(desc(cardBenefitCandidates.createdAt))
            .all()
            .map(candidate => {
                const document = documentById.get(candidate.documentId);
                return {
                    ...candidate,
                    sourceUrl: document?.sourceUrl ?? '',
                    documentVersion: document?.version ?? 0,
                    contentHash: document?.contentHash ?? '',
                    collectedAt: document?.collectedAt.toISOString(),
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
