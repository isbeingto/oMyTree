import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id: treeId } = await params;

    const backendUrl = `${API_PROXY_TARGET}/api/tree/${treeId}/narrative`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-omytree-user-id': userId,
      },
      cache: 'no-store',
    });

    const data = await response.json();
    if (!response.ok) {
      console.warn('[api/tree/[id]/narrative] GET backend response status:', response.status);
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[api/tree/[id]/narrative] GET Error:', error);
    return NextResponse.json(
      { error: 'internal error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id: treeId } = await params;

    const backendUrl = `${API_PROXY_TARGET}/api/tree/${treeId}/narrative`;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-omytree-user-id': userId,
      },
      body: JSON.stringify(body ?? {}),
    });

    const data = await response.json();
    if (!response.ok) {
      console.warn('[api/tree/[id]/narrative] POST backend response status:', response.status);
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[api/tree/[id]/narrative] POST Error:', error);
    return NextResponse.json(
      { error: 'internal error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
