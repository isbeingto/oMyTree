import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import AppShell from "../AppShell";
export const dynamic = 'force-dynamic';
export default async function SettingsPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await searchParamsPromise;
  const session = await getSafeServerSession();

  if (!session?.user?.id) {
    const query = new URLSearchParams();
    Object.entries(searchParams || {}).forEach(([key, value]) => {
      if (typeof value === "string") {
        query.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => query.append(key, v));
      }
    });
    const currentPath = `/app/settings${query.toString() ? `?${query.toString()}` : ""}`;
    redirect(`/auth/login?from=${encodeURIComponent(currentPath)}`);
  }

  // 检查邮箱验证状态，未验证则重定向到验证页面
  if (!session.user.emailVerified) {
    const verifyParams = new URLSearchParams({
      userId: session.user.id,
      email: session.user.email || "",
      from: "/app/settings",
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

  return <AppShell user={user} activePage="home" initialSettingsOpen />;
}
