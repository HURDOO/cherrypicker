import { handleAuthForm } from '@/lib/auth-form';

export const runtime = 'nodejs';

export function POST(request: Request) {
    return handleAuthForm(request, 'signup', '/api/auth/sign-up/email');
}
