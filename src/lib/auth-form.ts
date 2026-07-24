import { auth } from '@/lib/auth';

const MAX_AUTH_FORM_BYTES = 16 * 1024;

type AuthFormKind = 'login' | 'signup';

function redirect(pathname: string, params?: Record<string, string>) {
    const searchParams = new URLSearchParams(params);
    const query = searchParams.toString();

    return new Response(null, {
        status: 303,
        headers: {
            'Cache-Control': 'no-store',
            Location: query ? `${pathname}?${query}` : pathname,
        },
    });
}

function errorCodeFromStatus(kind: AuthFormKind, status: number) {
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    return kind === 'login' ? 'invalid_credentials' : 'signup_failed';
}

async function errorCodeFromResponse(kind: AuthFormKind, response: Response) {
    let code: string | undefined;

    try {
        const body = await response.clone().json() as { code?: unknown };
        if (typeof body.code === 'string') code = body.code;
    } catch {
        // Better Auth may return an empty or non-JSON error. Use a generic safe code.
    }

    if (code === 'EMAIL_PASSWORD_SIGN_UP_DISABLED') return 'signup_closed';
    if (code?.includes('USER_ALREADY_EXISTS')) return 'email_exists';
    return errorCodeFromStatus(kind, response.status);
}

function redirectWithAuthCookies(pathname: string, authResponse: Response) {
    const response = redirect(pathname);
    authResponse.headers.getSetCookie().forEach((cookie) => {
        response.headers.append('Set-Cookie', cookie);
    });
    return response;
}

export async function handleAuthForm(
    request: Request,
    kind: AuthFormKind,
    endpoint: '/api/auth/sign-in/email' | '/api/auth/sign-up/email'
) {
    const contentType = request.headers.get('content-type') || '';
    const declaredLength = Number(request.headers.get('content-length'));
    const failurePath = kind === 'login' ? '/login' : '/signup';

    if (!contentType.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
        return redirect(failurePath, { error: 'invalid_form' });
    }

    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUTH_FORM_BYTES) {
        return redirect(failurePath, { error: 'invalid_form' });
    }

    try {
        const authUrl = new URL(endpoint, request.url);
        const authRequest = new Request(authUrl, request);
        const authResponse = await auth.handler(authRequest);

        if (!authResponse.ok) {
            const error = await errorCodeFromResponse(kind, authResponse);
            return redirect(failurePath, { error });
        }

        if (kind === 'signup') {
            return redirect('/login', { signup: 'processed' });
        }

        return redirectWithAuthCookies('/', authResponse);
    } catch (error) {
        const errorName = error instanceof Error ? error.name : 'UnknownError';
        console.error(`[auth-form] ${kind} failed: ${errorName}`);
        return redirect(failurePath, { error: 'server_error' });
    }
}
