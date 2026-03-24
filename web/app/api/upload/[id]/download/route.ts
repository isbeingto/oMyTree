import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

/**
 * T85: GET /api/upload/:id/download - Download file content
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

        const response = await fetch(`${apiTarget}/api/upload/${id}/download`, {
            method: 'GET',
            headers: { 'x-omytree-user-id': userId },
        });

        if (!response.ok) {
            const data = await response.json();
            return NextResponse.json(data, { status: response.status });
        }

        // Stream the binary response
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const contentDisposition = response.headers.get('content-disposition');
        const contentLength = response.headers.get('content-length');

        const responseHeaders = new Headers();
        responseHeaders.set('Content-Type', contentType);
        if (contentDisposition) {
            responseHeaders.set('Content-Disposition', contentDisposition);
        }
        if (contentLength) {
            responseHeaders.set('Content-Length', contentLength);
        }

        const buffer = await response.arrayBuffer();
        return new NextResponse(buffer, {
            status: 200,
            headers: responseHeaders,
        });
    } catch (error) {
        console.error(`Error proxying GET /api/upload/${id}/download:`, error);
        return NextResponse.json(
            { error: 'Internal server error', message: String(error) },
            { status: 500 }
        );
    }
}
