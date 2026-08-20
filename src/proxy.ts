import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

function isProtectedPath(pathname: string) {
    return pathname === '/design-lab' ||
        pathname.startsWith('/design-lab/') ||
        pathname === '/admin' ||
        pathname.startsWith('/admin/');
}

function isAuthPath(pathname: string) {
    return pathname === '/login' ||
        pathname.startsWith('/login/') ||
        pathname === '/signup' ||
        pathname.startsWith('/signup/');
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    if (process.env.ALLOW_SIGN_UP !== 'true' && pathname.startsWith('/signup')) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (!isProtectedPath(pathname) && !isAuthPath(pathname)) {
        return NextResponse.next();
    }

    const session = await auth.api.getSession({
        headers: request.headers,
    });

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
