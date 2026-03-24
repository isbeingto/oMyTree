"use client";

import { useEffect, useRef, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Save, Columns2, Rows2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/hooks/use-toast";
import { MDEditorWrapper } from "@/components/admin/MDEditorWrapper";
import { AdminHeader } from "../../_components/AdminHeader";
import { AdminPage, adminSurfaceClass } from "../../_components/AdminUi";

type DocLang = "en" | "zh-CN";

interface DocTranslationFormData {
  title: string;
  summary: string;
  content: string;
}

interface DocFormData {
  slug: string;
  publish_at: string;
  doc_type: "article" | "changelog";
  version: string;
  translations: Record<DocLang, DocTranslationFormData>;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

function serializePublishAt(publishAtLocal: string): string | undefined {
  const trimmed = publishAtLocal.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export default function DocEditPage() {
  const params = useParams();
  const id = params.id as string;
  const isNew = id === "new";
  const router = useRouter();
  const { toast } = useToast();

  const hasInitializedRef = useRef(false);

  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSaving, setIsSaving] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [editorLayout, setEditorLayout] = useState<"stacked" | "side-by-side">("stacked");
  const [form, setForm] = useState<DocFormData>({
    slug: "",
    publish_at: toDatetimeLocalValue(new Date()),
    doc_type: "article",
    version: "",
    translations: {
      en: { title: "", summary: "", content: "" },
      "zh-CN": { title: "", summary: "", content: "" },
    },
  });

  const docQuery = useCustom<{
    slug: string;
    doc_type: "article" | "changelog";
    version: string | null;
    publish_at: string;
    translations: Partial<Record<DocLang, Partial<DocTranslationFormData> & { id?: string }>>;
  }>({
    url: `/api/admin/docs/${id}`,
    method: "get",
    queryOptions: {
      enabled: !isNew,
    },
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  useEffect(() => {
    if (isNew) {
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
      }
      setIsLoading(false);
      return;
    }

    if (docQuery.query.isLoading) {
      setIsLoading(true);
      return;
    }

    if (docQuery.query.error) {
      const statusCode =
        typeof (docQuery.query.error as { statusCode?: unknown })?.statusCode === "number"
          ? ((docQuery.query.error as { statusCode: number }).statusCode as number)
          : undefined;

      if (statusCode === 404) {
        toast({
          title: "文档不存在",
          description: "该文档可能已被删除",
          variant: "destructive",
        });
        router.push("/admin/docs");
      } else {
        console.error("Failed to fetch doc:", docQuery.query.error);
        toast({
          title: "加载失败",
          description: "文档加载失败",
          variant: "destructive",
        });
      }
      setIsLoading(false);
      return;
    }

    const data = docQuery.result.data;
    if (!data) {
      setIsLoading(false);
      return;
    }

    setForm({
      slug: data.slug || "",
      publish_at: (() => {
        const fallback = new Date();
        const raw = data.publish_at;
        const parsed = raw ? new Date(raw) : fallback;
        return Number.isNaN(parsed.getTime()) ? toDatetimeLocalValue(fallback) : toDatetimeLocalValue(parsed);
      })(),
      doc_type: data.doc_type || "article",
      version: data.version || "",
      translations: {
        en: {
          title: data.translations?.en?.title || "",
          summary: data.translations?.en?.summary || "",
          content: data.translations?.en?.content || "",
        },
        "zh-CN": {
          title: data.translations?.["zh-CN"]?.title || "",
          summary: data.translations?.["zh-CN"]?.summary || "",
          content: data.translations?.["zh-CN"]?.content || "",
        },
      },
    });
    setSlugManuallyEdited(true);
    setIsLoading(false);
  }, [isNew, docQuery.query.isLoading, docQuery.query.error, docQuery.result.data, router, toast]);

  const handleEnTitleChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      slug: slugManuallyEdited ? prev.slug : slugify(value),
      translations: {
        ...prev.translations,
        en: { ...prev.translations.en, title: value },
      },
    }));
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setForm((prev) => ({ ...prev, slug: value }));
  };

  const handleSave = async () => {
    if (!form.translations.en.title.trim()) {
      toast({
        title: "标题不能为空",
        description: "请填写英文标题",
        variant: "destructive",
      });
      return;
    }

    if (!form.translations["zh-CN"].title.trim()) {
      toast({
        title: "标题不能为空",
        description: "请填写中文标题",
        variant: "destructive",
      });
      return;
    }

    if (!form.translations.en.summary?.trim()) {
      toast({
        title: "摘要不能为空",
        description: "请填写英文摘要（summary），用于 SEO 和列表展示",
        variant: "destructive",
      });
      return;
    }

    if (!form.translations["zh-CN"].summary?.trim()) {
      toast({
        title: "摘要不能为空",
        description: "请填写中文摘要（summary），用于 SEO 和列表展示",
        variant: "destructive",
      });
      return;
    }

    if (!form.slug.trim()) {
      toast({
        title: "slug 不能为空",
        description: "请填写 URL slug",
        variant: "destructive",
      });
      return;
    }

    if (form.doc_type === "changelog" && !form.version.trim()) {
      toast({
        title: "版本号不能为空",
        description: "更新日志必须填写版本号",
        variant: "destructive",
      });
      return;
    }

    if (!form.translations.en.content.trim()) {
      toast({
        title: "内容不能为空",
        description: "请填写英文 Markdown 内容",
        variant: "destructive",
      });
      return;
    }

    if (!form.translations["zh-CN"].content.trim()) {
      toast({
        title: "内容不能为空",
        description: "请填写中文 Markdown 内容",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const url = isNew ? "/api/admin/docs" : `/api/admin/docs/${id}`;
      const method = isNew ? "post" : "put";

      const publishAtIso = serializePublishAt(form.publish_at);
      if (!publishAtIso) {
        toast({
          title: "发布时间无效",
          description: "请选择一个有效的发布时间（精确到分钟）",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const values = {
        ...form,
        publish_at: publishAtIso,
      };

      const response = await mutateCustom({
        url,
        method,
        values,
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as { doc: { id: string } };

      toast({
        title: "保存成功",
        description: isNew ? "文档已发布" : "文档已更新并发布",
      });

      if (isNew) {
        router.push(`/admin/docs/${data.doc.id}`);
      }
    } catch (err: any) {
      console.error("Failed to save doc:", err);
      toast({
        title: "保存失败",
        description: err.message || "文档保存失败",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminPage>
        <AdminHeader title="文档编辑" description="正在加载文档..." />
        <div className={`${adminSurfaceClass} flex min-h-[380px] items-center justify-center`}>
          <Spinner size="lg" />
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHeader
        title={isNew ? "新建文档" : "编辑文档"}
        description={
          isNew
            ? "创建帮助文档或更新日志（中英文双语必填）"
            : `当前文档：${form.translations.en.title || form.translations["zh-CN"].title || "未命名"}`
        }
        actions={
          <div className="flex items-center gap-2">
            {!isNew && form.slug?.trim() ? (
              <Link
                href={form.doc_type === "changelog" ? `/changelog/${form.slug}` : `/docs/${form.slug}`}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
                预览
              </Link>
            ) : null}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              发布
            </button>
          </div>
        }
      />

      <section className={`${adminSurfaceClass} p-5 sm:p-6`}>
        <div className="mb-5 flex items-center justify-between">
          <Link
            href="/admin/docs"
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回文档列表
          </Link>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                英文标题 *
              </label>
              <input
                type="text"
                value={form.translations.en.title}
                onChange={(e) => handleEnTitleChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="例如：How to use oMyTree"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">slug 默认跟随英文标题生成（你手动修改后不再自动跟随）。</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                中文标题 *
              </label>
              <input
                type="text"
                value={form.translations["zh-CN"].title}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      "zh-CN": { ...prev.translations["zh-CN"], title: e.target.value },
                    },
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="例如：如何使用 oMyTree"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Slug（URL 路径）*
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="how-to-use-omytree"
              />
              <div className="mt-1 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                <p>
                  Slug 用于生成文档访问地址（建议仅用小写字母/数字/连字符）。同语言下必须唯一。
                </p>
                <p>标题变化会自动生成 slug；你手动修改后将不再自动跟随标题。</p>
                <p className="font-mono">
                  预览地址：{form.doc_type === "changelog" ? "/changelog/" : "/docs/"}
                  {form.slug?.trim() ? form.slug.trim() : "<slug>"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">英文摘要 *</label>
              <input
                type="text"
                value={form.translations.en.summary}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      en: { ...prev.translations.en, summary: e.target.value },
                    },
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="Short summary for lists and SEO"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">中文摘要 *</label>
              <input
                type="text"
                value={form.translations["zh-CN"].summary}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      "zh-CN": { ...prev.translations["zh-CN"], summary: e.target.value },
                    },
                  }))
                }
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                placeholder="一段用于列表与 SEO 的简短摘要"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">发布时间 *</label>
              <input
                type="datetime-local"
                step="1"
                value={form.publish_at}
                onChange={(e) => setForm((prev) => ({ ...prev, publish_at: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">用于更新日志排序/展示（按浏览器本地时区选择）。</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">（固定）语言策略</label>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                英文无前缀（/docs、/changelog），中文使用 /zh-Hans-CN 前缀。发布时必须同时提供英文与中文。
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">文档类型</label>
              <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/80">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, doc_type: "article" }))}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    form.doc_type === "article"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  📄 文章
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, doc_type: "changelog" }))}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    form.doc_type === "changelog"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  🚀 更新日志
                </button>
              </div>
            </div>

            {form.doc_type === "changelog" ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">版本号 *</label>
                <input
                  type="text"
                  value={form.version}
                  onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  placeholder="例如：v1.2.0"
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Markdown 内容 *</span>
            <button
              type="button"
              onClick={() => setEditorLayout((l) => (l === "stacked" ? "side-by-side" : "stacked"))}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              title={editorLayout === "stacked" ? "切换为左右对照" : "切换为上下堆叠"}
            >
              {editorLayout === "stacked" ? <Columns2 className="h-3.5 w-3.5" /> : <Rows2 className="h-3.5 w-3.5" />}
              {editorLayout === "stacked" ? "左右对照" : "上下堆叠"}
            </button>
          </div>

          <div className={editorLayout === "side-by-side" ? "grid grid-cols-1 gap-4 xl:grid-cols-2" : "space-y-6"}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">英文 Markdown 内容 *</label>
              <MDEditorWrapper
                value={form.translations.en.content}
                onChange={(val) =>
                  setForm((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      en: { ...prev.translations.en, content: val },
                    },
                  }))
                }
                placeholder="Write English Markdown here..."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">中文 Markdown 内容 *</label>
              <MDEditorWrapper
                value={form.translations["zh-CN"].content}
                onChange={(val) =>
                  setForm((prev) => ({
                    ...prev,
                    translations: {
                      ...prev.translations,
                      "zh-CN": { ...prev.translations["zh-CN"], content: val },
                    },
                  }))
                }
                placeholder="在这里编写中文 Markdown 内容..."
              />
            </div>
          </div>
        </div>
      </section>
    </AdminPage>
  );
}
