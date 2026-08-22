import { describe, expect, it } from 'vitest';
import { parseAdminEmails, resolveAdminAccess } from './admin-authorization';

describe('admin authorization', () => {
    it('normalizes and deduplicates the explicit email allowlist', () => {
        expect(parseAdminEmails(' Admin@example.com,admin@example.com, owner@example.com '))
            .toEqual(['admin@example.com', 'owner@example.com']);
    });

    it('allows an explicitly listed administrator', () => {
        expect(resolveAdminAccess({
            userId: 'user-2',
            email: 'ADMIN@example.com',
            adminEmails: ['admin@example.com'],
            configuredMode: 'FIRST_USER',
            signUpEnabled: false,
            firstUserId: 'user-1',
        })).toBe('EMAIL_ALLOWLIST');
    });

    it('does not fall back to the first account when an allowlist is configured', () => {
        expect(resolveAdminAccess({
            userId: 'user-1',
            email: 'owner@example.com',
            adminEmails: ['admin@example.com'],
            configuredMode: 'FIRST_USER',
            signUpEnabled: false,
            firstUserId: 'user-1',
        })).toBe('DENY');
    });

    it('allows only the first account when the explicit fallback is enabled and signup is closed', () => {
        expect(resolveAdminAccess({
            userId: 'user-1',
            email: 'owner@example.com',
            adminEmails: [],
            configuredMode: 'first_user',
            signUpEnabled: false,
            firstUserId: 'user-1',
        })).toBe('FIRST_USER');

        expect(resolveAdminAccess({
            userId: 'user-2',
            email: 'member@example.com',
            adminEmails: [],
            configuredMode: 'FIRST_USER',
            signUpEnabled: false,
            firstUserId: 'user-1',
        })).toBe('DENY');
    });

    it('keeps the fallback closed while signup is open or the mode is not configured', () => {
        expect(resolveAdminAccess({
            userId: 'user-1',
            email: 'owner@example.com',
            adminEmails: [],
            configuredMode: 'FIRST_USER',
            signUpEnabled: true,
            firstUserId: 'user-1',
        })).toBe('DENY');

        expect(resolveAdminAccess({
            userId: 'user-1',
            email: 'owner@example.com',
            adminEmails: [],
            signUpEnabled: false,
            firstUserId: 'user-1',
        })).toBe('DENY');
    });
});
