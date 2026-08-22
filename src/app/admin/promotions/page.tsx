import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getAdminAccessMode } from '@/lib/admin-authorization-server';
import { PromotionAdminClient } from '@/components/admin/PromotionAdminClient';

export const dynamic = 'force-dynamic';

export default async function PromotionAdminPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/login');
    if (await getAdminAccessMode(session.user) === 'DENY') {
        redirect('/');
    }
    return <PromotionAdminClient />;
}
