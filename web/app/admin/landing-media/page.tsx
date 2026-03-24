"use client";

import React, { useEffect, useRef, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import {
  Check,
  Edit2,
  Film,
  GripVertical,
  Image as ImageIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, AdminSection, AdminEmptyState } from "../_components/AdminUi";

interface MediaItem {
  id: string;
  section: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  title_en: string;
  title_zh: string;
  description_en: string;
  description_zh: string;
  sortOrder: number;
  createdAt: string;
}

const SECTIONS = [
  { value: "hero_app", label: "Hero — 首屏应用预览（建议 1 张/段）" },
  { value: "layer1_tree", label: "Bento — 树状分支（建议 1 张/段）" },
  { value: "layer1_model", label: "Bento — 模型切换（建议 1 张/段）" },
  { value: "layer1_annotation", label: "Bento — 批注（建议 1 张/段）" },
  { value: "layer2_outcome", label: "Bento — 成果报告（建议 1 张/段）" },
  { value: "showcase_layer1", label: "三层展示 — 空间层（Layer 1）" },
  { value: "showcase_layer2", label: "三层展示 — 策展层（Layer 2）" },
  { value: "showcase_layer3", label: "三层展示 — 资产层（Layer 3）" },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaPreview({ item }: { item: MediaItem }) {
  const url = `/api/landing-media/file/${item.filename}`;
  if (item.mimeType.startsWith("video/")) {
    return <video src={url} className="h-24 w-40 rounded-lg bg-black object-cover" controls muted />;
  }
  return (
    <img
      src={url}
      alt={item.title_en || item.originalName}
      className="h-24 w-40 rounded-lg bg-slate-100 object-cover dark:bg-slate-800"
    />
  );
}

export default function LandingMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<MediaItem>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadSection, setUploadSection] = useState("layer1_tree");
  const [uploadTitleEn, setUploadTitleEn] = useState("");
  const [uploadTitleZh, setUploadTitleZh] = useState("");
  const [uploadDescEn, setUploadDescEn] = useState("");
  const [uploadDescZh, setUploadDescZh] = useState("");

  const mediaQuery = useCustom<{ ok?: boolean; items?: MediaItem[] }>({
    url: "/api/admin/landing-media",
    method: "get",
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();
  const loading = mediaQuery.query.isLoading;

  useEffect(() => {
    const payload = mediaQuery.result.data;
    if (payload?.ok) {
      setItems(payload.items || []);
    }
  }, [mediaQuery.result.data]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("section", uploadSection);
    fd.append("title_en", uploadTitleEn);
    fd.append("title_zh", uploadTitleZh);
    fd.append("description_en", uploadDescEn);
    fd.append("description_zh", uploadDescZh);

    try {
      const response = await mutateCustom({
        url: "/api/admin/landing-media/upload",
        method: "post",
        values: fd,
      });
      const data = response.data as { ok?: boolean; item?: MediaItem };
      if (data.ok) {
        if (data.item) {
          setItems((prev) => [...prev, data.item as MediaItem]);
        }
        setUploadTitleEn("");
        setUploadTitleZh("");
        setUploadDescEn("");
        setUploadDescZh("");
      }
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除这个媒体文件吗？")) return;
    try {
      await mutateCustom({
        url: `/api/admin/landing-media/${id}`,
        method: "delete",
        values: {},
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const startEdit = (item: MediaItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const response = await mutateCustom({
        url: `/api/admin/landing-media/${editingId}`,
        method: "patch",
        values: editForm,
        config: { headers: { "content-type": "application/json" } },
      });
      const data = response.data as { ok?: boolean };
      if (data.ok) {
        setItems((prev) => prev.map((i) => (i.id === editingId ? { ...i, ...editForm } : i)));
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
    setEditingId(null);
  };

  const sectionLabel = (val: string) => SECTIONS.find((s) => s.value === val)?.label || val;

  return (
    <AdminPage>
      <AdminHeader title="首页媒体" description="管理官网首页展示图和视频素材" />

      <AdminSection title="上传媒体" description="支持图片和视频，自动进入对应区块">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">展示区块</label>
            <select
              value={uploadSection}
              onChange={(e) => setUploadSection(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            >
              {SECTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">标题（英文）</label>
            <input
              value={uploadTitleEn}
              onChange={(e) => setUploadTitleEn(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Tree Canvas in Action"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">标题（中文）</label>
            <input
              value={uploadTitleZh}
              onChange={(e) => setUploadTitleZh(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="树状画布实战演示"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">描述（英文）</label>
            <input
              value={uploadDescEn}
              onChange={(e) => setUploadDescEn(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">描述（中文）</label>
            <input
              value={uploadDescZh}
              onChange={(e) => setUploadDescZh(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {uploading ? "上传中..." : "上传媒体"}
          </button>
          <span className="text-xs text-slate-400">PNG / JPG / GIF / WebP / SVG / MP4 / MOV / WebM，最大 50MB</span>
        </div>
      </AdminSection>

      <AdminSection title="媒体列表" description="可编辑标题、描述与区块信息">
        {loading ? (
          <div className="py-12 text-center text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <AdminEmptyState title="暂无媒体" description="请先上传首页展示素材" />
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white/80 p-4 transition-colors hover:border-emerald-300 dark:border-slate-700 dark:bg-slate-900/45 dark:hover:border-emerald-700"
              >
                <GripVertical className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                <MediaPreview item={item} />

                {editingId === item.id ? (
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <select
                      value={editForm.section || ""}
                      onChange={(e) => setEditForm({ ...editForm, section: e.target.value })}
                      className="col-span-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    >
                      {SECTIONS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                    <input
                      placeholder="Title (EN)"
                      value={editForm.title_en || ""}
                      onChange={(e) => setEditForm({ ...editForm, title_en: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    />
                    <input
                      placeholder="标题（中文）"
                      value={editForm.title_zh || ""}
                      onChange={(e) => setEditForm({ ...editForm, title_zh: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    />
                    <input
                      placeholder="Description (EN)"
                      value={editForm.description_en || ""}
                      onChange={(e) => setEditForm({ ...editForm, description_en: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    />
                    <input
                      placeholder="描述（中文）"
                      value={editForm.description_zh || ""}
                      onChange={(e) => setEditForm({ ...editForm, description_zh: e.target.value })}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700"
                    />
                    <div className="col-span-2 flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                      >
                        <Check className="h-3 w-3" /> 保存
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200"
                      >
                        <X className="h-3 w-3" /> 取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        {sectionLabel(item.section)}
                      </span>
                      {item.mimeType.startsWith("video/") ? (
                        <Film className="h-3.5 w-3.5 text-slate-400" />
                      ) : (
                        <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                      )}
                      <span className="text-xs text-slate-400">{formatSize(item.size)}</span>
                    </div>
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {item.title_en || item.title_zh || item.originalName}
                    </p>
                    {item.description_en || item.description_zh ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {item.description_en || item.description_zh}
                      </p>
                    ) : null}
                  </div>
                )}

                {editingId !== item.id ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </AdminSection>
    </AdminPage>
  );
}
