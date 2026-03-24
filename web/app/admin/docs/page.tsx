"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
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
import { useToast } from "@/hooks/use-toast";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, adminSurfaceClass } from "../_components/AdminUi";

interface Doc {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  status: string;
  lang: string;
  doc_type: string;
  version: string | null;
  created_at: string;
  updated_at: string;
}

interface DocsPayload {
  docs?: Doc[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}


function LangBadge({ lang }: { lang: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      {lang}
    </span>
  );
}

function DocTypeBadge({ docType, version }: { docType: string; version?: string | null }) {
  if (docType === "changelog") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        🚀 更新日志{version ? ` ${version}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
      📄 文章
    </span>
  );
}

export default function DocsAdminPage() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Doc | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const latestQueryError = useRef<string | null>(null);

  const docsQuery = useCustom<DocsPayload>({
    url: `/api/admin/docs`,
    method: "get",
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  useEffect(() => {
    const queryError = docsQuery.query.error;
    if (!(queryError instanceof Error)) {
      latestQueryError.current = null;
      return;
    }
    if (latestQueryError.current === queryError.message) {
      return;
    }
    latestQueryError.current = queryError.message;
    console.error("Failed to fetch docs:", queryError);
    toast({
      title: "加载失败",
      description: "文档列表加载失败",
      variant: "destructive",
    });
  }, [docsQuery.query.error, toast]);

  const docs = docsQuery.result.data?.docs || [];
  const isLoading = docsQuery.query.isLoading;

  const handleDelete = async () => {
    if (!docToDelete) return;

    setIsDeleting(true);
    try {
      await mutateCustom({
        url: `/api/admin/docs/${docToDelete.id}`,
        method: "delete",
        values: {},
      });

      toast({
        title: "文档已删除",
        description: `"${docToDelete.title}" 删除成功`,
      });
      await docsQuery.query.refetch();
    } catch (err) {
      console.error("Failed to delete doc:", err);
      toast({
        title: "删除失败",
        description: "文档删除失败",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDocToDelete(null);
    }
  };

  return (
    <AdminPage>
      <AdminHeader title="文档" description="管理帮助文档与更新日志" />

      <section className={`${adminSurfaceClass} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-4 dark:border-slate-800/80">
          <Link
            href="/admin/docs/new"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            新建文档
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-100/70 dark:bg-slate-900/70">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  标题
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  类型
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  语言
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  更新时间
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/30">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <Spinner size="md" className="mx-auto" />
                  </td>
                </tr>
              ) : docs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                    暂无文档
                  </td>
                </tr>
              ) : (
                docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/docs/${doc.id}`}
                        className="font-medium text-slate-900 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
                      >
                        {doc.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-500 dark:text-slate-400">{doc.slug}</td>
                    <td className="px-4 py-3">
                      <DocTypeBadge docType={doc.doc_type} version={doc.version} />
                    </td>
                    <td className="px-4 py-3">
                      <LangBadge lang={doc.lang} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {formatDate(doc.updated_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/docs/${doc.id}`}
                          className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => {
                            setDocToDelete(doc);
                            setDeleteDialogOpen(true);
                          }}
                          className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文档</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 "{docToDelete?.title}" 吗？该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPage>
  );
}
