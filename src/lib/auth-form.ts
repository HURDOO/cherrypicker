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

const sharedAuthErrorCodes: Record<string, string> = {
    INVALID_EMAIL: 'invalid_email',
    VALIDATION_ERROR: 'invalid_form',
    MISSING_FIELD: 'invalid_form',
    BODY_MUST_BE_AN_OBJECT: 'invalid_form',
    INVALID_ORIGIN: 'origin_not_allowed',
    MISSING_OR_NULL_ORIGIN: 'origin_not_allowed',
    CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: 'origin_not_allowed',
};

const loginAuthErrorCodes: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: 'invalid_credentials',
    INVALID_PASSWORD: 'invalid_credentials',
    USER_NOT_FOUND: 'invalid_credentials',
    CREDENTIAL_ACCOUNT_NOT_FOUND: 'invalid_credentials',
    EMAIL_NOT_VERIFIED: 'email_not_verified',
    EMAIL_PASSWORD_DISABLED: 'login_disabled',
    FAILED_TO_CREATE_SESSION: 'session_failed',
};

const signupAuthErrorCodes: Record<string, string> = {
    EMAIL_PASSWORD_SIGN_UP_DISABLED: 'signup_closed',
    USER_ALREADY_EXISTS: 'email_exists',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'email_exists',
    PASSWORD_TOO_SHORT: 'password_too_short',
    PASSWORD_TOO_LONG: 'password_too_long',
    FAILED_TO_CREATE_USER: 'account_creation_failed',
};

async function errorCodeFromResponse(kind: AuthFormKind, response: Response) {
    let code: string | undefined;

    try {
        const body = await response.clone().json() as { code?: unknown };
        if (typeof body.code === 'string') code = body.code;
    } catch {
        // Better Auth may return an empty or non-JSON error. Use a generic safe code.
    }

    if (response.status === 429) return 'rate_limited';
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode) {
        const mappedCode = sharedAuthErrorCodes[normalizedCode] ?? (
            kind === 'login'
                ? loginAuthErrorCodes[normalizedCode]
                : signupAuthErrorCodes[normalizedCode]
        );
        if (mappedCode) return mappedCode;
    }
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
