/**
 * API Route: /api/account/[...path]
 * 
 * 代理所有 /api/account/* 请求到后端 API，并添加认证 header
 */

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const API_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

async function proxyToBackend(request: NextRequest, method: string) {
  const session = await getServerSession(authOptions);

  // 获取路径
  const url = new URL(request.url);
  const backendUrl = `${API_TARGET}${url.pathname}${url.search}`;

  // 准备请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // 添加认证 header
  if (session?.user?.id) {
    headers['x-omytree-user-id'] = session.user.id;
  }

  // 转发 trace id
  const traceId = request.headers.get('x-trace-id');
  if (traceId) {
    headers['x-trace-id'] = traceId;
  }

  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    // 对于 POST/PUT/PATCH 请求，转发请求体
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.json();
        fetchOptions.body = JSON.stringify(body);
      } catch {
        // 如果没有 JSON body，继续不带 body
      }
    }

    const response = await fetch(backendUrl, fetchOptions);

    // 检查 Content-Type，确保后端返回的是 JSON
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      console.error(`[api/account] Backend returned non-JSON (${response.status}):`, text.slice(0, 200));
      return NextResponse.json(
        { ok: false, error: 'UPSTREAM_ERROR', message: 'Backend returned non-JSON response', status: response.status },
        { status: 502 }
      );
    }

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[api/account] Proxy error:', error);
    return NextResponse.json(
      { ok: false, error: 'PROXY_ERROR', message: 'Failed to connect to backend' },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest) {
  return proxyToBackend(request, 'GET');
}

export async function POST(request: NextRequest) {
  return proxyToBackend(request, 'POST');
}

export async function PUT(request: NextRequest) {
  return proxyToBackend(request, 'PUT');
}

export async function DELETE(request: NextRequest) {
  return proxyToBackend(request, 'DELETE');
}
