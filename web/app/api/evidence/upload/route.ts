import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T58-9-0: POST /api/evidence/upload - Upload file evidence
 */
export async function POST(request: NextRequest) {
    const apiTarget = getBackendUrl();

    try {
        const session = await auth();
        const formData = await request.formData();

        const headers: HeadersInit = {};
        if (session?.user?.id) {
            headers['x-omytree-user-id'] = session.user.id;
        } else {
            const incomingUserId = request.headers.get('x-omytree-user-id');
            if (incomingUserId) {
                headers['x-omytree-user-id'] = incomingUserId;
            }
        }

        const response = await fetch(`${apiTarget}/api/evidence/upload`, {
            method: 'POST',
            headers,
            body: formData,
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Error proxying POST /api/evidence/upload:', error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
