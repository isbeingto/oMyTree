import { redirect } from "next/navigation";

// /admin 自动重定向到 /admin/dashboard
// 权限检查由 layout.tsx 处理
export default function AdminPage() {
  redirect("/admin/dashboard");
}
