import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Check if the user is authenticated by looking for our auth cookie
    const authToken = request.cookies.get('auth-token');
    const isAuthenticated = !!authToken;
    const isLoginPage = request.nextUrl.pathname.startsWith('/login');

    // Protect the root lobby '/', the '/chat' routes, and the '/admin' routes
    const isProtectedRoute =
        request.nextUrl.pathname === '/' ||
        request.nextUrl.pathname.startsWith('/chat') ||
        request.nextUrl.pathname.startsWith('/admin');

    if (isProtectedRoute && !isAuthenticated) {
        // Redirect unauthenticated users to the login page
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isLoginPage && isAuthenticated) {
        // Redirect authenticated users away from the login page to the lobby
        return NextResponse.redirect(new URL('/', request.url));
    }

    return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: ['/', '/chat', '/chat/:path*', '/login', '/admin', '/admin/:path*'],
};
