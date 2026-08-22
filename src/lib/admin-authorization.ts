export type AdminAccessMode = 'EMAIL_ALLOWLIST' | 'FIRST_USER' | 'DENY';

export function parseAdminEmails(value?: string) {
    return [...new Set((value || '')
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean))];
}

export function resolveAdminAccess({
    userId,
    email,
    adminEmails,
    configuredMode,
    signUpEnabled,
    firstUserId,
}: {
    userId: string;
    email?: string | null;
    adminEmails: string[];
    configuredMode?: string;
    signUpEnabled: boolean;
    firstUserId?: string | null;
}): AdminAccessMode {
    const normalizedEmail = email?.trim().toLowerCase();

    if (normalizedEmail && adminEmails.includes(normalizedEmail)) {
        return 'EMAIL_ALLOWLIST';
    }

    if (adminEmails.length > 0) return 'DENY';

    const firstUserMode = configuredMode?.trim().toUpperCase() === 'FIRST_USER';
    if (firstUserMode && !signUpEnabled && firstUserId === userId) {
        return 'FIRST_USER';
    }

    return 'DENY';
}
