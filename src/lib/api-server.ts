import { auth } from '@/lib/auth';

const MAX_JSON_BODY_BYTES = 256 * 1024;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RATE_LIMIT_WINDOW_MS = 60_000;
const READ_REQUESTS_PER_WINDOW = 120;
const WRITE_REQUESTS_PER_WINDOW = 60;

type RateLimitBucket = {
    count: number;
    startedAt: number;
};

type ApiServerGlobal = typeof globalThis & {
    cherryPickerRateLimits?: Map<string, RateLimitBucket>;
};

const apiServerGlobal = globalThis as ApiServerGlobal;
const rateLimitBuckets = apiServerGlobal.cherryPickerRateLimits ?? new Map();
apiServerGlobal.cherryPickerRateLimits = rateLimitBuckets;

export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

export async function requireUser(request: Request) {
    assertSameOriginMutation(request);

    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session?.user) {
        throw new HttpError(401, '로그인이 필요합니다.');
    }

    assertRequestRateLimit(session.user.id, request.method);

    return session.user;
}

function assertRequestRateLimit(userId: string, method: string) {
    const isRead = SAFE_METHODS.has(method.toUpperCase());
    const limit = isRead ? READ_REQUESTS_PER_WINDOW : WRITE_REQUESTS_PER_WINDOW;
    const key = `${userId}:${isRead ? 'read' : 'write'}`;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);

    if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
        rateLimitBuckets.set(key, { count: 1, startedAt: now });
        return;
    }

    if (current.count >= limit) {
        throw new HttpError(429, '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
    }

    current.count += 1;
}

function assertSameOriginMutation(request: Request) {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return;

    const configuredUrl = process.env.BETTER_AUTH_URL;
    if (!configuredUrl && process.env.NODE_ENV === 'production') {
        throw new HttpError(500, 'BETTER_AUTH_URL 설정이 필요합니다.');
    }

    const expectedOrigin = new URL(configuredUrl || request.url).origin;
    const requestOrigin = request.headers.get('origin');
    const fetchSite = request.headers.get('sec-fetch-site');

    if (!requestOrigin || requestOrigin === 'null') {
        throw new HttpError(403, '요청 출처를 확인할 수 없습니다.');
    }

    let normalizedOrigin: string;
    try {
        normalizedOrigin = new URL(requestOrigin).origin;
    } catch {
        throw new HttpError(403, '요청 출처가 올바르지 않습니다.');
    }

    if (normalizedOrigin !== expectedOrigin || (fetchSite && fetchSite !== 'same-origin')) {
        throw new HttpError(403, '허용되지 않은 요청 출처입니다.');
    }
}

export async function readJsonObject(request: Request) {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        throw new HttpError(415, 'Content-Type은 application/json이어야 합니다.');
    }

    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
        throw new HttpError(413, '요청 본문이 너무 큽니다.');
    }

    if (!request.body) {
        throw new HttpError(400, '요청 본문이 필요합니다.');
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    let byteLength = 0;
    let jsonText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        byteLength += value.byteLength;
        if (byteLength > MAX_JSON_BODY_BYTES) {
            await reader.cancel();
            throw new HttpError(413, '요청 본문이 너무 큽니다.');
        }

        jsonText += decoder.decode(value, { stream: true });
    }

    jsonText += decoder.decode();

    let value: unknown;

    try {
        value = JSON.parse(jsonText);
    } catch {
        throw new HttpError(400, '올바른 JSON 요청이 필요합니다.');
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new HttpError(400, '요청 본문은 객체여야 합니다.');
    }

    return value as Record<string, unknown>;
}

export function handleRouteError(error: unknown) {
    if (error instanceof HttpError) {
        return Response.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof Error) {
        if (error.message.includes('FOREIGN KEY constraint failed')) {
            return Response.json(
                { error: '연결된 데이터가 있어 요청을 처리할 수 없습니다.' },
                { status: 409 }
            );
        }

        if (error.message.includes('UNIQUE constraint failed')) {
            return Response.json(
                { error: '이미 존재하는 데이터입니다.' },
                { status: 409 }
            );
        }

        console.error(error);
    }

    return Response.json(
        { error: '서버에서 요청을 처리하지 못했습니다.' },
        { status: 500 }
    );
}
