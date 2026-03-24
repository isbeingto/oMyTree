import { getBackendUrl } from '@/lib/base-url';

// Force dynamic SSR for SSE proxy to avoid static generation
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const API_BASE = getBackendUrl();

export async function GET(_req: Request) {
  // Short-circuit during static build to prevent timeouts
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.BUILD_SKIP_SSE === '1') {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }

  const url = `${API_BASE.replace(/\/$/, '')}/api/events/stream`;
  const res = await fetch(url, { cache: 'no-store', headers: { accept: 'text/event-stream' } });

  if (!res.ok || !res.body) {
    return new Response('SSE endpoint not available', { status: 502 });
  }

  const headers = new Headers();
  headers.set('Content-Type', 'text/event-stream; charset=utf-8');
  headers.set('Cache-Control', 'no-cache, no-transform');
  headers.set('Connection', 'keep-alive');

  return new Response(res.body, { status: 200, headers });
}
