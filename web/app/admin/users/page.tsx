"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCustomMutation, useDelete, useTable, useUpdate } from "@refinedev/core";
import { CheckCircle2, Eye, Loader2, Mail, Search, Trash2, XCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InlineSpinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, adminSurfaceClass } from "../_components/AdminUi";

const PROTECTED_EMAILS = ["admin@fengnayun.com", "sj@unionsoft.cn"];

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
];

interface User {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  plan: string | null;
  is_active: boolean;
  email_verified: string | null;
  created_at: string;
  last_login_at: string | null;
}

interface Stats {
  admins: number;
  active: number;
}

type VerificationFilter = "all" | "verified" | "unverified";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export default function UsersAdminPage() {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");

  const { tableQuery, setFilters, currentPage, setCurrentPage, pageCount } = useTable<User>({
    resource: "users",
    syncWithLocation: true,
    pagination: {
      currentPage: 1,
      pageSize: 20,
      mode: "server",
    },
    sorters: {
      mode: "off",
    },
  });

  const { mutateAsync: mutateUpdate, mutation: updateMutation } = useUpdate<User>();
  const { mutateAsync: mutateDelete } = useDelete<User>();
  const { mutateAsync: mutateCustom } = useCustomMutation();

  useEffect(() => {
    const timer = setTimeout(() => {
      const q = searchQuery.trim();
      setCurrentPage(1);
      setFilters(
        q
          ? [
              {
                field: "q",
                operator: "contains",
                value: q,
              },
            ]
          : [],
        "replace"
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, setFilters, setCurrentPage]);

  const payload = tableQuery.data as
    | {
        data?: User[];
        total?: number;
        stats?: Stats;
      }
    | undefined;

  const users = payload?.data ?? [];
  const total = payload?.total ?? 0;
  const stats = payload?.stats ?? { admins: 0, active: 0 };

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (verificationFilter === "all") return true;
        if (verificationFilter === "verified") return user.email_verified !== null;
        return user.email_verified === null;
      }),
    [users, verificationFilter]
  );

  const updatingId =
    updateMutation.isPending && updateMutation.variables?.id
      ? String(updateMutation.variables.id)
      : null;

  const isProtectedUser = (email: string) => PROTECTED_EMAILS.includes(email.toLowerCase());

  const updateUser = async (userId: string, updates: Partial<Pick<User, "role" | "is_active">>) => {
    try {
      await mutateUpdate({
        resource: "users",
        id: userId,
        values: updates,
        invalidates: ["list", "detail"],
      });

      toast({
        title: "保存成功",
        description: "用户设置已更新",
      });
    } catch (err: any) {
      toast({
        title: "保存失败",
        description: err?.message || "用户设置更新失败",
        variant: "destructive",
      });
      tableQuery.refetch();
    }
  };

  const handleRoleChange = (userId: string, newRole: "user" | "admin") => {
    updateUser(userId, { role: newRole });
  };

  const handleActiveToggle = (userId: string, currentActive: boolean) => {
    updateUser(userId, { is_active: !currentActive });
  };

  const handleResendVerification = async (userId: string, userEmail: string) => {
    setResendingId(userId);
    try {
      await mutateCustom({
        url: `/api/admin/users/${userId}/resend-verification`,
        method: "post",
        values: {},
      });

      toast({
        title: "邮件已发送",
        description: `已重新发送验证邮件到 ${userEmail}`,
      });
    } catch (err: any) {
      toast({
        title: "发送失败",
        description: err?.message || "验证邮件发送失败",
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setDeletingId(userToDelete.id);
    try {
      await mutateDelete({
        resource: "users",
        id: userToDelete.id,
        invalidates: ["list", "detail"],
      });

      toast({
        title: "用户已删除",
        description: `已删除用户 ${userToDelete.email}`,
      });
      tableQuery.refetch();
    } catch (err: any) {
      toast({
        title: "删除失败",
        description: err?.message || "删除用户失败",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
      setUserToDelete(null);
    }
  };

  return (
    <AdminPage>
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除用户 "{userToDelete?.email}" 吗？此操作将删除该用户全部数据（树、节点、对话等），且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={!!deletingId}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deletingId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AdminHeader title="用户" description="账号、角色、状态与邮箱验证管理" />

      <section className={`${adminSurfaceClass} p-5 sm:p-6`}>
        <div className="mb-6 flex flex-wrap items-center gap-6 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            用户总数：
            <span className="ml-1 font-semibold text-slate-900 dark:text-slate-100">{total}</span>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            管理员：
            <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">{stats.admins}</span>
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            活跃账号：
            <span className="ml-1 font-semibold text-blue-600 dark:text-blue-400">{stats.active}</span>
          </span>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="relative w-full max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索邮箱 / 昵称"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-900">
            {([
              ["all", "全部"],
              ["verified", "已验证"],
              ["unverified", "未验证"],
            ] as const).map(([filter, label]) => (
              <button
                key={filter}
                onClick={() => setVerificationFilter(filter)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  verificationFilter === filter
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tableQuery.isFetching ? <InlineSpinner size="sm" className="text-muted-foreground" /> : null}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-800/80">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-100/70 dark:bg-slate-900/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    邮箱
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    昵称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    角色
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    套餐
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    邮箱状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    启用
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    注册时间
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/30">
                {filteredUsers.length === 0 && !tableQuery.isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      暂无符合条件的用户
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-3 text-sm text-slate-900 dark:text-white">{user.email}</td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{user.name || "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as "user" | "admin")}
                          disabled={updatingId === user.id}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <select
                          value={user.plan || "free"}
                          disabled
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-80"
                        >
                          {PLAN_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">管理员手动升级入口（预留）</div>
                      </td>
                      <td className="px-4 py-3">
                        {user.email_verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            已验证
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <XCircle className="h-3 w-3" />
                            未验证
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleActiveToggle(user.id, user.is_active)}
                          disabled={updatingId === user.id}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                            user.is_active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                          }`}
                          role="switch"
                          aria-checked={user.is_active}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              user.is_active ? "translate-x-4" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/admin/users/${user.id}`}
                            title="查看详情"
                            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>

                          {!user.email_verified ? (
                            <button
                              onClick={() => handleResendVerification(user.id, user.email)}
                              disabled={resendingId === user.id || updatingId === user.id}
                              title="重发验证邮件"
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-900/20"
                            >
                              {resendingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}

                          {!isProtectedUser(user.email) ? (
                            <button
                              onClick={() => setUserToDelete(user)}
                              disabled={deletingId === user.id || updatingId === user.id}
                              title="删除用户"
                              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/20"
                            >
                              {deletingId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}

                          {updatingId === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || tableQuery.isFetching}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            >
              上一页
            </button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount || tableQuery.isFetching}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>
    </AdminPage>
  );
}
