import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T85: POST /api/upload - Upload a text file
 */
export async function POST(request: NextRequest) {
    console.log('[api/upload] POST handler called');
    const apiTarget = getBackendUrl();

    try {
        const session = await auth();
        const userId = session?.user?.id;
        console.log('[api/upload] Session user ID:', userId);

        // Check for user ID from session or header
        const incomingUserId = request.headers.get('x-omytree-user-id');
        const effectiveUserId = userId || incomingUserId;

        if (!effectiveUserId) {
            console.log('[api/upload] No user ID found, returning 401');
            return NextResponse.json(
                { error: 'Authentication required', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const formData = await request.formData();
        console.log('[api/upload] FormData received, entries:', [...formData.entries()].map(e => e[0]));

        const headers: HeadersInit = {
            'x-omytree-user-id': effectiveUserId,
        };

        const search = request.nextUrl?.search || '';
        console.log('[api/upload] Proxying to backend:', `${apiTarget}/api/upload${search}`);
        const response = await fetch(`${apiTarget}/api/upload${search}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        console.log('[api/upload] Backend response status:', response.status);
        const data = await response.json();
        console.log('[api/upload] Backend response data:', JSON.stringify(data).slice(0, 200));
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('[api/upload] Error proxying POST /api/upload:', error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
