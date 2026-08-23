import { createHash, randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
    promotionSourceBundleDocuments,
    promotionSourceBundles,
    promotionSourceDocuments,
} from '@/db/schema';
import type { PromotionSourceDocumentMetadata } from '@/types';

export interface CollectedPromotionSourceDocument {
    sourceUrl: string;
    mediaType: string;
    rawContent: string;
    extractedText: string;
    contentHash: string;
    responseMetadata: PromotionSourceDocumentMetadata;
}

export interface PersistedPromotionSourceDocument extends CollectedPromotionSourceDocument {
    id: string;
    version: number;
    collectedAt: Date;
}

export interface PersistedPromotionSourceBundle {
    id: string;
    collectionSourceId: string;
    sourceBundleHash: string;
    documents: PersistedPromotionSourceDocument[];
}

export const createPromotionSourceBundleHash = (
    documents: Array<Pick<CollectedPromotionSourceDocument, 'sourceUrl' | 'contentHash'>>,
) => createHash('sha256')
    .update(documents
        .map(document => `${document.sourceUrl}\0${document.contentHash}`)
        .sort()
        .join('\n'))
    .digest('hex');

export function persistPromotionSourceBundle(
    collectionSourceId: string,
    documents: CollectedPromotionSourceDocument[],
    collectedAt: Date,
): PersistedPromotionSourceBundle {
    if (documents.length === 0) {
        throw new Error('프로모션 source bundle에 보존할 원문이 없습니다.');
    }
    const sourceBundleHash = createPromotionSourceBundleHash(documents);
    const persistedDocuments: PersistedPromotionSourceDocument[] = [];
    let bundleId = '';

    db.transaction(() => {
        documents.forEach(document => {
            const existing = db.select().from(promotionSourceDocuments)
                .where(and(
                    eq(promotionSourceDocuments.collectionSourceId, collectionSourceId),
                    eq(promotionSourceDocuments.sourceUrl, document.sourceUrl),
                    eq(promotionSourceDocuments.contentHash, document.contentHash),
                ))
                .get();
            if (existing) {
                persistedDocuments.push({
                    ...document,
                    id: existing.id,
                    version: existing.version,
                    collectedAt: existing.collectedAt,
                });
                return;
            }
            const latest = db.select({ version: promotionSourceDocuments.version })
                .from(promotionSourceDocuments)
                .where(and(
                    eq(promotionSourceDocuments.collectionSourceId, collectionSourceId),
                    eq(promotionSourceDocuments.sourceUrl, document.sourceUrl),
                ))
                .orderBy(desc(promotionSourceDocuments.version))
                .get();
            const row = db.insert(promotionSourceDocuments).values({
                id: randomUUID(),
                collectionSourceId,
                ...document,
                version: (latest?.version ?? 0) + 1,
                collectedAt,
            }).returning().get();
            persistedDocuments.push({
                ...document,
                id: row.id,
                version: row.version,
                collectedAt: row.collectedAt,
            });
        });

        const existingBundle = db.select().from(promotionSourceBundles)
            .where(and(
                eq(promotionSourceBundles.collectionSourceId, collectionSourceId),
                eq(promotionSourceBundles.sourceBundleHash, sourceBundleHash),
            ))
            .get();
        bundleId = existingBundle?.id ?? randomUUID();
        if (!existingBundle) {
            db.insert(promotionSourceBundles).values({
                id: bundleId,
                collectionSourceId,
                sourceBundleHash,
                collectedAt,
            }).run();
        }
        persistedDocuments.forEach(document => {
            db.insert(promotionSourceBundleDocuments).values({
                bundleId,
                documentId: document.id,
            }).onConflictDoNothing().run();
        });
    });

    return {
        id: bundleId,
        collectionSourceId,
        sourceBundleHash,
        documents: persistedDocuments,
    };
}
