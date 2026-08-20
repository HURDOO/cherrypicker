import type { BenefitCatalogSnapshot } from '@/types';

const CACHE_CONTROL = 'public, max-age=0, must-revalidate';

export function getBenefitCatalogEtag(snapshot: BenefitCatalogSnapshot) {
    const generation = new Date(snapshot.generatedAt).getTime().toString(36);
    return `"catalog-v${snapshot.schemaVersion}-${snapshot.catalogVersion}-${generation}"`;
}

export function matchesIfNoneMatch(headerValue: string | null, etag: string) {
    if (!headerValue) return false;

    return headerValue.split(',').some(value => {
        const candidate = value.trim();
        return candidate === '*' || candidate === etag || candidate === `W/${etag}`;
    });
}

export function createBenefitCatalogResponse(
    request: Request,
    snapshot: BenefitCatalogSnapshot
) {
    const etag = getBenefitCatalogEtag(snapshot);
    const headers = new Headers({
        'Cache-Control': CACHE_CONTROL,
        ETag: etag,
        'X-Catalog-Schema-Version': String(snapshot.schemaVersion),
        'X-Catalog-Version': snapshot.catalogVersion,
    });

    if (matchesIfNoneMatch(request.headers.get('if-none-match'), etag)) {
        return new Response(null, { status: 304, headers });
    }

    return Response.json(snapshot, { headers });
}
