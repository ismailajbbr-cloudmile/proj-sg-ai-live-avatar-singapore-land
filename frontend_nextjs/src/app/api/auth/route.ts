import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        // "Option 1" predefined hardcoded credentials. 
        // You can update these logic rules or use environment variables later.
        const validUsername = process.env.ADMIN_USERNAME || 'admin';
        const validPassword = process.env.ADMIN_PASSWORD || 'password';

        if (username === validUsername && password === validPassword) {
            // Create a successful response
            const response = NextResponse.json({ success: true, message: 'Authenticated successfully' }, { status: 200 });

            // Set the auth cookie
            // In a real application, you'd use a JWT or session token.
            response.cookies.set({
                name: 'auth-token',
                value: 'authenticated_session_token_' + Date.now(),
                httpOnly: true,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                maxAge: 60 * 60 * 24 * 7, // 1 week
            });

            return response;
        } else {
            return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
        }
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Bad request' }, { status: 400 });
    }
}
