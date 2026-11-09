import { createHash, timingSafeEqual } from 'node:crypto';
import { HttpError } from '@/lib/http-error';

// Opens only the Mac → production catalog sync routes. It is not an admin session and is
// separate from the GoodDeal upload token, so neither can call the other's routes.
export const CATALOG_SYNC_TOKEN_ENV = 'CATALOG_SYNC_TOKEN';
const MIN_TOKEN_LENGTH = 32;

const digest = (value: string) => createHash('sha256').update(value).digest();

export function assertCatalogSyncToken(
    request: Request,
    expected = process.env[CATALOG_SYNC_TOKEN_ENV],
) {
    if (!expected || expected.length < MIN_TOKEN_LENGTH) {
        throw new HttpError(503, '카탈로그 동기화가 설정되지 않았습니다.');
    }
    const header = request.headers.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !timingSafeEqual(digest(token), digest(expected))) {
        throw new HttpError(401, '동기화 토큰이 올바르지 않습니다.');
    }
}
