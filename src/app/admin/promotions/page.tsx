import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { PromotionAdminClient } from '@/components/admin/PromotionAdminClient';

export const dynamic = 'force-dynamic';

export default async function PromotionAdminPage() {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect('/login');
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(email => email.trim().toLowerCase())
        .filter(Boolean);
    if (!session.user.email || !adminEmails.includes(session.user.email.toLowerCase())) {
        redirect('/');
    }
    return <PromotionAdminClient />;
}
