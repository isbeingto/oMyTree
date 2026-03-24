"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { t, type Lang } from "@/lib/i18n";
import { isByokModelWhitelisted } from "@/lib/model_whitelist";
import { cn } from "@/lib/utils";
import {
  Key,
  RefreshCw,
  Check,
  X,
  Loader2,
  AlertCircle,
  Trash2,
  Zap,
  CheckCircle2,
  Server,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  type ByokProviderKind,
  type UserModel,
  type UserProvider,
  deleteUserProvider,
  fetchProviderModels,
  markOllamaTested,
  syncOllamaModels,
  testProvider,
  updateProviderModels,
  updateUserProvider,
  userProviderQueryOptions,
  userProvidersQueryOptions,
} from "./hooks/useModelSettingsApi";

type ProviderKind = ByokProviderKind;
type ByokProvider = Omit<UserProvider, "kind"> & { kind: ProviderKind };

interface ByokSettingsPanelProps {
  lang: Lang;
}

interface TestResult {
  kind: ProviderKind;
  success: boolean;
  message: string;
}

interface FetchResult {
  kind: ProviderKind;
  ok: boolean;
  count?: number;
  error?: string;
}

const PROVIDER_INFO: Record<ProviderKind, { name: string; keyHint: string; keyPlaceholder: string }> = {
  openai: {
    name: "OpenAI",
    keyHint: "sk-...",
    keyPlaceholder: "sk-proj-...",
  },
  google: {
    name: "Google AI",
    keyHint: "AIza...",
    keyPlaceholder: "AIzaSy...",
  },
  anthropic: {
    name: "Anthropic Claude",
    keyHint: "sk-ant-...",
    keyPlaceholder: "sk-ant-api03-...",
  },
  deepseek: {
    name: "DeepSeek",
    keyHint: "sk-...",
    keyPlaceholder: "sk-...",
  },
};

