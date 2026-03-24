"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { appApiDelete, appApiGet, appApiPost, appApiRequest } from "@/lib/app-api-client";

export const settingsKeys = {
  all: ["app", "settings"] as const,
  passwordStatus: () => [...settingsKeys.all, "password-status"] as const,
  oauthAccounts: () => [...settingsKeys.all, "oauth-accounts"] as const,
  billing: (userId: string | null | undefined) => [...settingsKeys.all, "billing", userId ?? "anonymous"] as const,
  sharedTrees: (userId: string | null | undefined) => [...settingsKeys.all, "shared-trees", userId ?? "anonymous"] as const,
  appShellQuotaPlan: (userId: string | null | undefined) => [...settingsKeys.all, "app-shell-quota-plan", userId ?? "anonymous"] as const,
};

export type OAuthAccount = {
  id: string;
  provider: string;
  providerAccountId: string;
  expiresAt?: number;
};

export type OAuthAccountsResponse = {
  accounts?: OAuthAccount[];
};

export type PasswordStatusResponse = {
  ok?: boolean;
  hasPassword?: boolean;
};

export type UsageResponse = {
  ok: boolean;
  period?: {
    from: string;
    to: string;
  };
  summary?: {
    requests: number;
    tokens_total: number;
    tokens_platform: number;
    tokens_byok: number;
  };
  by_provider?: {
    provider: string;
    is_byok: boolean;
    requests: number;
    tokens_total: number;
  }[];
  plan?: {
    name: "free" | "pro" | "team";
  };
};

export type QuotaStatusResponse = {
  ok: boolean;
  plan?: "free" | "pro" | "team";
  has_byok?: boolean;
  reset_at?: string;
  weekly?: {
    turn?: { used: number; limit: number; remaining: number; byok_unlimited: boolean };
    summarize?: { used: number; limit: number; remaining: number; byok_unlimited: boolean };
  };
};

export type BillingOverviewResponse = {
  ok: boolean;
  billing_enabled?: boolean;
  provider?: string;
  environment?: "sandbox" | "live";
  plan?: "free" | "pro" | "team";
  subscription?: {
    provider?: string;
    subscription_id?: string;
    customer_id?: string | null;
    status?: string;
    plan_code?: "free" | "pro";
    is_target_plan?: boolean;
    price_id?: string | null;
    currency_code?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
    scheduled_change?: Record<string, unknown> | null;
    management_urls?: {
      update_payment_method?: string;
      cancel?: string;
    } | null;
    canceled_at?: string | null;
    paused_at?: string | null;
    trial_ends_at?: string | null;
    updated_at?: string | null;
  } | null;
};

export type BillingCheckoutResponse = {
  ok: boolean;
  checkout?: {
    provider: string;
    environment: "sandbox" | "live";
    client_token: string;
    price_id: string;
    customer_email: string;
    custom_data: Record<string, unknown>;
    success_url: string;
    cancel_url: string;
  };
};

export type BillingCancelResponse = {
  ok: boolean;
  plan?: "free" | "pro" | "team";
  subscription?: BillingOverviewResponse["subscription"];
};

export type BillingResumeResponse = BillingCancelResponse;

export type SharedTreeEntry = {
  tree_id: string;
  topic: string | null;
  display_title: string | null;
  share_token: string;
  share_enabled_at: string | null;
  share_view_count: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SharedTreesResponse = {
  shared_trees?: SharedTreeEntry[];
};

export async function updateUserPreferences(payload: {
  name?: string;
  preferred_language?: string;
}) {
  return appApiRequest<{ ok?: boolean; name?: string; preferred_language?: string; error?: string }>("/user/preferences", {
    method: "PATCH",
    body: payload,
  });
}

export async function getPasswordStatus() {
  return appApiGet<PasswordStatusResponse>("/auth/password-status", { cache: "no-store" });
}

export async function listOAuthAccounts() {
  return appApiGet<OAuthAccountsResponse>("/account/oauth", { cache: "no-store" });
}

export async function disconnectOAuthAccount(provider: string) {
  return appApiPost<{ success?: boolean; message?: string; error?: string; hasPassword?: boolean }>(
    "/account/oauth/disconnect",
    { provider }
  );
}

export async function deleteCurrentUser() {
  return appApiDelete<{ ok?: boolean; message?: string; error?: string }>("/user/delete");
}

export async function getMonthlyUsage(userId: string) {
  return appApiGet<UsageResponse>("/me/usage/month", {
    headers: { "x-omytree-user-id": userId },
    cache: "no-store",
  });
}

export async function getQuotaStatus(userId: string) {
  return appApiGet<QuotaStatusResponse>("/account/quota-status", {
    headers: { "x-omytree-user-id": userId },
    cache: "no-store",
  });
}

export async function getBillingOverview(userId: string) {
  return appApiGet<BillingOverviewResponse>("/account/billing/overview", {
    headers: { "x-omytree-user-id": userId },
    cache: "no-store",
  });
}

export async function createBillingCheckout(userId: string) {
  return appApiPost<BillingCheckoutResponse>(
    "/account/billing/checkout",
    {},
    {
      headers: { "x-omytree-user-id": userId },
      cache: "no-store",
    }
  );
}

export async function cancelBillingSubscription(userId: string) {
  return appApiPost<BillingCancelResponse>(
    "/account/billing/subscription/cancel",
    {},
    {
      headers: { "x-omytree-user-id": userId },
      cache: "no-store",
    }
  );
}

export async function resumeBillingSubscription(userId: string) {
  return appApiPost<BillingResumeResponse>(
    "/account/billing/subscription/resume",
    {},
    {
      headers: { "x-omytree-user-id": userId },
      cache: "no-store",
    }
  );
}

export async function listSharedTrees(userId: string) {
  return appApiGet<SharedTreesResponse>("/user/shares", {
    headers: { "x-omytree-user-id": userId },
    cache: "no-store",
  });
}

export async function revokeTreeShare(treeId: string, userId: string) {
  return appApiDelete<{ ok?: boolean; message?: string; error?: string }>(`/tree/${treeId}/share`, {
    headers: { "x-omytree-user-id": userId },
  });
}

export async function deleteTreeById(treeId: string, userId: string) {
  return appApiDelete<{ ok?: boolean; message?: string }>(`/tree/${treeId}`, {
    headers: { "x-omytree-user-id": userId },
  });
}

export async function renameTreeById(treeId: string, userId: string, title: string) {
  return appApiRequest<{ tree: { title: string; display_title: string | null } }>(`/tree/${treeId}`, {
    method: "PATCH",
    headers: {
      "x-omytree-user-id": userId,
      "Content-Type": "application/json",
    },
    body: { title },
  });
}

export function usePasswordStatusQuery(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.passwordStatus(),
    queryFn: getPasswordStatus,
    staleTime: 30_000,
    enabled,
  });
}

export function useOAuthAccountsQuery(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.oauthAccounts(),
    queryFn: listOAuthAccounts,
    staleTime: 30_000,
    enabled,
  });
}

export function appShellQuotaPlanQueryOptions(userId: string) {
  return queryOptions({
    queryKey: settingsKeys.appShellQuotaPlan(userId),
    queryFn: () => getQuotaStatus(userId),
    staleTime: 60_000,
  });
}
