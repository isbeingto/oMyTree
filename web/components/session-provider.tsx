"use client";

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode, useEffect, useRef } from "react";

/**
 * 内部组件：在用户会话就绪后调用 session-init API 补齐 IP/UA 信息
 * 只在会话首次就绪时执行一次
 */
function SessionInitializer() {
  const { data: session, status } = useSession();
  const initCalledRef = useRef(false);

  useEffect(() => {
    // 仅在会话已认证且尚未调用过时执行
    if (status === "authenticated" && session?.user?.id && !initCalledRef.current) {
      initCalledRef.current = true;
      
      // 异步调用 session-init，补齐 OAuth 登录的 IP/User-Agent
      fetch("/api/auth/session-init", {
        method: "POST",
        credentials: "include",
      }).catch((err) => {
        console.error("[SessionProvider] Failed to call session-init:", err);
      });
    }
  }, [status, session?.user?.id]);

  return null;
}

export function SessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={session}>
      <SessionInitializer />
      {children}
    </NextAuthSessionProvider>
  );
}
