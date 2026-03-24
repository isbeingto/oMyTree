import { redirect } from "next/navigation";
import { getSafeServerSession } from "@/lib/auth";
import AppShell from "../../AppShell";
import ModelsSettingsContent from "./ModelsSettingsContent";
import { normalizeLang } from "@/lib/i18n";

export const dynamic = 'force-dynamic';

export default async function ModelsSettingsPage({
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
    const currentPath = `/app/settings/models${query.toString() ? `?${query.toString()}` : ""}`;
    redirect(`/auth/login?from=${encodeURIComponent(currentPath)}`);
  }

  const user = {
    id: session.user.id,
    email: session.user.email || "",
    name: session.user.name || null,
    preferred_language: (session.user as any).preferred_language || "en",
    emailVerified: session.user.emailVerified || null,
  };

  const lang = normalizeLang(user.preferred_language);

  return (
    <AppShell user={user} activePage="settings">
      <ModelsSettingsContent lang={lang} />
    </AppShell>
  );
}
