"use client";

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { adminDataProvider } from "@/lib/admin-refine-data-provider";

const resources = [
  { name: "dashboard", list: "/admin/dashboard" },
  { name: "docs", list: "/admin/docs", create: "/admin/docs/new", edit: "/admin/docs/:id", show: "/admin/docs/:id" },
  { name: "users", list: "/admin/users", show: "/admin/users/:id" },
  { name: "usage", list: "/admin/usage" },
  { name: "stats", list: "/admin/stats" },
  { name: "settings", list: "/admin/settings" },
  { name: "providers", list: "/admin/providers" },
  { name: "context-inspector", list: "/admin/context-inspector" },
  { name: "landing-media", list: "/admin/landing-media" },
  { name: "logs", list: "/admin/logs" },
];

export function AdminRefineProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 30_000, // 30s — auto-refresh after expiry
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Refine
        dataProvider={adminDataProvider}
        routerProvider={routerProvider}
        resources={resources}
        options={{
          syncWithLocation: true,
        }}
      >
        {children}
      </Refine>
    </QueryClientProvider>
  );
}
