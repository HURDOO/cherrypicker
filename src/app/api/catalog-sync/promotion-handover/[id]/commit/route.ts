import { handleRouteError } from '@/lib/api-server';
import { handoverContext, noStore, withCatalogSync } from '@/lib/catalog-sync-server';
import { commitPromotionHandover } from '@/lib/promotion-handover';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
    try {
        const { id } = await context.params;
        const result = await withCatalogSync(
            request,
            () => commitPromotionHandover(handoverContext(), id),
        );
        return Response.json(result, { headers: noStore });
    } catch (error) {
        return handleRouteError(error);
    }
}
