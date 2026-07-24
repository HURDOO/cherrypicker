import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

function isProtectedPath(pathname: string) {
    return pathname === '/' ||
        pathname === '/design-lab' ||
        pathname.startsWith('/design-lab/') ||
        pathname === '/settings' ||
        pathname.startsWith('/settings/') ||
        pathname === '/history' ||
        pathname.startsWith('/history/');
}

function isAuthPath(pathname: string) {
    return pathname === '/login' ||
        pathname.startsWith('/login/') ||
        pathname === '/signup' ||
        pathname.startsWith('/signup/');
}

export async function proxy(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    const pathname = request.nextUrl.pathname;

    if (!session && process.env.ALLOW_SIGN_UP !== 'true' && pathname.startsWith('/signup')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!session && isProtectedPath(pathname)) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (session && isAuthPath(pathname)) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
