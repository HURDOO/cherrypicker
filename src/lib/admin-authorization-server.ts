import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { user as userTable } from '@/db/schema';
import {
    parseAdminEmails,
    resolveAdminAccess,
    type AdminAccessMode,
} from '@/lib/admin-authorization';

export async function getAdminAccessMode({
    id,
    email,
}: {
    id: string;
    email?: string | null;
}): Promise<AdminAccessMode> {
    const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
    const canUseFirstUser = adminEmails.length === 0 &&
        process.env.ADMIN_ACCESS_MODE?.trim().toUpperCase() === 'FIRST_USER' &&
        process.env.ALLOW_SIGN_UP !== 'true';
    const [firstUser] = canUseFirstUser
        ? await db
            .select({ id: userTable.id })
            .from(userTable)
            .orderBy(asc(userTable.createdAt), asc(userTable.id))
            .limit(1)
        : [];

    return resolveAdminAccess({
        userId: id,
        email,
        adminEmails,
        configuredMode: process.env.ADMIN_ACCESS_MODE,
        signUpEnabled: process.env.ALLOW_SIGN_UP === 'true',
        firstUserId: firstUser?.id,
    });
}
