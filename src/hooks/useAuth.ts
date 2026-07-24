'use client';

import { authClient } from '@/lib/auth-client';

export function useAuth() {
    const {
        data: session,
        isPending: loading,
        error,
        refetch,
    } = authClient.useSession();

    const signOut = async () => {
        const result = await authClient.signOut();

        if (result.error) {
            throw new Error(result.error.message || 'Failed to sign out.');
        }
    };

    return {
        user: session?.user ?? null,
        session,
        loading,
        error,
        refetch,
        signOut,
    };
}
