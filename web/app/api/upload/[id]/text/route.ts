import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T87: GET /api/upload/:id/text - Get normalized/parsed text content for an upload
 * Query params:
 *   - maxLength: Maximum text length to return (0 = full, default = 0)
 *   - offset: Offset for pagination (default = 0)
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const apiTarget = getBackendUrl();
    const { id } = await params;

    try {
        const session = await auth();
        const sessionUserId = session?.user?.id;
        const headerUserId = request.headers.get('x-omytree-user-id');
        const userId = sessionUserId || headerUserId;

        if (!userId) {
            return NextResponse.json(
                { error: 'Authentication required', code: 'UNAUTHORIZED' },
                { status: 401 }
            );
        }

        // Forward query params
        const url = new URL(request.url);
        const queryParams = url.searchParams.toString();
        const backendUrl = queryParams
            ? `${apiTarget}/api/upload/${id}/text?${queryParams}`
            : `${apiTarget}/api/upload/${id}/text`;

        const response = await fetch(backendUrl, {
            method: 'GET',
            headers: { 'x-omytree-user-id': userId },
        });

        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`Error proxying GET /api/upload/${id}/text:`, error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
