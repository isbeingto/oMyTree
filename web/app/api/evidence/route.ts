import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T58-9-0: POST /api/evidence - Create new evidence
 */
export async function POST(request: NextRequest) {
    const apiTarget = getBackendUrl();

    try {
        const session = await auth();
        const body = await request.json();
        const headers: HeadersInit = {
            'Content-Type': 'application/json',
        };
        if (session?.user?.id) {
            headers['x-omytree-user-id'] = session.user.id;
        } else {
            const incomingUserId = request.headers.get('x-omytree-user-id');
            if (incomingUserId) {
                headers['x-omytree-user-id'] = incomingUserId;
            }
        }

        const response = await fetch(`${apiTarget}/api/evidence`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error('Error proxying POST /api/evidence:', error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
