import { redirect } from "next/navigation";
import { getSafeServerSession, isAdmin } from "@/lib/auth";
import { AdminSidebar } from "./_components/AdminSidebar";
import { AdminRefineProvider } from "./_components/AdminRefineProvider";

export const metadata = {
  title: "Admin | OmyTree",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSafeServerSession();

  // Redirect to login if not authenticated
  if (!session?.user?.id) {
    redirect("/auth/login?next=/admin");
  }

  // Redirect to app if not admin
  if (!isAdmin(session)) {
    redirect("/app");
  }

  return (
    <AdminRefineProvider>
      <div className="h-dvh overflow-hidden bg-[#f3f7f6] dark:bg-[#050b0a]">
        <AdminSidebar />
        <main className="admin-page-bg h-dvh overflow-y-auto overscroll-contain pt-16 lg:pl-72 lg:pt-0">
          <div className="min-h-dvh">{children}</div>
        </main>
      </div>
    </AdminRefineProvider>
  );
}
