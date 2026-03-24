/**
 * Verify Code API Proxy
 * 验证邮箱验证码
 * 
 * POST /api/auth/verify-code
 */

import { NextRequest, NextResponse } from 'next/server';

const API_PROXY_TARGET = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const res = await fetch(`${API_PROXY_TARGET}/api/auth/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[verify-code] Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
