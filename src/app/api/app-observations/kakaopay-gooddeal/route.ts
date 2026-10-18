import { createHash, timingSafeEqual } from 'node:crypto';
import { handleRouteError, HttpError, readJsonObject } from '@/lib/api-server';
import { parseGoodDealUpload } from '@/lib/gooddeal-observation';
import { ingestGoodDealObservation } from '@/lib/promotion-collector';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Accepts only the GoodDeal observer; it is not an admin session and opens nothing else.
const TOKEN_ENV = 'KAKAOPAY_GOODDEAL_UPLOAD_TOKEN';
const MIN_TOKEN_LENGTH = 32;
const MAX_BODY_BYTES = 128 * 1024;

const digest = (value: string) => createHash('sha256').update(value).digest();

function assertUploadToken(request: Request) {
    const expected = process.env[TOKEN_ENV];
    if (!expected || expected.length < MIN_TOKEN_LENGTH) {
        throw new HttpError(503, '굿딜 업로드가 설정되지 않았습니다.');
    }
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !timingSafeEqual(digest(token), digest(expected))) {
        throw new HttpError(401, '업로드 토큰이 올바르지 않습니다.');
    }
}

export async function POST(request: Request) {
    try {
        assertUploadToken(request);
        const observation = parseGoodDealUpload(await readJsonObject(request, MAX_BODY_BYTES));
        const result = ingestGoodDealObservation(observation);
        return Response.json(result, {
            status: result.status === 'held' ? 422 : 200,
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return handleRouteError(error);
    }
}
