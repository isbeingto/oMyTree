import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import AppShell from "./AppShell";

export const dynamic = 'force-dynamic';

export default async function AppPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await searchParamsPromise;
  const session = await getSafeServerSession();

  // Redirect to login if not authenticated
  if (!session?.user?.id) {
    const queryString = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        if (Array.isArray(value)) {
          value.forEach((v) => queryString.append(key, v));
        } else {
          queryString.append(key, value);
        }
      }
    }
    const fromPath = queryString.toString() ? `/app?${queryString.toString()}` : "/app";
    redirect(`/auth/login?from=${encodeURIComponent(fromPath)}`);
  }

  // 检查邮箱验证状态，未验证则重定向到验证页面
  if (!session.user.emailVerified) {
    const verifyParams = new URLSearchParams({
      userId: session.user.id,
      email: session.user.email || "",
      from: "/app",
    });
    redirect(`/auth/verify-email?${verifyParams.toString()}`);
  }

  const user = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
    preferred_language: (session.user as any).preferred_language || "en",
    emailVerified: session.user.emailVerified || null,
    created_at: (session.user as any).created_at || null,
  };

  const treeIdParam = searchParams?.tree_id;
  const nodeIdParam = searchParams?.node ?? searchParams?.node_id;
  const initialTreeId =
    typeof treeIdParam === "string"
      ? treeIdParam
      : Array.isArray(treeIdParam)
        ? treeIdParam[0]
        : null;
  const initialNodeId =
    typeof nodeIdParam === "string"
      ? nodeIdParam
      : Array.isArray(nodeIdParam)
        ? nodeIdParam[0]
        : null;

  // T26-5: Always show workspace, treat /app as "new tree" session when no tree_id
  const isNewSession = searchParams?.new === "1" || searchParams?.new_tree === "1" || !initialTreeId;

  return (
    <AppShell
      user={user}
      activePage="home"
      initialTreeId={initialTreeId}
      initialNodeId={initialNodeId}
      forceNewTreeSession={!initialTreeId && !searchParams?.new && !searchParams?.new_tree}
    />
  );
}
