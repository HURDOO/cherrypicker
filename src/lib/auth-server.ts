import 'server-only';

import { headers } from 'next/headers';
import { auth } from './auth';

export async function getServerSession() {
    return auth.api.getSession({
        headers: await headers(),
    });
}

export async function requireUserId() {
    const session = await getServerSession();

    if (!session?.user) {
        throw new Error('Authentication required.');
    }

    return session.user.id;
}
