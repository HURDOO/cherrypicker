import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
    auth: {
        handler: vi.fn(),
    },
}));

import { auth } from '@/lib/auth';
import { handleAuthForm } from './auth-form';

const authHandler = vi.mocked(auth.handler);

const formRequest = (pathname: string) => new Request(`http://localhost:3000${pathname}`, {
    method: 'POST',
    headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'http://localhost:3000',
    },
    body: 'email=user%40example.com&password=password123&name=Tester',
});

describe('auth form error mapping', () => {
    beforeEach(() => {
        authHandler.mockReset();
    });

    it.each([
        ['INVALID_EMAIL', '/signup?error=invalid_email'],
        ['PASSWORD_TOO_SHORT', '/signup?error=password_too_short'],
        ['PASSWORD_TOO_LONG', '/signup?error=password_too_long'],
        ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', '/signup?error=email_exists'],
        ['EMAIL_PASSWORD_SIGN_UP_DISABLED', '/signup?error=signup_closed'],
        ['FAILED_TO_CREATE_USER', '/signup?error=account_creation_failed'],
        ['INVALID_ORIGIN', '/signup?error=origin_not_allowed'],
    ])('shows a specific signup error for %s', async (code, expectedLocation) => {
        authHandler.mockResolvedValueOnce(Response.json({ code }, { status: 400 }));

        const response = await handleAuthForm(
            formRequest('/auth/signup'),
            'signup',
            '/api/auth/sign-up/email',
        );

        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(expectedLocation);
    });

    it.each([
        ['INVALID_EMAIL_OR_PASSWORD', '/login?error=invalid_credentials'],
        ['INVALID_EMAIL', '/login?error=invalid_email'],
        ['EMAIL_NOT_VERIFIED', '/login?error=email_not_verified'],
        ['FAILED_TO_CREATE_SESSION', '/login?error=session_failed'],
        ['INVALID_ORIGIN', '/login?error=origin_not_allowed'],
    ])('shows a specific login error for %s', async (code, expectedLocation) => {
        authHandler.mockResolvedValueOnce(Response.json({ code }, { status: 400 }));

        const response = await handleAuthForm(
            formRequest('/auth/login'),
            'login',
            '/api/auth/sign-in/email',
        );

        expect(response.status).toBe(303);
        expect(response.headers.get('location')).toBe(expectedLocation);
    });

    it('keeps unknown server failures generic', async () => {
        authHandler.mockResolvedValueOnce(Response.json(
            { code: 'DATABASE_CONNECTION_DETAILS' },
            { status: 500 },
        ));

        const response = await handleAuthForm(
            formRequest('/auth/login'),
            'login',
            '/api/auth/sign-in/email',
        );

        expect(response.headers.get('location')).toBe('/login?error=server_error');
    });
});
