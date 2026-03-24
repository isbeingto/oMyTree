"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { appApiDelete, appApiGet, appApiPost, appApiPut } from "@/lib/app-api-client";

export type ProviderKind = "openai" | "google" | "anthropic" | "deepseek" | "ollama";
export type ByokProviderKind = Exclude<ProviderKind, "ollama">;

export interface UserProvider {
  id: string;
  kind: ProviderKind;
  display_name: string;
  api_key_masked: string;
  base_url: string | null;
  enabled: boolean;
  test_passed: boolean;
  test_passed_at: string | null;
  enabled_model_count: number;
}

export interface UserModel {
  id?: string;
  model_key: string;
  display_name: string;
  description?: string;
  enabled: boolean;
  sort_order?: number;
}

export interface LlmSettingsResponse {
  ok?: boolean;
  provider?: string;
  enable_advanced_context?: boolean;
  advanced_available?: boolean;
  advanced_disabled_reason?: string | null;
  has_key?: boolean;
  is_demo?: boolean;
  message?: string;
  usage?: {
    weekly?: {
      used: number;
      limit: number;
      remaining: number;
      reset_at?: string | null;
      plan?: string;
    };
  } | null;
}

export interface UserProvidersResponse {
  ok?: boolean;
  providers?: UserProvider[];
  is_demo?: boolean;
}

export interface UserProviderDetailResponse {
  ok?: boolean;
  provider?: UserProvider | null;
  models?: UserModel[];
  is_demo?: boolean;
}

type ApiKeyProvider = "openai" | "google";

export interface AccountApiKey {
  id: string;
  provider: ApiKeyProvider;
  label: string | null;
  api_key_masked: string;
  created_at: string;
  updated_at: string;
}

export interface AccountApiKeysResponse {
  ok?: boolean;
  keys?: AccountApiKey[];
}

export interface EnabledModelEntry {
  id?: string;
  model_id: string;
  model_name?: string;
  model_description?: string;
  enabled: boolean;
}

export interface EnabledModelsResponse {
  ok?: boolean;
  models?: Record<string, EnabledModelEntry[]>;
}

export const modelSettingsKeys = {
  all: ["app", "settings", "models"] as const,
  llmSettings: () => [...modelSettingsKeys.all, "llm-settings"] as const,
  userProviders: () => [...modelSettingsKeys.all, "user-providers"] as const,
  userProvider: (kind: ProviderKind) => [...modelSettingsKeys.userProviders(), kind] as const,
  apiKeys: () => [...modelSettingsKeys.all, "api-keys"] as const,
  enabledModels: () => [...modelSettingsKeys.all, "enabled-models"] as const,
};

export async function getLlmSettings() {
  return appApiGet<LlmSettingsResponse>("/account/llm-settings");
}

export async function updateLlmSettings(payload: {
  provider?: string;
  enable_advanced_context?: boolean;
}) {
  return appApiPost<LlmSettingsResponse>("/account/llm-settings", payload);
}

export async function listUserProviders() {
  return appApiGet<UserProvidersResponse>("/account/user-providers");
}

export async function getUserProvider(kind: ProviderKind) {
  return appApiGet<UserProviderDetailResponse>(`/account/user-providers/${kind}`);
}

export async function updateUserProvider(
  kind: ProviderKind,
  payload: { api_key?: string; enabled?: boolean; base_url?: string }
) {
  return appApiPut<{ ok?: boolean; message?: string }>(`/account/user-providers/${kind}`, payload);
}

export async function deleteUserProvider(kind: ProviderKind) {
  return appApiDelete<{ ok?: boolean; message?: string }>(`/account/user-providers/${kind}`);
}

export async function fetchProviderModels(kind: ProviderKind) {
  return appApiPost<{ ok?: boolean; models?: UserModel[]; message?: string; count?: number }>(
    `/account/user-providers/${kind}/fetch-models`
  );
}

export async function testProvider(kind: ProviderKind, payload: { model?: string } = {}) {
  return appApiPost<{ ok?: boolean; success?: boolean; message?: string; error?: { message?: string } }>(
    `/account/user-providers/${kind}/test`,
    payload
  );
}

export async function updateProviderModels(
  kind: ProviderKind,
  payload: { models: Array<{ model_key: string; enabled: boolean }> }
) {
  return appApiPut<{ ok?: boolean; message?: string; count?: number }>(`/account/user-providers/${kind}/models`, payload);
}

export async function syncOllamaModels(payload: {
  base_url?: string;
  models: Array<{ model_key: string; display_name?: string; description?: string }>;
}) {
  return appApiPost<{ ok?: boolean; models?: UserModel[]; count?: number }>("/account/user-providers/ollama/sync-models", payload);
}

export async function markOllamaTested(payload: { success: boolean; elapsed_ms?: number; model?: string }) {
  return appApiPost<{ ok?: boolean; test_passed?: boolean }>("/account/user-providers/ollama/mark-tested", payload);
}

export async function listApiKeys() {
  return appApiGet<AccountApiKeysResponse>("/account/api-keys");
}

export async function saveApiKey(payload: { provider: ApiKeyProvider; api_key: string; label?: string | null }) {
  return appApiPost<{ ok?: boolean; message?: string }>("/account/api-keys", payload);
}

export async function deleteApiKey(apiKeyId: string) {
  return appApiDelete<{ ok?: boolean; message?: string }>(`/account/api-keys/${apiKeyId}`);
}

export async function listEnabledModels() {
  return appApiGet<EnabledModelsResponse>("/account/enabled-models");
}

export async function saveEnabledModels(payload: {
  provider: ApiKeyProvider;
  models: EnabledModelEntry[];
}) {
  return appApiPost<{ ok?: boolean; message?: string; models?: EnabledModelEntry[] }>("/account/enabled-models", payload);
}

export async function testLlmProvider(payload: { provider: ByokProviderKind }) {
  return appApiPost<{ ok?: boolean; success?: boolean; message?: string; error?: { code?: string } }>(
    "/account/test-llm",
    payload
  );
}

export async function refreshLlmModels(payload: { provider: ByokProviderKind }) {
  return appApiPost<{ ok?: boolean; models?: Array<{ id: string; name: string; description: string }>; message?: string; error?: string }>(
    "/account/llm-models/refresh",
    payload
  );
}

export function llmSettingsQueryOptions() {
  return queryOptions({
    queryKey: modelSettingsKeys.llmSettings(),
    queryFn: getLlmSettings,
    staleTime: 30_000,
  });
}

export function userProvidersQueryOptions() {
  return queryOptions({
    queryKey: modelSettingsKeys.userProviders(),
    queryFn: listUserProviders,
    staleTime: 30_000,
  });
}

export function userProviderQueryOptions(kind: ProviderKind) {
  return queryOptions({
    queryKey: modelSettingsKeys.userProvider(kind),
    queryFn: () => getUserProvider(kind),
    staleTime: 15_000,
  });
}

export function useLlmSettingsQuery(enabled = true) {
  return useQuery({
    ...llmSettingsQueryOptions(),
    enabled,
  });
}

export function useUserProvidersQuery(enabled = true) {
  return useQuery({
    ...userProvidersQueryOptions(),
    enabled,
  });
}

export function useUserProviderQuery(kind: ProviderKind, enabled = true) {
  return useQuery({
    ...userProviderQueryOptions(kind),
    enabled,
  });
}
