import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T58-9-0: GET /api/evidence/:id - Get single evidence
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const apiTarget = getBackendUrl();
    const { id } = await params;

    try {
        const session = await auth();
        const headers: HeadersInit = {};
        if (session?.user?.id) {
            headers['x-omytree-user-id'] = session.user.id;
        } else {
            const incomingUserId = request.headers.get('x-omytree-user-id');
            if (incomingUserId) {
                headers['x-omytree-user-id'] = incomingUserId;
            }
        }

        const response = await fetch(`${apiTarget}/api/evidence/${id}`, {
            method: 'GET',
            headers,
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Error proxying GET /api/evidence/${id}:`, error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
