import { handleRouteError, readJsonObject } from '@/lib/api-server';
import { noStore, withCatalogSync } from '@/lib/catalog-sync-server';
import { resolveSyncReviewerId } from '@/lib/catalog-sync-reviewer';
import { applyManualPromotionRelease, parseManualPromotionRelease } from '@/lib/manual-promotion-release';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
    try {
        const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
        const result = await withCatalogSync(request, async () => {
            const bundle = parseManualPromotionRelease(await readJsonObject(request, MAX_BODY_BYTES));
            return applyManualPromotionRelease(bundle, { reviewerId: resolveSyncReviewerId(), dryRun });
        });
        return Response.json(result, { headers: noStore });
    } catch (error) {
        return handleRouteError(error);
    }
}