export default function ByokSettingsPanel({ lang }: ByokSettingsPanelProps) {
  const { status } = useSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Loading state
  const [loading, setLoading] = useState(true);

  // Active tab
  const [activeTab, setActiveTab] = useState<ProviderKind>("openai");

  // Providers and models data
  const [providers, setProviders] = useState<ByokProvider[]>([]);
  const [models, setModels] = useState<Record<ProviderKind, UserModel[]>>({
    openai: [],
    google: [],
    anthropic: [],
    deepseek: [],
  });

  // New key input (for providers without key)
  const [newApiKey, setNewApiKey] = useState<Record<ProviderKind, string>>({
    openai: "",
    google: "",
    anthropic: "",
    deepseek: "",
  });

  // Selected models (pending, not yet saved)
  const [selectedModels, setSelectedModels] = useState<Record<ProviderKind, Set<string>>>({
    openai: new Set(),
    google: new Set(),
    anthropic: new Set(),
    deepseek: new Set(),
  });

  // Workflow state tracking
  // Step 1: Key saved (provider exists)
  // Step 2: Models fetched
  // Step 3: Models selected
  // Step 4: Test passed
  // Step 5: Can enable/save
  const [workflowState, setWorkflowState] = useState<Record<ProviderKind, {
    keyEntered: boolean;
    modelsFetched: boolean;
    modelsSelected: boolean;
    testPassed: boolean;
  }>>({
    openai: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
    google: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
    anthropic: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
    deepseek: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
  });

  // Action states
  const [saving, setSaving] = useState<ProviderKind | null>(null);
  const [fetching, setFetching] = useState<ProviderKind | null>(null);
  const [testing, setTesting] = useState<ProviderKind | null>(null);
  const [deleting, setDeleting] = useState<ProviderKind | null>(null);

  // Results
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [fetchResult, setFetchResult] = useState<FetchResult | null>(null);

  // Delete confirmation
  const [deleteKind, setDeleteKind] = useState<ProviderKind | null>(null);

  // --- Ollama (Local Models) state ---
  const [ollamaUrl, setOllamaUrl] = useState("http://localhost:11434");
  const [ollamaUrlInput, setOllamaUrlInput] = useState("http://localhost:11434");
  const [ollamaProvider, setOllamaProvider] = useState<UserProvider | null>(null);
  const [ollamaModels, setOllamaModels] = useState<UserModel[]>([]);
  const [ollamaSelectedModels, setOllamaSelectedModels] = useState<Set<string>>(new Set());
  const [ollamaWorkflow, setOllamaWorkflow] = useState({
    urlSaved: false, modelsFetched: false, modelsSelected: false, testPassed: false,
  });
  const [ollamaSaving, setOllamaSaving] = useState(false);
  const [ollamaFetching, setOllamaFetching] = useState(false);
  const [ollamaTesting, setOllamaTesting] = useState(false);
  const [ollamaTestResult, setOllamaTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [ollamaFetchResult, setOllamaFetchResult] = useState<{ ok: boolean; count?: number; error?: string } | null>(null);
  const [ollamaDeleteConfirm, setOllamaDeleteConfirm] = useState(false);

  // Load providers
  const loadProviders = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery(userProvidersQueryOptions());
      if (data.ok) {
        const allProviders = data.providers || [];
        // Separate Ollama from BYOK providers
        const byokOnly = allProviders.filter((p): p is ByokProvider => p.kind !== "ollama");
        const ollamaP = allProviders.find((p) => p.kind === "ollama") || null;

        setProviders(byokOnly);

        // Handle Ollama provider
        if (ollamaP) {
          setOllamaProvider(ollamaP);
          const savedUrl = ollamaP.base_url || "http://localhost:11434";
          setOllamaUrl(savedUrl);
          setOllamaUrlInput(savedUrl);
          // Persist to localStorage for TreeWorkspace client-side streaming
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('omytree.ollamaBaseUrl', savedUrl);
          }
          setOllamaWorkflow({
            urlSaved: true,
            modelsFetched: ollamaP.enabled_model_count > 0,
            modelsSelected: ollamaP.enabled_model_count > 0,
            testPassed: ollamaP.test_passed,
          });
        } else {
          setOllamaProvider(null);
          setOllamaWorkflow({ urlSaved: false, modelsFetched: false, modelsSelected: false, testPassed: false });
        }
        
        // Update workflow state based on loaded BYOK providers
        const newWorkflow = { 
          openai: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
          google: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
          anthropic: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
          deepseek: { keyEntered: false, modelsFetched: false, modelsSelected: false, testPassed: false },
        };
        for (const p of byokOnly) {
          const kind = p.kind as ProviderKind;
          newWorkflow[kind] = {
            keyEntered: !!p.api_key_masked,
            modelsFetched: p.enabled_model_count > 0 || false,
            modelsSelected: p.enabled_model_count > 0,
            testPassed: p.test_passed,
          };
        }
        setWorkflowState(newWorkflow);
      }
    } catch (err) {
      console.error("Failed to load providers:", err);
    }
  }, [queryClient]);

  // Load models for a provider
  const loadModels = useCallback(async (kind: ProviderKind) => {
    try {
      const data = await queryClient.fetchQuery(userProviderQueryOptions(kind));
      if (data.ok && data.models) {
        const whitelistedModels = (data.models || []).filter((m: UserModel) =>
          isByokModelWhitelisted(kind, m.model_key)
        );
        setModels((prev) => ({ ...prev, [kind]: whitelistedModels }));

        // Initialize selected models from enabled models
        const enabled = new Set<string>();
        for (const m of whitelistedModels) {
          if (m.enabled) enabled.add(m.model_key);
        }
        setSelectedModels((prev) => ({ ...prev, [kind]: enabled }));
        
        // Update workflow state
        setWorkflowState((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            modelsFetched: whitelistedModels.length > 0,
            modelsSelected: enabled.size > 0,
          },
        }));
      }
    } catch (err) {
      console.error(`Failed to load models for ${kind}:`, err);
    }
  }, [queryClient]);

  // Load Ollama models
  const loadOllamaModels = useCallback(async () => {
    try {
      const data = await queryClient.fetchQuery(userProviderQueryOptions("ollama"));
      if (data.ok && data.models) {
        const allModels = data.models || [];
        setOllamaModels(allModels);

        const enabledSet = new Set<string>();
        for (const m of allModels) {
          if (m.enabled) enabledSet.add(m.model_key);
        }
        setOllamaSelectedModels(enabledSet);

        setOllamaWorkflow((prev) => ({
          ...prev,
          modelsFetched: allModels.length > 0,
          modelsSelected: enabledSet.size > 0,
        }));
      }
    } catch (err) {
      console.error("Failed to load Ollama models:", err);
    }
  }, [queryClient]);

  const refreshProviders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: userProvidersQueryOptions().queryKey });
    await loadProviders();
  }, [loadProviders, queryClient]);

  const refreshOllamaModels = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: userProviderQueryOptions("ollama").queryKey });
    await loadOllamaModels();
  }, [loadOllamaModels, queryClient]);

  // Initial load
  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadProviders();
      await Promise.all([loadModels("openai"), loadModels("google"), loadOllamaModels()]);
      setLoading(false);
    }
    if (status !== "loading") {
      init();
    }
  }, [status, loadProviders, loadModels, loadOllamaModels]);

  // Get provider by kind
  const getProvider = (kind: ProviderKind) => providers.find((p) => p.kind === kind);

  // Handle saving API key (Step 1)
  const handleSaveKey = async (kind: ProviderKind) => {
    const key = newApiKey[kind]?.trim();
    if (!key) return;

    setSaving(kind);
    try {
      const data = await updateUserProvider(kind, { api_key: key });
      if (data.ok) {
        setNewApiKey((prev) => ({ ...prev, [kind]: "" }));
        await Promise.all([
          refreshProviders(),
          queryClient.invalidateQueries({ queryKey: userProviderQueryOptions(kind).queryKey }),
        ]);
        
        // Reset workflow for this provider (key changed, need to re-fetch, re-select, re-test)
        setWorkflowState((prev) => ({
          ...prev,
          [kind]: {
            keyEntered: true,
            modelsFetched: false,
            modelsSelected: false,
            testPassed: false,
          },
        }));
        setModels((prev) => ({ ...prev, [kind]: [] }));
        setSelectedModels((prev) => ({ ...prev, [kind]: new Set() }));
        setTestResult(null);
        setFetchResult(null);

        toast({
          title: t(lang, 'toast_byok_key_saved'),
          description: t(lang, 'toast_byok_key_saved_desc'),
        });
      } else {
        toast({
          title: t(lang, 'toast_byok_save_failed'),
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: t(lang, 'toast_byok_save_failed'),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  // Handle fetching models (Step 2)
  const handleFetchModels = async (kind: ProviderKind) => {
    setFetching(kind);
    setFetchResult(null);
    setTestResult(null);

    try {
      const data = await fetchProviderModels(kind);

      if (data.models) {
        const whitelistedModels = (data.models || []).filter((m: UserModel) =>
          isByokModelWhitelisted(kind, m.model_key)
        );
        setModels((prev) => ({ ...prev, [kind]: whitelistedModels }));
        // Clear previous selection - user needs to re-select
        setSelectedModels((prev) => ({ ...prev, [kind]: new Set() }));
        await queryClient.invalidateQueries({ queryKey: userProviderQueryOptions(kind).queryKey });
        
        setWorkflowState((prev) => ({
          ...prev,
          [kind]: {
            ...prev[kind],
            modelsFetched: whitelistedModels.length > 0,
            modelsSelected: false,
            testPassed: false, // Reset test status
          },
        }));

        setFetchResult({ kind, ok: true, count: whitelistedModels.length });
        toast({
          title: `${t(lang, 'toast_byok_models_fetched')} (${whitelistedModels.length})`,
          description: t(lang, 'toast_byok_models_select'),
        });
      } else {
        setFetchResult({ kind, ok: false, error: data.message || "Unknown error" });
        toast({
          title: t(lang, 'toast_byok_fetch_failed'),
          description: data.message,
          variant: "destructive",
        });
      }
    } catch (err) {
      setFetchResult({ kind, ok: false, error: String(err) });
      toast({
        title: t(lang, 'toast_byok_fetch_failed'),
        variant: "destructive",
      });
    } finally {
      setFetching(null);
    }
  };

  // Handle model selection toggle (Step 3)
  const handleToggleModel = (kind: ProviderKind, modelKey: string, checked: boolean) => {
    setSelectedModels((prev) => {
      const newSet = new Set(prev[kind]);
      if (checked) {
        newSet.add(modelKey);
      } else {
        newSet.delete(modelKey);
      }
      return { ...prev, [kind]: newSet };
    });

    // Update workflow state
    setWorkflowState((prev) => {
      const newSelected = new Set(selectedModels[kind]);
      if (checked) newSelected.add(modelKey);
      else newSelected.delete(modelKey);
      
      return {
        ...prev,
        [kind]: {
          ...prev[kind],
          modelsSelected: newSelected.size > 0,
          testPassed: false, // Reset test when selection changes
        },
      };
    });

    // Clear test result when selection changes
    if (testResult?.kind === kind) {
      setTestResult(null);
    }
  };

  // Handle test connection (Step 4) - uses FIRST selected model
  const handleTest = async (kind: ProviderKind) => {
    const selected = Array.from(selectedModels[kind]);
    if (selected.length === 0) {
      toast({
        title: t(lang, 'toast_byok_select_first'),
        variant: "destructive",
      });
      return;
    }

    setTesting(kind);
    setTestResult(null);

    try {
      // First save the model selection to DB
      const modelUpdates = models[kind].map((m) => ({
        model_key: m.model_key,
        enabled: selectedModels[kind].has(m.model_key),
      }));

      await updateProviderModels(kind, { models: modelUpdates });
      await queryClient.invalidateQueries({ queryKey: userProviderQueryOptions(kind).queryKey });

      // Now test with the selected model
      const data = await testProvider(kind, { model: selected[0] }); // Use first selected model

      if (data.success) {
        setTestResult({
          kind,
          success: true,
          message: data.message || t(lang, 'byok_connection_success'),
        });
        setWorkflowState((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], testPassed: true },
        }));
        await refreshProviders(); // Refresh test_passed status
        toast({ title: t(lang, 'toast_byok_test_success') });
      } else {
        const errorMsg = data.error?.message || data.message || t(lang, 'byok_test_failed');
        setTestResult({ kind, success: false, message: errorMsg });
        setWorkflowState((prev) => ({
          ...prev,
          [kind]: { ...prev[kind], testPassed: false },
        }));
        toast({
          title: t(lang, 'toast_byok_test_failed'),
          description: errorMsg,
          variant: "destructive",
        });
      }
    } catch (err) {
      setTestResult({ kind, success: false, message: t(lang, 'byok_network_error') });
      toast({
        title: t(lang, 'toast_byok_test_failed'),
        variant: "destructive",
      });
    } finally {
      setTesting(null);
    }
  };

  // Handle enable/save (Step 5) - only available after test passes
  const handleSaveAndEnable = async (kind: ProviderKind) => {
    if (!workflowState[kind].testPassed) {
      toast({
        title: t(lang, 'toast_byok_test_required'),
        variant: "destructive",
      });
      return;
    }

    setSaving(kind);
    try {
      // Enable the provider
      const data = await updateUserProvider(kind, { enabled: true });

      if (data.ok) {
        await refreshProviders();
        toast({
          title: t(lang, 'toast_byok_enabled'),
        });
      }
    } catch (err) {
      toast({
        title: t(lang, 'toast_byok_save_failed'),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  // Handle toggle enabled (only if test passed)
  const handleToggleEnabled = async (kind: ProviderKind, enabled: boolean) => {
    const provider = getProvider(kind);
    if (!provider) return;

    // Can only enable if test passed
    if (enabled && !provider.test_passed) {
      toast({
        title: t(lang, 'toast_byok_test_required'),
        variant: "destructive",
      });
      return;
    }

    try {
      await updateUserProvider(kind, { enabled });
      await refreshProviders();
      // Dispatch event to notify other components (e.g., model picker) to refresh
      window.dispatchEvent(new CustomEvent('byok-provider-changed'));
    } catch (err) {
      console.error("Toggle enabled failed:", err);
      toast({
        title: t(lang, 'toast_byok_update_failed'),
        variant: "destructive",
      });
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteKind) return;
    const kindToDelete = deleteKind;

    setDeleting(deleteKind);
    try {
      await deleteUserProvider(kindToDelete);
      toast({ title: t(lang, 'toast_byok_deleted') });
      setModels((prev) => ({ ...prev, [kindToDelete]: [] }));
      setSelectedModels((prev) => ({ ...prev, [kindToDelete]: new Set() }));
      setWorkflowState((prev) => ({
        ...prev,
        [kindToDelete]: {
          keyEntered: false,
          modelsFetched: false,
          modelsSelected: false,
          testPassed: false,
        },
      }));
      await Promise.all([
        refreshProviders(),
        queryClient.invalidateQueries({ queryKey: userProviderQueryOptions(kindToDelete).queryKey }),
      ]);
    } catch (err) {
      toast({
        title: t(lang, 'toast_byok_delete_failed'),
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
      setDeleteKind(null);
    }
  };

  // --- Ollama handlers ---

  // Save Ollama connection URL
  const handleSaveOllamaUrl = async () => {
    const url = ollamaUrlInput?.trim();
    if (!url) return;

    setOllamaSaving(true);
    try {
      const data = await updateUserProvider("ollama", { base_url: url });
      if (data.ok) {
        setOllamaUrl(url);
        // Store in localStorage so TreeWorkspace can read it for client-side streaming
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('omytree.ollamaBaseUrl', url);
        }
        await Promise.all([refreshProviders(), refreshOllamaModels()]);
        setOllamaWorkflow({
          urlSaved: true,
          modelsFetched: false,
          modelsSelected: false,
          testPassed: false,
        });
        setOllamaModels([]);
        setOllamaSelectedModels(new Set());
        setOllamaTestResult(null);
        setOllamaFetchResult(null);
        toast({
          title: t(lang, 'byok_ollama_url_saved'),
          description: url,
        });
      } else {
        toast({
          title: t(lang, 'byok_save_failed'),
          description: data.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t(lang, 'byok_save_failed'), variant: "destructive" });
    } finally {
      setOllamaSaving(false);
    }
  };

  // Fetch Ollama models — browser calls Ollama directly, then syncs to server
  const handleFetchOllamaModels = async () => {
    setOllamaFetching(true);
    setOllamaFetchResult(null);
    setOllamaTestResult(null);

    try {
      // 1. Browser calls Ollama directly (user's local machine)
      const baseUrl = (ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
      let ollamaRes: Response;
      try {
        ollamaRes = await fetch(`${baseUrl}/api/tags`, { method: "GET" });
      } catch (err) {
        setOllamaFetchResult({ ok: false, error: t(lang, 'byok_ollama_cannot_connect_detail').replace('{baseUrl}', baseUrl) });
        toast({
          title: t(lang, 'byok_ollama_cannot_connect_title'),
          description: t(lang, 'byok_ollama_ensure_local'),
          variant: "destructive",
        });
        setOllamaFetching(false);
        return;
      }

      if (!ollamaRes.ok) {
        setOllamaFetchResult({ ok: false, error: `Ollama returned ${ollamaRes.status}` });
        toast({ title: t(lang, 'byok_fetch_models_failed'), variant: "destructive" });
        setOllamaFetching(false);
        return;
      }

      const ollamaData = await ollamaRes.json();
      const rawModels = Array.isArray(ollamaData?.models) ? ollamaData.models : [];
      const modelList = rawModels.map((m: any) => ({
        model_key: m.model || m.name || "unknown",
        display_name: (m.model || m.name || "unknown").split(":")[0],
        description: m.details?.parameter_size
          ? `${m.details.family || ""} ${m.details.parameter_size}`.trim()
          : "",
      }));

      if (modelList.length === 0) {
        setOllamaFetchResult({ ok: false, error: t(lang, 'byok_ollama_no_models_installed') });
        toast({
          title: t(lang, 'byok_no_models_found'),
          description: t(lang, 'byok_ollama_install_hint'),
          variant: "destructive",
        });
        setOllamaFetching(false);
        return;
      }

      // 2. Sync model list to server
      try {
        await syncOllamaModels({ base_url: ollamaUrl, models: modelList });
        await Promise.all([refreshProviders(), refreshOllamaModels()]);
      } catch {
        // Non-critical — models still shown locally
        console.warn("[ByokSettingsPanel] Failed to sync Ollama models to server");
      }

      setOllamaModels(modelList.map((m: any, i: number) => ({
        model_key: m.model_key,
        display_name: m.display_name,
        description: m.description,
        enabled: false,
        sort_order: i,
      })));
      setOllamaSelectedModels(new Set());
      setOllamaWorkflow((prev) => ({
        ...prev,
        modelsFetched: modelList.length > 0,
        modelsSelected: false,
        testPassed: false,
      }));
      setOllamaFetchResult({ ok: true, count: modelList.length });
      toast({
        title: t(lang, 'byok_models_found_count').replace('{count}', String(modelList.length)),
        description: t(lang, 'byok_select_models_to_enable'),
      });
    } catch {
      setOllamaFetchResult({ ok: false, error: t(lang, 'byok_network_error') });
      toast({ title: t(lang, 'byok_fetch_models_failed'), variant: "destructive" });
    } finally {
      setOllamaFetching(false);
    }
  };

  // Toggle Ollama model selection
  const handleToggleOllamaModel = (modelKey: string, checked: boolean) => {
    setOllamaSelectedModels((prev) => {
      const newSet = new Set(prev);
      if (checked) newSet.add(modelKey);
      else newSet.delete(modelKey);
      return newSet;
    });
    setOllamaWorkflow((prev) => {
      const newSet = new Set(ollamaSelectedModels);
      if (checked) newSet.add(modelKey);
      else newSet.delete(modelKey);
      return { ...prev, modelsSelected: newSet.size > 0, testPassed: false };
    });
    if (ollamaTestResult) setOllamaTestResult(null);
  };

  // Test Ollama connection — browser calls Ollama directly, then marks as tested on server
  const handleTestOllama = async () => {
    const selected = Array.from(ollamaSelectedModels);
    if (selected.length === 0) {
      toast({ title: t(lang, 'byok_select_at_least_one_model'), variant: "destructive" });
      return;
    }

    setOllamaTesting(true);
    setOllamaTestResult(null);

    try {
      // Save model selection first
      const modelUpdates = ollamaModels.map((m) => ({
        model_key: m.model_key,
        enabled: ollamaSelectedModels.has(m.model_key),
      }));
      await updateProviderModels("ollama", { models: modelUpdates });
      await queryClient.invalidateQueries({ queryKey: userProviderQueryOptions("ollama").queryKey });

      // Test connection — browser calls Ollama directly
      const baseUrl = (ollamaUrl || "http://localhost:11434").replace(/\/+$/, "");
      const testModel = selected[0];
      const startTime = Date.now();

      let ollamaRes: Response;
      try {
        ollamaRes = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: testModel,
            messages: [{ role: "user", content: "Say hello in one word." }],
            stream: false,
          }),
        });
      } catch {
        setOllamaTestResult({
          success: false,
          message: t(lang, 'byok_ollama_cannot_connect_short').replace('{baseUrl}', baseUrl),
        });
        setOllamaWorkflow((prev) => ({ ...prev, testPassed: false }));
        toast({
          title: t(lang, 'byok_test_failed'),
          description: t(lang, 'byok_ollama_ensure_running'),
          variant: "destructive",
        });
        setOllamaTesting(false);
        return;
      }

      const elapsed = Date.now() - startTime;

      if (ollamaRes.ok) {
        // Mark as tested on server
        try {
          await markOllamaTested({ success: true, elapsed_ms: elapsed, model: testModel });
        } catch {
          console.warn("[ByokSettingsPanel] Failed to mark Ollama as tested on server");
        }

        setOllamaTestResult({
          success: true,
          message: t(lang, 'byok_ollama_connection_success_detail')
            .replace('{elapsed}', String(elapsed))
            .replace('{model}', testModel),
        });
        setOllamaWorkflow((prev) => ({ ...prev, testPassed: true }));
        await refreshProviders();
        toast({ title: t(lang, 'byok_ollama_connection_success') });
      } else {
        const errData = await ollamaRes.json().catch(() => ({}));
        const errMsg = (errData as any)?.error?.message || (errData as any)?.error || `HTTP ${ollamaRes.status}`;
        setOllamaTestResult({ success: false, message: errMsg });
        setOllamaWorkflow((prev) => ({ ...prev, testPassed: false }));
        toast({ title: t(lang, 'byok_test_failed'), description: errMsg, variant: "destructive" });
      }
    } catch {
      setOllamaTestResult({ success: false, message: t(lang, 'byok_network_error') });
      toast({ title: t(lang, 'byok_test_failed'), variant: "destructive" });
    } finally {
      setOllamaTesting(false);
    }
  };

  // Toggle Ollama enabled
  const handleToggleOllamaEnabled = async (enabled: boolean) => {
    if (!ollamaProvider) return;
    if (enabled && !ollamaProvider.test_passed) {
      toast({ title: t(lang, 'byok_pass_test_first'), variant: "destructive" });
      return;
    }
    try {
      await updateUserProvider("ollama", { enabled });
      await refreshProviders();
      window.dispatchEvent(new CustomEvent("byok-provider-changed"));
    } catch (err) {
      console.error("Toggle ollama enabled failed:", err);
    }
  };

  // Delete Ollama configuration
  const handleDeleteOllama = async () => {
    try {
      await deleteUserProvider("ollama");
      // Clear device-specific localStorage marker
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('omytree.ollamaBaseUrl');
      }
      toast({ title: t(lang, 'byok_ollama_configuration_deleted') });
      setOllamaProvider(null);
      setOllamaModels([]);
      setOllamaSelectedModels(new Set());
      setOllamaWorkflow({ urlSaved: false, modelsFetched: false, modelsSelected: false, testPassed: false });
      setOllamaUrl("http://localhost:11434");
      setOllamaUrlInput("http://localhost:11434");
      setOllamaTestResult(null);
      setOllamaFetchResult(null);
      await Promise.all([
        refreshProviders(),
        queryClient.invalidateQueries({ queryKey: userProviderQueryOptions("ollama").queryKey }),
      ]);
    } catch {
      toast({ title: t(lang, 'delete_failed'), variant: "destructive" });
    } finally {
      setOllamaDeleteConfirm(false);
    }
  };

  // Render provider tab content with step-by-step workflow
  const renderProviderTab = (kind: ProviderKind) => {
    const provider = getProvider(kind);
    const providerInfo = PROVIDER_INFO[kind];
    const providerModels = models[kind] || [];
    const hasKey = !!provider?.api_key_masked;
    const workflow = workflowState[kind];
    const selectedCount = selectedModels[kind].size;

    return (
      <div className="space-y-6 py-4">
        {/* Step 1: API Key */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
              hasKey ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            }`}>
              {hasKey ? <Check className="h-3 w-3" /> : "1"}
            </div>
            <Label className="text-sm font-medium">
              API Key
              <span className="ml-2 text-muted-foreground font-normal">{providerInfo.keyHint}</span>
            </Label>
          </div>

          {hasKey ? (
            <div className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg ml-8">
              <div className="flex-1">
                <p className="font-mono text-sm">{provider?.api_key_masked}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteKind(kind)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 ml-8">
              <Input
                type="password"
                placeholder={providerInfo.keyPlaceholder}
                value={newApiKey[kind]}
                onChange={(e) => setNewApiKey((prev) => ({ ...prev, [kind]: e.target.value }))}
                className="flex-1 font-mono"
              />
              <Button
                onClick={() => handleSaveKey(kind)}
                disabled={!newApiKey[kind]?.trim() || saving === kind}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {saving === kind ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
            </div>
          )}
        </div>

        {/* Step 2: Fetch Models (only visible after key is saved) */}
        {hasKey && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                workflow.modelsFetched ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {workflow.modelsFetched ? <Check className="h-3 w-3" /> : "2"}
              </div>
              <Label className="text-sm font-medium">
                {t(lang, 'byok_step_fetch_model_list')}
              </Label>
            </div>

            <div className="flex items-center gap-3 ml-8">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFetchModels(kind)}
                disabled={fetching === kind}
              >
                {fetching === kind ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {t(lang, 'byok_fetch_models')}
              </Button>

              {fetchResult?.kind === kind && (
                <span className={`text-sm ${fetchResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                  {fetchResult.ok ? (
                    <span className="flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      {t(lang, 'byok_models_count').replace('{count}', String(fetchResult.count ?? 0))}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <X className="h-4 w-4" />
                      {fetchResult.error}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Select Models (only visible after models fetched) */}
        {hasKey && workflow.modelsFetched && providerModels.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                workflow.modelsSelected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {workflow.modelsSelected ? <Check className="h-3 w-3" /> : "3"}
              </div>
              <Label className="text-sm font-medium">
                {t(lang, 'byok_select_models')}
                {selectedCount > 0 && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {selectedCount} {t(lang, 'byok_selected')}
                  </Badge>
                )}
              </Label>
            </div>

            <div className="ml-8">
              <ScrollArea className="h-48 rounded-md border p-2">
                <div className="space-y-1">
                  {providerModels.map((model) => {
                    const checked = selectedModels[kind].has(model.model_key);
                    const checkboxDisabled = false;

                    return (
                      <div
                        key={model.model_key}
                        className={cn(
                          'flex items-center gap-3 py-1.5 px-2 rounded text-sm',
                          'hover:bg-accent/50'
                        )}
                      >
                        <Checkbox
                          id={`${kind}-${model.model_key}`}
                          checked={checked}
                          disabled={checkboxDisabled}
                          onCheckedChange={(next) => handleToggleModel(kind, model.model_key, !!next)}
                        />
                        <label
                          htmlFor={`${kind}-${model.model_key}`}
                          className={cn(
                            'flex-1 flex items-center justify-between',
                            checkboxDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
                          )}
                        >
                          <span className="font-mono">{model.model_key}</span>
                          <span className="text-muted-foreground text-xs max-w-[200px] truncate">
                            {model.display_name !== model.model_key ? model.display_name : model.model_key}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-2">
                {t(lang, 'byok_first_model_for_test')}
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Test Connection (only visible after models selected) */}
        {hasKey && workflow.modelsSelected && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                workflow.testPassed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                {workflow.testPassed ? <Check className="h-3 w-3" /> : "4"}
              </div>
              <Label className="text-sm font-medium">
                {t(lang, 'byok_test_connection')}
              </Label>
            </div>

            <div className="flex items-center gap-3 ml-8">
              <Button
                variant={workflow.testPassed ? "outline" : "default"}
                size="sm"
                onClick={() => handleTest(kind)}
                disabled={testing === kind || selectedCount === 0}
              >
                {testing === kind ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Zap className="h-4 w-4 mr-2" />
                )}
                {t(lang, 'byok_test_connection')}
              </Button>

              {testResult?.kind === kind && (
                <span className={`text-sm ${testResult.success ? "text-emerald-600" : "text-destructive"}`}>
                  {testResult.success ? (
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {testResult.message}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {testResult.message}
                    </span>
                  )}
                </span>
              )}
            </div>

            {!workflow.testPassed && (
              <p className="text-xs text-amber-600 dark:text-amber-400 ml-8">
                {t(lang, 'byok_enable_requires_test')}
              </p>
            )}
          </div>
        )}

        {/* Step 5: Enable (only visible after test passed) */}
        {hasKey && workflow.testPassed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Check className="h-3 w-3" />
              </div>
              <Label className="text-sm font-medium">
                {t(lang, 'byok_enable_provider')}
              </Label>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 ml-8">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t(lang, 'byok_enable_provider_named').replace('{provider}', providerInfo.name)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(lang, 'byok_enable_provider_desc')}
                </p>
              </div>
              <Switch
                checked={provider?.enabled || false}
                onCheckedChange={(checked) => handleToggleEnabled(kind, checked)}
              />
            </div>

            {/* Status badges */}
            {provider && (
              <div className="flex items-center gap-2 flex-wrap ml-8">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium">
                  <CheckCircle2 className="h-3 w-3" />
                  {t(lang, 'byok_test_passed')}
                </span>
                {selectedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                    {t(lang, 'byok_models_enabled_count').replace('{count}', String(selectedCount))}
                  </span>
                )}
                {provider.enabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-medium">
                    {t(lang, 'byok_enabled')}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <>
      {/* My API Keys Card */}
      <Card className="glass-panel-soft hover:shadow-md transition-shadow">
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              {t(lang, 'models_my_api_keys')}
            </CardTitle>
            <CardDescription>
                {t(lang, 'byok_steps_description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ProviderKind)}>
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1">
                <TabsTrigger value="openai" className="relative text-xs sm:text-sm">
                  OpenAI
                  {getProvider("openai")?.test_passed && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="google" className="relative text-xs sm:text-sm">
                  Google AI
                  {getProvider("google")?.test_passed && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="anthropic" className="relative text-xs sm:text-sm">
                  Claude
                  {getProvider("anthropic")?.test_passed && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="deepseek" className="relative text-xs sm:text-sm">
                  DeepSeek
                  {getProvider("deepseek")?.test_passed && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-500 rounded-full" />
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="openai">{renderProviderTab("openai")}</TabsContent>

              <TabsContent value="google">{renderProviderTab("google")}</TabsContent>

              <TabsContent value="anthropic">{renderProviderTab("anthropic")}</TabsContent>

              <TabsContent value="deepseek">{renderProviderTab("deepseek")}</TabsContent>
            </Tabs>
          </CardContent>
        </Card>

      {/* Ollama (Local Models) Card */}
      <Card className="glass-panel-soft hover:shadow-md transition-shadow">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            {t(lang, 'byok_ollama_local_models')}
          </CardTitle>
          <CardDescription>
            {t(lang, 'byok_ollama_local_models_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Step 1: Connection URL */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  ollamaWorkflow.urlSaved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {ollamaWorkflow.urlSaved ? <Check className="h-3 w-3" /> : "1"}
                </div>
                <Label className="text-sm font-medium">
                  {t(lang, 'byok_connection_url')}
                  <span className="ml-2 text-muted-foreground font-normal">http://localhost:11434</span>
                </Label>
              </div>

              {ollamaWorkflow.urlSaved ? (
                <div className="flex items-center gap-2 p-3 bg-accent/30 rounded-lg ml-8">
                  <div className="flex-1">
                    <p className="font-mono text-sm">{ollamaUrl}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setOllamaDeleteConfirm(true)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 ml-8">
                  <Input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={ollamaUrlInput}
                    onChange={(e) => setOllamaUrlInput(e.target.value)}
                    className="flex-1 font-mono"
                  />
                  <Button
                    onClick={handleSaveOllamaUrl}
                    disabled={!ollamaUrlInput?.trim() || ollamaSaving}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {ollamaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                </div>
              )}
              <p className="text-xs text-muted-foreground ml-8">
                {t(lang, 'byok_ollama_url_hint')}
              </p>
            </div>

            {/* Step 2: Fetch Models */}
            {ollamaWorkflow.urlSaved && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    ollamaWorkflow.modelsFetched ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {ollamaWorkflow.modelsFetched ? <Check className="h-3 w-3" /> : "2"}
                  </div>
                  <Label className="text-sm font-medium">
                    {t(lang, 'byok_fetch_local_models')}
                  </Label>
                </div>
                <div className="flex items-center gap-3 ml-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFetchOllamaModels}
                    disabled={ollamaFetching}
                  >
                    {ollamaFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    {t(lang, 'byok_fetch_models')}
                  </Button>
                  {ollamaFetchResult && (
                    <span className={`text-sm ${ollamaFetchResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                      {ollamaFetchResult.ok ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-4 w-4" />
                          {t(lang, 'byok_models_count').replace('{count}', String(ollamaFetchResult.count ?? 0))}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <X className="h-4 w-4" />
                          {ollamaFetchResult.error}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Select Models */}
            {ollamaWorkflow.urlSaved && ollamaWorkflow.modelsFetched && ollamaModels.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    ollamaWorkflow.modelsSelected ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {ollamaWorkflow.modelsSelected ? <Check className="h-3 w-3" /> : "3"}
                  </div>
                  <Label className="text-sm font-medium">
                    {t(lang, 'byok_select_models')}
                    {ollamaSelectedModels.size > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {ollamaSelectedModels.size} {t(lang, 'byok_selected')}
                      </Badge>
                    )}
                  </Label>
                </div>
                <div className="ml-8">
                  <ScrollArea className="h-48 rounded-md border p-2">
                    <div className="space-y-1">
                      {ollamaModels.map((model) => (
                        <div
                          key={model.model_key}
                          className={cn(
                            "flex items-center gap-3 py-1.5 px-2 rounded text-sm",
                            "hover:bg-accent/50"
                          )}
                        >
                          <Checkbox
                            id={`ollama-${model.model_key}`}
                            checked={ollamaSelectedModels.has(model.model_key)}
                            onCheckedChange={(next) => handleToggleOllamaModel(model.model_key, !!next)}
                          />
                          <label
                            htmlFor={`ollama-${model.model_key}`}
                            className="flex-1 flex items-center justify-between cursor-pointer"
                          >
                            <span className="font-mono">{model.model_key}</span>
                            <span className="text-muted-foreground text-xs max-w-[200px] truncate">
                              {model.description || model.display_name}
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t(lang, 'byok_first_model_for_test')}
                  </p>
                </div>
              </div>
            )}

            {/* Step 4: Test Connection */}
            {ollamaWorkflow.urlSaved && ollamaWorkflow.modelsSelected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    ollamaWorkflow.testPassed ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {ollamaWorkflow.testPassed ? <Check className="h-3 w-3" /> : "4"}
                  </div>
                  <Label className="text-sm font-medium">
                    {t(lang, 'byok_test_connection')}
                  </Label>
                </div>
                <div className="flex items-center gap-3 ml-8">
                  <Button
                    variant={ollamaWorkflow.testPassed ? "outline" : "default"}
                    size="sm"
                    onClick={handleTestOllama}
                    disabled={ollamaTesting || ollamaSelectedModels.size === 0}
                  >
                    {ollamaTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    {t(lang, 'byok_test_connection')}
                  </Button>
                  {ollamaTestResult && (
                    <span className={`text-sm ${ollamaTestResult.success ? "text-emerald-600" : "text-destructive"}`}>
                      {ollamaTestResult.success ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4" />
                          {ollamaTestResult.message}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          {ollamaTestResult.message}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {!ollamaWorkflow.testPassed && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 ml-8">
                    {t(lang, 'byok_enable_ollama_requires_test')}
                  </p>
                )}
              </div>
            )}

            {/* Step 5: Enable */}
            {ollamaWorkflow.urlSaved && ollamaWorkflow.testPassed && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                  </div>
                  <Label className="text-sm font-medium">
                    {t(lang, 'byok_enable_ollama')}
                  </Label>
                </div>
                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 ml-8">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t(lang, 'byok_enable_ollama_local_models')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t(lang, 'byok_enable_ollama_desc')}
                    </p>
                  </div>
                  <Switch
                    checked={ollamaProvider?.enabled || false}
                    onCheckedChange={handleToggleOllamaEnabled}
                  />
                </div>
                {ollamaProvider && (
                  <div className="flex items-center gap-2 flex-wrap ml-8">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      {t(lang, 'byok_test_passed')}
                    </span>
                    {ollamaSelectedModels.size > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs font-medium">
                        {t(lang, 'byok_models_enabled_count').replace('{count}', String(ollamaSelectedModels.size))}
                      </span>
                    )}
                    {ollamaProvider.enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs font-medium">
                        {t(lang, 'byok_enabled')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteKind} onOpenChange={(open) => !open && setDeleteKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(lang, 'byok_delete_api_key_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(lang, 'byok_delete_api_key_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(lang, 'shared_trees_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {t(lang, 'tree_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ollama delete confirmation dialog */}
      <AlertDialog open={ollamaDeleteConfirm} onOpenChange={(open) => !open && setOllamaDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(lang, 'byok_delete_ollama_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(lang, 'byok_delete_ollama_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t(lang, 'shared_trees_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOllama}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t(lang, 'tree_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
