import { handleRouteError, readJsonObject } from '@/lib/api-server';
import { handoverContext, noStore, withCatalogSync } from '@/lib/catalog-sync-server';
import { startPromotionHandover } from '@/lib/promotion-handover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
    try {
        const result = await withCatalogSync(request, async () => startPromotionHandover(
            handoverContext(),
            await readJsonObject(request, MAX_MANIFEST_BYTES),
        ));
        return Response.json(result, { status: 201, headers: noStore });
    } catch (error) {
        return handleRouteError(error);
    }
}
