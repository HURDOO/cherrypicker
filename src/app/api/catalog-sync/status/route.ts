import { handleRouteError } from '@/lib/api-server';
import { catalogSyncStatus, noStore, withCatalogSync } from '@/lib/catalog-sync-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    try {
        return Response.json(await withCatalogSync(request, catalogSyncStatus), { headers: noStore });
    } catch (error) {
        return handleRouteError(error);
    }
}
