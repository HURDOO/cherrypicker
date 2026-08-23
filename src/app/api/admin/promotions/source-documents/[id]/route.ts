import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { promotionSourceDocuments } from '@/db/schema';
import { handleRouteError, HttpError, requireAdmin } from '@/lib/api-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
    try {
        await requireAdmin(request);
        const { id } = await context.params;
        const document = db.select().from(promotionSourceDocuments)
            .where(eq(promotionSourceDocuments.id, id))
            .get();
        if (!document) throw new HttpError(404, '보존된 프로모션 원문을 찾을 수 없습니다.');

        return Response.json({
            id: document.id,
            collectionSourceId: document.collectionSourceId,
            sourceUrl: document.sourceUrl,
            mediaType: document.mediaType,
            contentHash: document.contentHash,
            version: document.version,
            responseMetadata: document.responseMetadata,
            collectedAt: document.collectedAt.toISOString(),
            rawContent: document.rawContent,
            extractedText: document.extractedText,
        }, {
            headers: {
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch (error) {
        return handleRouteError(error);
    }
}
