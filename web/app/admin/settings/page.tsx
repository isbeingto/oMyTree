"use client";

import { useEffect, useRef, useState } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import {
  AlertCircle,
  Check,
  Image,
  RefreshCw,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, adminSurfaceClass } from "../_components/AdminUi";

interface SystemSettings {
  site_favicon: string;
}

interface SettingsPayload {
  settings?: Partial<SystemSettings>;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    site_favicon: "",
  });
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const settingsQuery = useCustom<SettingsPayload>({
    url: "/api/admin/settings",
    method: "get",
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  useEffect(() => {
    const remote = settingsQuery.result.data?.settings;
    if (!remote) return;
    setSettings({
      site_favicon: remote.site_favicon || "",
    });
  }, [settingsQuery.result.data?.settings]);

  const loading = settingsQuery.query.isLoading && !settingsQuery.result.data;
  const queryError = settingsQuery.query.error instanceof Error ? settingsQuery.query.error.message : null;
  const error = actionError || queryError;

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = new Set([
      "image/png",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/svg+xml",
    ]);
    if (!allowedTypes.has(file.type)) {
      setActionError("仅支持 .png、.ico、.svg 文件");
      return;
    }

    if (file.size > 1024 * 1024) {
      setActionError("图片大小不能超过 1MB");
      return;
    }

    setUploadingFavicon(true);
    setActionError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append("favicon", file);

      const response = await mutateCustom({
        url: "/api/admin/settings/favicon",
        method: "post",
        values: formData,
      });
      const data = response.data as { favicon?: string };
      setSettings((prev) => ({ ...prev, site_favicon: data.favicon || "" }));
      setSuccess("Favicon 上传成功");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploadingFavicon(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (loading) {
    return (
      <AdminPage>
        <AdminHeader title="设置" description="后台系统配置" />
        <div className={`${adminSurfaceClass} flex h-[60vh] items-center justify-center`}>
          <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHeader
        title="设置"
        description="站点元信息与后台展示配置"
      />

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className={adminSurfaceClass}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Image className="h-4 w-4" />
              站点 Favicon
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {settings.site_favicon ? (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border bg-white">
                    <img src={settings.site_favicon} alt="Current favicon" className="h-12 w-12 object-contain" />
                  </div>
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed bg-slate-50 text-slate-400">
                    <Image className="h-6 w-6" />
                  </div>
                )}
                <div className="flex-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.ico,.svg,image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                    onChange={handleFaviconUpload}
                    className="hidden"
                    id="favicon-upload"
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingFavicon}>
                    {uploadingFavicon ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    上传 Favicon
                  </Button>
                  <p className="mt-2 text-xs text-slate-500">支持 .png / .ico / .svg，最大 1MB</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminPage>
  );
}
