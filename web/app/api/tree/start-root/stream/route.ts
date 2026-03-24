import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBackendUrl } from '@/lib/base-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(request: NextRequest) {
  const apiTarget = getBackendUrl();

  try {
    const session = await auth();
    const body = await request.text();
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
    const incomingWorkspaceId = request.headers.get('x-omytree-workspace-id');
    if (incomingWorkspaceId) {
      headers['x-omytree-workspace-id'] = incomingWorkspaceId;
    }

    const backendRes = await fetch(`${apiTarget}/api/tree/start-root/stream`, {
      method: 'POST',
      headers,
      body,
      signal: request.signal,
    });

    if (!backendRes.body) {
      const data = await backendRes.json().catch(() => ({ error: 'Stream unavailable' }));
      return NextResponse.json(data, { status: backendRes.status || 502 });
    }

    const headersOut = new Headers();
    headersOut.set('Content-Type', 'text/event-stream; charset=utf-8');
    headersOut.set('Cache-Control', 'no-cache, no-transform');
    headersOut.set('Connection', 'keep-alive');

    return new NextResponse(backendRes.body, { status: backendRes.status, headers: headersOut });
  } catch (error) {
    if (request.signal.aborted || (error as any)?.name === 'AbortError') {
      return new NextResponse(null, { status: 499 });
    }
    console.error('Error proxying /api/tree/start-root/stream:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: String(error) },
      { status: 500 },
    );
  }
}
