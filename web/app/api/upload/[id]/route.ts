import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * Helper to get effective user ID from session or header
 */
async function getEffectiveUserId(request: NextRequest): Promise<string | null> {
    const session = await auth();
    const sessionUserId = session?.user?.id;
    const headerUserId = request.headers.get('x-omytree-user-id');
    return sessionUserId || headerUserId || null;
}

/**
 * T85: GET /api/upload/:id - Get upload metadata
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const apiTarget = getBackendUrl();
    const { id } = await params;

    try {
        const userId = await getEffectiveUserId(request);
        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const response = await fetch(`${apiTarget}/api/upload/${id}`, {
            method: 'GET',
            headers: { 'x-omytree-user-id': userId },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Error proxying GET /api/upload/${id}:`, error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}

/**
 * T85: DELETE /api/upload/:id - Delete an upload
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const apiTarget = getBackendUrl();
    const { id } = await params;

    try {
        const userId = await getEffectiveUserId(request);
        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        const response = await fetch(`${apiTarget}/api/upload/${id}`, {
            method: 'DELETE',
            headers: { 'x-omytree-user-id': userId },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Error proxying DELETE /api/upload/${id}:`, error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
