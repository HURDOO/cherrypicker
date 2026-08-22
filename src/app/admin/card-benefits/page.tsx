import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CardBenefitAdminClient } from '@/components/admin/CardBenefitAdminClient';
import { auth } from '@/lib/auth';
import { getAdminAccessMode } from '@/lib/admin-authorization-server';

export const dynamic = 'force-dynamic';

export default async function CardBenefitAdminPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/login');
    if (await getAdminAccessMode(session.user) === 'DENY') {
        redirect('/');
    }
    return <CardBenefitAdminClient />;
}
