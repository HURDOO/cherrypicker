import 'server-only';

import { databasePath, sqlite } from '@/db';
import { catalogReleasePublishedCardCount } from '@/lib/catalog-release';
import { assertCatalogSyncToken } from '@/lib/catalog-sync-auth';
import { readMigrationTag } from '@/lib/catalog-sync-common';
import { resolveSyncReviewerId } from '@/lib/catalog-sync-reviewer';
import { HttpError } from '@/lib/http-error';
import { productionPromotionState } from '@/lib/promotion-handover';

type SyncGlobal = typeof globalThis & { cherryPickerCatalogSyncBusy?: boolean };
const syncGlobal = globalThis as SyncGlobal;

/** One sync operation at a time; a second request gets 409 instead of waiting. */
export async function withCatalogSync<T>(request: Request, work: () => Promise<T> | T): Promise<T> {
    assertCatalogSyncToken(request);
    if (syncGlobal.cherryPickerCatalogSyncBusy) {
        throw new HttpError(409, '다른 동기화 작업이 진행 중입니다.');
    }
    syncGlobal.cherryPickerCatalogSyncBusy = true;
    try {
        return await work();
    } finally {
        syncGlobal.cherryPickerCatalogSyncBusy = false;
    }
}

export const handoverContext = () => ({
    client: sqlite,
    databasePath,
    reviewerId: resolveSyncReviewerId(),
});

export function catalogSyncStatus() {
    const promotions = productionPromotionState(sqlite, databasePath);
    return {
        migration: readMigrationTag(sqlite),
        publishedCards: catalogReleasePublishedCardCount(),
        reviewerReady: Boolean(resolveSyncReviewerId()),
        promotionHandover: {
            completed: Boolean(promotions.completed),
            empty: promotions.empty,
        },
    };
}

export async function readBinaryBody(request: Request, maximumBytes: number) {
    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maximumBytes) {
        throw new HttpError(413, '요청 본문이 너무 큽니다.');
    }
    if (!request.body) throw new HttpError(400, '요청 본문이 필요합니다.');
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximumBytes) {
            await reader.cancel();
            throw new HttpError(413, '요청 본문이 너무 큽니다.');
        }
        parts.push(value);
    }
    return Buffer.concat(parts);
}

export const noStore = { 'Cache-Control': 'no-store' };
