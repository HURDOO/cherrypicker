import { databasePath } from '@/db';
import { handleRouteError, HttpError } from '@/lib/api-server';
import { noStore, readBinaryBody, withCatalogSync } from '@/lib/catalog-sync-server';
import { MAX_CHUNK_BYTES, storePromotionHandoverChunk } from '@/lib/promotion-handover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
    params: Promise<{ id: string; index: string }>;
}

export async function PUT(request: Request, context: RouteContext) {
    try {
        const { id, index } = await context.params;
        if (!/^\d{1,5}$/.test(index)) throw new HttpError(400, '조각 번호가 올바르지 않습니다.');
        if ((request.headers.get('content-type') || '') !== 'application/gzip') {
            throw new HttpError(415, 'Content-Type은 application/gzip이어야 합니다.');
        }
        const result = await withCatalogSync(request, async () => storePromotionHandoverChunk(
            { databasePath },
            id,
            Number(index),
            await readBinaryBody(request, MAX_CHUNK_BYTES),
        ));
        return Response.json(result, { headers: noStore });
    } catch (error) {
        return handleRouteError(error);
    }
}
