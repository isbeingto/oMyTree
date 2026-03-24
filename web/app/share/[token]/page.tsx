import { notFound } from 'next/navigation';
import { ShareViewer } from './ShareViewer';
import { getBaseUrl } from '@/lib/base-url';

type SharedTreeResponse = {
  version: string;
  tree: {
    id: string;
    name?: string | null;
    topic?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  nodes: any[];
  lens?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

async function fetchSharedTree(token: string): Promise<SharedTreeResponse | null> {
  if (!token) return null;
  const base = getBaseUrl();
  const url = `${base}/api/share/${token}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error('[share viewer] failed to fetch shared tree', res.status);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error('[share viewer] fetch error', err);
    return null;
  }
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const data = await fetchSharedTree(params.token);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center dark:bg-slate-950">
        <div className="max-w-md rounded-xl border border-border/60 bg-white px-6 py-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-xl font-semibold text-foreground">Link expired or tree not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This share link is no longer active. Ask the owner to regenerate a new link.
          </p>
        </div>
      </div>
    );
  }

  // Basic guard: missing nodes means malformed data
  if (!data.nodes || !Array.isArray(data.nodes)) {
    notFound();
  }

  return <ShareViewer data={data} token={params.token} />;
}
