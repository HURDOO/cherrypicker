import { createBenefitCatalogResponse } from '@/lib/benefit-catalog-http';
import { getBenefitCatalogSnapshot } from '@/lib/benefit-catalog-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
    try {
        return createBenefitCatalogResponse(request, getBenefitCatalogSnapshot());
    } catch (error) {
        console.error('공개 혜택 카탈로그를 만들지 못했습니다.', error);
        return Response.json(
            { error: '혜택 카탈로그를 불러오지 못했습니다.' },
            {
                status: 500,
                headers: { 'Cache-Control': 'no-store' },
            }
        );
    }
}
