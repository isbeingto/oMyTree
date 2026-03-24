import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import AppShell from "../../AppShell";

export const dynamic = 'force-dynamic';

function isValidUuid(value: string) {
  return /^[0-9a-fA-F-]{36}$/.test(value);
}

export default async function AppTreePage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ treeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const session = await getSafeServerSession();
  const treeId = params.treeId;
  const nodeIdParam = searchParams?.node ?? searchParams?.node_id;
  const nodeId =
    typeof nodeIdParam === "string"
      ? nodeIdParam
      : Array.isArray(nodeIdParam)
        ? nodeIdParam[0]
        : null;

  if (!session?.user?.id) {
    const query = new URLSearchParams();
    if (nodeId) query.set("node", nodeId);
    const currentPath = `/app/tree/${treeId}${query.toString() ? `?${query.toString()}` : ""}`;
    redirect(`/auth/login?from=${encodeURIComponent(currentPath)}`);
  }

  // 检查邮箱验证状态，未验证则重定向到验证页面
  if (!session.user.emailVerified) {
    const query = new URLSearchParams();
    if (nodeId) query.set("node", nodeId);
    const fromPath = `/app/tree/${treeId}${query.toString() ? `?${query.toString()}` : ""}`;
    const verifyParams = new URLSearchParams({
      userId: session.user.id,
      email: session.user.email || "",
      from: fromPath,
    });
    redirect(`/auth/verify-email?${verifyParams.toString()}`);
  }

  if (!isValidUuid(treeId)) {
    redirect("/app");
  }

  const user = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
    preferred_language: (session.user as any).preferred_language || "en",
    emailVerified: session.user.emailVerified || null,
    created_at: (session.user as any).created_at || null,
  };

  return <AppShell user={user} activePage="home" initialTreeId={treeId} initialNodeId={nodeId} />;
}
