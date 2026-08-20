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

    const deleteAccount = async (password: string) => {
        const result = await authClient.deleteUser({ password });

        if (result.error) {
            throw new Error(result.error.message || '계정을 삭제하지 못했습니다.');
        }
        if (!result.data?.success) {
            throw new Error('계정 삭제가 완료되지 않았습니다.');
        }
    };

    return {
        user: session?.user ?? null,
        session,
        loading,
        error,
        refetch,
        signOut,
        deleteAccount,
    };
}
