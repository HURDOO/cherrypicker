import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { CardBenefitAdminClient } from '@/components/admin/CardBenefitAdminClient';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function CardBenefitAdminPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/login');
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);
    if (!session.user.email || !adminEmails.includes(session.user.email.toLowerCase())) {
        redirect('/');
    }
    return <CardBenefitAdminClient />;
}
