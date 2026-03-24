import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

/**
 * /app/knowledge route redirects to /app?panel=knowledge so that the
 * knowledge panel is rendered client-side inside AppShell without a full
 * page reload.  Direct URL access and shared links still work.
 */
export default async function KnowledgePage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await searchParamsPromise;
  const query = new URLSearchParams();
  query.set('panel', 'knowledge');
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (typeof value === 'string') query.append(key, value);
    else if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
  }
  redirect(`/app?${query.toString()}`);
}
