"use client";

import { useMemo, useState } from "react";
import { useCustom, useCustomMutation, useOne } from "@refinedev/core";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Key,
  Activity,
  Clock,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  Calendar,
  MessageSquare,
  TreePine,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

import { AdminHeader } from "../../_components/AdminHeader";
import { AdminPage } from "../../_components/AdminUi";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface LoginLog {
  id: string;
  event_type: string;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  auth_method: string | null;
  success: boolean;
  failure_reason: string | null;
  created_at: string;
}

interface DailyStat {
  date: string;
  question_count: number;
}

interface UserDetails {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  plan: string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string | null;
  last_login_ip?: string | null;
  register_ip?: string | null;
}

interface ActivitySummary {
  total_questions: number;
  active_questions: number;
  deleted_questions: number;
  total_trees: number;
  active_trees: number;
  days_with_activity: number;
}

interface LoginLogsPayload {
  logs?: LoginLog[];
  total?: number;
  user?: {
    last_login_at?: string | null;
    last_login_ip?: string | null;
    register_ip?: string | null;
  };
}

interface ActivityPayload {
  daily_stats?: DailyStat[];
  summary?: ActivitySummary | null;
}

function getDeviceIcon(deviceType: string | null) {
  switch (deviceType) {
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    case "tablet":
      return <Tablet className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
}

function formatDateTime(dateString: string | null | undefined) {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userIdParam = params.id;
  const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
  const hasUserId = Boolean(userId);

  // Password change dialog
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const userQuery = useOne<UserDetails>({
    resource: "users",
    id: userId,
    queryOptions: {
      enabled: hasUserId,
    },
  });

  const logsQuery = useCustom<LoginLogsPayload>({
    url: hasUserId ? `/api/admin/users/${userId}/login-logs?limit=20` : "/api/admin/users/invalid/login-logs?limit=20",
    method: "get",
    queryOptions: {
      enabled: hasUserId,
    },
  });

  const activityQuery = useCustom<ActivityPayload>({
    url: hasUserId ? `/api/admin/users/${userId}/activity` : "/api/admin/users/invalid/activity",
    method: "get",
    queryOptions: {
      enabled: hasUserId,
    },
  });

  const { mutateAsync: mutateCustom } = useCustomMutation();

  const user = useMemo<UserDetails | null>(() => {
    const base = userQuery.result;
    if (!base) return null;

    const loginUser = logsQuery.result.data?.user;
    if (!loginUser) return base;

    return {
      ...base,
      last_login_at: loginUser.last_login_at ?? base.last_login_at ?? null,
      last_login_ip: loginUser.last_login_ip ?? base.last_login_ip ?? null,
      register_ip: loginUser.register_ip ?? base.register_ip ?? null,
    };
  }, [logsQuery.result.data?.user, userQuery.result]);

  const loginLogs = logsQuery.result.data?.logs || [];
  const loginLogsTotal = logsQuery.result.data?.total || 0;
  const dailyStats = activityQuery.result.data?.daily_stats || [];
  const activitySummary = activityQuery.result.data?.summary || null;

  const loading = userQuery.query.isLoading;
  const error = userQuery.query.error ? getErrorMessage(userQuery.query.error, "加载用户失败") : null;

  const handlePasswordChange = async () => {
    if (!userId) return;

    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword) {
      setPasswordError("请输入新密码");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("密码至少需要 8 个字符");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("两次输入的密码不一致");
      return;
    }

    setPasswordChanging(true);

    try {
      await mutateCustom({
        url: `/api/admin/users/${userId}/password`,
        method: "post",
        values: { password: newPassword },
        config: { headers: { "content-type": "application/json" } },
      });

      setPasswordSuccess(true);
      setNewPassword("");
      setConfirmPassword("");
      
      // Close dialog after 1.5 seconds
      setTimeout(() => {
        setPasswordDialogOpen(false);
        setPasswordSuccess(false);
      }, 1500);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "密码修改失败");
    } finally {
      setPasswordChanging(false);
    }
  };

  if (loading) {
    return (
      <AdminPage>
        <AdminHeader title="用户详情" description="加载中..." />
        <div className="flex h-[60vh] items-center justify-center">
          <Spinner size="lg" />
        </div>
      </AdminPage>
    );
  }

  if (error || !user) {
    return (
      <AdminPage>
        <AdminHeader title="用户详情" description="用户不存在或已被删除" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-destructive">{error || "用户不存在"}</p>
            <Button onClick={() => router.push("/admin/users")}>
              返回用户列表
            </Button>
          </div>
        </div>
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <AdminHeader
        title="用户详情"
        description={`${user.email} · ${user.name || "未设置昵称"}`}
      />
      <div className="overflow-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
            <Link href="/admin/users">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{user.email}</h1>
              <p className="text-sm text-muted-foreground">
                {user.name || "未设置昵称"} · 注册于 {formatDateTime(user.created_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "活跃" : "已禁用"}
              </Badge>
              <Badge variant="outline">{user.role}</Badge>
              <Badge variant="outline">{user.plan}</Badge>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总提问数</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {activitySummary?.total_questions ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  含 {activitySummary?.deleted_questions ?? 0} 已删除
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">对话树数量</CardTitle>
                <TreePine className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {activitySummary?.active_trees ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  共 {activitySummary?.total_trees ?? 0} 个
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">活跃天数</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {activitySummary?.days_with_activity ?? 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  有对话记录的天数
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">登录记录</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loginLogsTotal}</div>
                <p className="text-xs text-muted-foreground">
                  最后登录: {formatDateTime(user.last_login_at)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="login-logs" className="space-y-4">
            <TabsList>
              <TabsTrigger value="login-logs">登录日志</TabsTrigger>
              <TabsTrigger value="activity">对话活动</TabsTrigger>
              <TabsTrigger value="settings">账户设置</TabsTrigger>
            </TabsList>

            {/* Login Logs Tab */}
            <TabsContent value="login-logs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>登录日志</CardTitle>
                  <CardDescription>
                    用户的登录、注册和密码修改记录
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Registration Info */}
                  <div className="grid gap-4 md:grid-cols-3 mb-6 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">注册时间</p>
                        <p className="text-sm font-medium">{formatDateTime(user.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">注册 IP</p>
                        <p className="text-sm font-medium">{user.register_ip || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">最后登录 IP</p>
                        <p className="text-sm font-medium">{user.last_login_ip || "-"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Login Logs Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>事件</TableHead>
                        <TableHead>时间</TableHead>
                        <TableHead>IP 地址</TableHead>
                        <TableHead>设备</TableHead>
                        <TableHead>浏览器</TableHead>
                        <TableHead>系统</TableHead>
                        <TableHead>状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            暂无登录记录
                          </TableCell>
                        </TableRow>
                      ) : (
                        loginLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {log.event_type === "login" && "登录"}
                                {log.event_type === "register" && "注册"}
                                {log.event_type === "logout" && "登出"}
                                {log.event_type === "password_change" && "改密"}
                                {log.event_type === "password_reset" && "重置密码"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {formatDateTime(log.created_at)}
                            </TableCell>
                            <TableCell className="text-sm font-mono">
                              {log.ip_address || "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {getDeviceIcon(log.device_type)}
                                <span className="text-sm capitalize">
                                  {log.device_type || "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.browser || "-"}
                            </TableCell>
                            <TableCell className="text-sm">
                              {log.os || "-"}
                            </TableCell>
                            <TableCell>
                              {log.success ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <XCircle className="h-4 w-4 text-red-500" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>对话活动记录</CardTitle>
                  <CardDescription>
                    按日期显示用户的对话活动（仅显示有对话的日期）
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>提问次数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyStats.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            暂无对话记录
                          </TableCell>
                        </TableRow>
                      ) : (
                        dailyStats.map((stat) => (
                          <TableRow key={stat.date}>
                            <TableCell>{formatDate(stat.date)}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{stat.question_count}</Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Settings Tab */}
            <TabsContent value="settings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>账户设置</CardTitle>
                  <CardDescription>
                    管理用户的账户信息和密码
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Key className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">修改密码</p>
                        <p className="text-sm text-muted-foreground">
                          为用户设置新的登录密码
                        </p>
                      </div>
                    </div>
                    <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline">修改密码</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>修改用户密码</DialogTitle>
                          <DialogDescription>
                            为 {user.email} 设置新的登录密码
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          {passwordSuccess ? (
                            <div className="flex items-center gap-2 text-green-600">
                              <CheckCircle2 className="h-5 w-5" />
                              <span>密码修改成功</span>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-2">
                                <Label htmlFor="new-password">新密码</Label>
                                <div className="relative">
                                  <Input
                                    id="new-password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="请输入至少 8 位密码"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    disabled={passwordChanging}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full"
                                    onClick={() => setShowPassword(!showPassword)}
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-4 w-4" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="confirm-password">确认密码</Label>
                                <Input
                                  id="confirm-password"
                                  type={showPassword ? "text" : "password"}
                                  placeholder="再次输入新密码"
                                  value={confirmPassword}
                                  onChange={(e) => setConfirmPassword(e.target.value)}
                                  disabled={passwordChanging}
                                />
                              </div>
                              {passwordError && (
                                <p className="text-sm text-destructive">{passwordError}</p>
                              )}
                            </>
                          )}
                        </div>
                        {!passwordSuccess && (
                          <DialogFooter>
                            <Button
                              variant="outline"
                              onClick={() => setPasswordDialogOpen(false)}
                              disabled={passwordChanging}
                            >
                              取消
                            </Button>
                            <Button
                              onClick={handlePasswordChange}
                              disabled={passwordChanging}
                            >
                              {passwordChanging ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  保存中...
                                </>
                              ) : (
                                "保存密码"
                              )}
                            </Button>
                          </DialogFooter>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </AdminPage>
  );
}
