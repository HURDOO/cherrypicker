import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { user as userTable } from '@/db/schema';
import { parseAdminEmails } from '@/lib/admin-authorization';

/**
 * The production admin account that synced review records point to. It follows the same
 * rules as the admin screen: an email allowlist when set, otherwise the first account while
 * sign-up is closed. Returns null when there is no such account yet.
 */
export function resolveSyncReviewerId(env: NodeJS.ProcessEnv = process.env): string | null {
    const users = db.select({ id: userTable.id, email: userTable.email })
        .from(userTable)
        .orderBy(asc(userTable.createdAt), asc(userTable.id))
        .all();
    const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);
    if (adminEmails.length > 0) {
        return users.find(item => adminEmails.includes(item.email.trim().toLowerCase()))?.id ?? null;
    }
    const firstUserMode = env.ADMIN_ACCESS_MODE?.trim().toUpperCase() === 'FIRST_USER';
    if (!firstUserMode || env.ALLOW_SIGN_UP === 'true') return null;
    return users[0]?.id ?? null;
}
