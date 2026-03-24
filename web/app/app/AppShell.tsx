"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Plus, MoreHorizontal, Pencil, ChevronLeft, PanelLeftOpen, TreeDeciduous, FileJson, FileText, Trash2, Menu, Library, Search, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import TreeWorkspace from "./workspace/TreeWorkspace";
import { KnowledgePanel } from "./workspace/KnowledgePanel";
import { SearchChatsDialog } from "./workspace/SearchChatsDialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMyTrees } from "@/lib/hooks/useMyTrees";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "./settings/SettingsDialog";
import { t, normalizeLang, type Lang } from "@/lib/i18n";
import { EmailVerificationBanner } from "@/components/EmailVerificationBanner";
import { downloadTreeJson, downloadTreeMarkdown } from "./workspace/exportUtils";
import { activateWorkspace, listWorkspaces, type WorkspaceSummary } from "@/lib/api";
import {
  appShellQuotaPlanQueryOptions,
  deleteTreeById,
  renameTreeById,
} from "./settings/hooks/useSettingsApi";

const WORKSPACE_SELECTOR_ENABLED = (() => {
  const raw = (process.env.NEXT_PUBLIC_WORKSPACE_SELECTOR_ENABLED || "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
})();

interface AppShellProps {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    preferred_language?: string | null;
    emailVerified?: string | null;
    created_at?: string | null;
  };
  activePage?: "home" | "settings";
  initialTreeId?: string | null;
  initialNodeId?: string | null;
  children?: React.ReactNode;
  initialSettingsOpen?: boolean;
  /** T26-5: Force new tree session even without ?new=1 URL param */
  forceNewTreeSession?: boolean;
}

export default function AppShell({
  user,
  activePage: activePageProp = "home",
  initialTreeId = null,
  initialNodeId = null,
  children,
  initialSettingsOpen = false,
  forceNewTreeSession = false,
}: AppShellProps) {
  useStableAppHeightCssVar();
  useAppShellScrollLock();

  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mql = window.matchMedia('(pointer: coarse)');
    const update = () => setIsCoarsePointer(!!mql.matches);
    update();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', update);
      return () => mql.removeEventListener('change', update);
    }
    // Safari fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(update);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(update);
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { trees, isLoading, error, refetch, addTree, removeTree, updateTree, hasMore, loadMore, isLoadingMore } = useMyTrees();
  const { toast } = useToast();
  const desktopAutoLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const mobileAutoLoadSentinelRef = useRef<HTMLDivElement | null>(null);
  const activePage = activePageProp || "home";
  const sessionPreferredLanguage = (session?.user as any)?.preferred_language as string | undefined;
  const lang: Lang = normalizeLang(sessionPreferredLanguage ?? user.preferred_language);

  const planQuery = useQuery({
    ...appShellQuotaPlanQueryOptions(user.id),
    enabled: Boolean(user.id),
  });
  const currentPlan = planQuery.data?.plan ?? null;
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [searchChatsOpen, setSearchChatsOpen] = useState(false);
  // T-SIDEBAR-EARLY: Placeholder state for a tree being created (before server responds)
  const [creatingTreePlaceholder, setCreatingTreePlaceholder] = useState<{
    userMessage: string;
    placeholderId: string;
    treeId: string | null;
  } | null>(null);
  const showWorkspaceSelector =
    WORKSPACE_SELECTOR_ENABLED || currentPlan === 'team' || (Array.isArray(workspaces) && workspaces.length > 1);
  const shouldLoadWorkspaces = WORKSPACE_SELECTOR_ENABLED || currentPlan !== null;

  const planBadgeLabel = currentPlan === 'pro' ? 'PRO' : currentPlan === 'team' ? 'TEAM' : 'Free';

  useEffect(() => {
    if (!shouldLoadWorkspaces) return;
    let mounted = true;
    setIsLoadingWorkspaces(true);
    listWorkspaces({ userId: user.id })
      .then((res) => {
        if (!mounted) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setWorkspaces(rows);
        setActiveWorkspaceId(res?.active_workspace_id || null);
        if (typeof window !== "undefined" && typeof res?.active_workspace_id === "string" && res.active_workspace_id) {
          window.localStorage.setItem("omytree.activeWorkspaceId", res.active_workspace_id);
        }
      })
      .catch(() => {
        if (!mounted) return;
        setWorkspaces([]);
        setActiveWorkspaceId(null);
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingWorkspaces(false);
      });

    return () => {
      mounted = false;
    };
  }, [shouldLoadWorkspaces, user.id]);

  const handleWorkspaceChange = async (nextWorkspaceId: string) => {
    if (!showWorkspaceSelector) return;
    if (!nextWorkspaceId || nextWorkspaceId === activeWorkspaceId) return;
    if (isSwitchingWorkspace) return;
    setIsSwitchingWorkspace(true);
    try {
      const res = await activateWorkspace(nextWorkspaceId, { userId: user.id, workspaceId: nextWorkspaceId });
      const finalId = res?.active_workspace_id || nextWorkspaceId;
      setActiveWorkspaceId(finalId);
      setWorkspaces((prev) => prev.map((w) => ({ ...w, is_active: w.id === finalId })));
      if (typeof window !== "undefined") {
        window.localStorage.setItem("omytree.activeWorkspaceId", finalId);
        window.dispatchEvent(new CustomEvent("omytree:workspace-changed", { detail: { workspaceId: finalId } }));
      }
      // Force KnowledgePanel refresh when open by bumping ws param.
      const params = new URLSearchParams(searchParams.toString());
      params.set("ws", finalId);
      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
      toast({ title: t(lang, 'toast_workspace_switched') });
    } catch (err) {
      console.error("switch workspace failed", err);
      toast({ title: t(lang, 'toast_workspace_switch_failed'), variant: "destructive" });
    } finally {
      setIsSwitchingWorkspace(false);
    }
  };

  // Prefer live URL params; fall back to SSR-provided initial values for first render
  const selectedTreeId =
    activePage === "home" ? (searchParams.get("tree_id") ?? initialTreeId ?? null) : null;
  const selectedNodeId =
    activePage === "home" ? (searchParams.get("node") ?? initialNodeId ?? null) : null;
  // T26-5: Support forceNewTreeSession prop for direct /app access
  const isNewTreeSession =
    activePage === "home" &&
    (!selectedTreeId &&
      (forceNewTreeSession || searchParams.get("new") === "1" || searchParams.get("new_tree") === "1"));

  const workspaceUiEnabled = showWorkspaceSelector;
  const workspaceUiVisible = workspaceUiEnabled && (isLoadingWorkspaces || workspaces.length > 0);
  const desktopNewTreeTop = workspaceUiVisible ? "top-[112px]" : "top-[66px]";
  const desktopSearchTop = workspaceUiVisible ? "top-[158px]" : "top-[112px]";
  const desktopKnowledgeTop = workspaceUiVisible ? "top-[204px]" : "top-[158px]";
  const desktopSpacerHeight = workspaceUiVisible ? "h-[258px]" : "h-[212px]";
  const mobileNewTreeTop = workspaceUiVisible ? "top-[112px]" : "top-[66px]";
  const mobileSpacerHeight = workspaceUiVisible ? "h-[212px]" : "h-[166px]";

  // Delete tree dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [treeToDelete, setTreeToDelete] = useState<string | null>(null);
  const [isDeletingTree, setIsDeletingTree] = useState(false);

  // Inline rename state (Windows file-rename style)
  const [treeToRename, setTreeToRename] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [isRenamingTree, setIsRenamingTree] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameInFlightRef = useRef(false);
  const suppressRenameBlurRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | null>(null);
  const sidebarTransitionClass = useMemo(() => {
    // Avoid layout animation/jank during initial hydration when localStorage-driven
    // sidebar state is applied.
    if (sidebarCollapsed === null) return "transition-none";
    return "transition-[width] duration-180 ease-out motion-reduce:transition-none";
  }, [sidebarCollapsed]);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(initialSettingsOpen);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'models' | 'account' | 'billing' | 'data' | 'about' | undefined>(undefined);

  // Listen for openSettings custom event (from ModelPicker etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tab) {
        setSettingsInitialTab(detail.tab);
      } else {
        setSettingsInitialTab(undefined);
      }
      setSettingsOpen(true);
    };
    window.addEventListener('openSettings', handler);
    return () => window.removeEventListener('openSettings', handler);
  }, []);
  // T30: Mobile sidebar sheet state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("omytree.sidebarCollapsed");
    setSidebarCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || sidebarCollapsed === null) return;
    window.localStorage.setItem("omytree.sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!treeToRename) return;
    const frame = window.requestAnimationFrame(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [treeToRename]);

  const getUserInitial = () => {
    if (user.name) {
      return user.name.charAt(0).toUpperCase();
    }
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return "?";
  };

  const handleSignOut = () => {
    // Clear Ollama device-specific config on sign-out
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('omytree.ollamaBaseUrl');
    }
    signOut({ callbackUrl: "/" });
  };

  // T-SIDEBAR-EARLY: Use refs for event handler dependencies to avoid
  // re-registering listeners on every render. When listeners are in a useEffect
  // with unstable deps (refetch, trees), they get removed/re-added each render.
  // During tree-switch renders, the cleanup phase removes the old listener BEFORE
  // TreeWorkspace's effect dispatches the event, causing it to be missed.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const treesRef = useRef(trees);
  treesRef.current = trees;
  const addTreeRef = useRef(addTree);
  addTreeRef.current = addTree;
  const updateTreeRef = useRef(updateTree);
  updateTreeRef.current = updateTree;

  // T-SIDEBAR-EARLY: Listen for tree-creating / tree-create-failed / tree-created events.
  // Single effect with stable deps (empty array) — listeners are registered once and
  // never re-registered, eliminating the race condition with child-component effects.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCreating = (event: Event) => {
      const custom = event as CustomEvent;
      const detail = custom.detail || {};
      const placeholderId = typeof detail.placeholderId === "string" ? detail.placeholderId : "";
      const userMessage = typeof detail.userMessage === "string" ? detail.userMessage : "";
      const treeId = typeof detail.treeId === "string" ? detail.treeId : null;
      if (!placeholderId) return;

      setCreatingTreePlaceholder((prev) => {
        const isSamePlaceholder = prev?.placeholderId === placeholderId;
        const resolvedUserMessage = userMessage || (isSamePlaceholder ? prev?.userMessage : "");
        if (!resolvedUserMessage) return prev;
        return {
          placeholderId,
          userMessage: resolvedUserMessage,
          treeId: treeId || (isSamePlaceholder ? prev?.treeId ?? null : null),
        };
      });
    };
    const handleFailed = () => {
      setCreatingTreePlaceholder(null);
      // T-SWITCH-FIX: When a tree creation is aborted (e.g. by switching chats during
      // streaming), the tree may have been partially created on the server. Trigger a
      // delayed refetch so the tree appears in the sidebar list even if we never received
      // the tree ID on the client.
      setTimeout(() => {
        refetchRef.current();
      }, 2000);
    };
    const handleCreated = (event: Event) => {
      const custom = event as CustomEvent;
      const tree = custom.detail?.tree;
      if (tree?.id) {
        // Clear the creating placeholder now that the real tree is available
        setCreatingTreePlaceholder(null);
        const originalTitle = tree.title || tree.topic || "";
        addTreeRef.current(tree);
        // First refetch attempt after 3 seconds
        setTimeout(() => {
          refetchRef.current();
        }, 3000);
        // Second refetch attempt after 8 seconds if topic still looks like truncated text
        // This handles slow LLM topic generation
        setTimeout(() => {
          const currentTree = treesRef.current.find((t: any) => t.id === tree.id);
          // If title still looks like the original (possibly truncated) text, topic generation may be slow
          if (!currentTree || currentTree.title === originalTitle || currentTree.title.endsWith("...")) {
            refetchRef.current();
          }
        }, 8000);
      }
    };
    window.addEventListener("omytree:tree-creating", handleCreating as EventListener);
    window.addEventListener("omytree:tree-create-failed", handleFailed);
    window.addEventListener("omytree:tree-created", handleCreated as EventListener);
    const handleTreeUpdated = (event: Event) => {
      const custom = event as CustomEvent;
      const treeId = custom.detail?.treeId;
      const updated_at = custom.detail?.updated_at || new Date().toISOString();
      if (treeId) {
        const existsInLoadedList = treesRef.current.some((t: any) => t.id === treeId);
        if (existsInLoadedList) {
          updateTreeRef.current(treeId, { updated_at });
        } else {
          // The updated conversation may come from an older paginated page.
          // Refetch first page so server-side updated_at ordering brings it to the top.
          refetchRef.current();
        }
      }
    };
    window.addEventListener("omytree:tree-updated", handleTreeUpdated as EventListener);
    return () => {
      window.removeEventListener("omytree:tree-creating", handleCreating as EventListener);
      window.removeEventListener("omytree:tree-create-failed", handleFailed);
      window.removeEventListener("omytree:tree-created", handleCreated as EventListener);
      window.removeEventListener("omytree:tree-updated", handleTreeUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLoading || isLoadingMore || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const shouldLoad = entries.some((entry) => entry.isIntersecting);
        if (shouldLoad && !isLoadingMore && hasMore) {
          void loadMore();
        }
      },
      {
        root: null,
        rootMargin: '240px 0px 240px 0px',
        threshold: 0.01,
      },
    );

    const desktopSentinel = desktopAutoLoadSentinelRef.current;
    const mobileSentinel = mobileAutoLoadSentinelRef.current;
    if (desktopSentinel) observer.observe(desktopSentinel);
    if (mobileSentinel) observer.observe(mobileSentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, isLoadingMore, loadMore]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return "";
    }
  };

  // Time grouping for tree list (DeepSeek-style separators)
  const getTimeGroup = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(thisWeekStart.getDate() - today.getDay());
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      if (date >= today) {
        return t(lang, 'app_date_today');
      } else if (date >= yesterday) {
        return t(lang, 'app_date_yesterday');
      } else if (date >= thisWeekStart) {
        return t(lang, 'app_date_this_week');
      } else if (date >= lastWeekStart) {
        return t(lang, 'app_date_last_week');
      } else if (date >= thisMonthStart) {
        return t(lang, 'app_date_this_month');
      } else if (date >= lastMonthStart) {
        return t(lang, 'app_date_last_month');
      } else {
        // Format as YYYY-MM for older items
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
      }
    } catch {
      return '';
    }
  };

  // Group trees by time period
  const groupedTrees = trees.reduce<{ group: string; trees: typeof trees }[]>((acc, tree) => {
    const group = getTimeGroup(tree.updated_at);
    const lastGroup = acc[acc.length - 1];
    if (lastGroup && lastGroup.group === group) {
      lastGroup.trees.push(tree);
    } else {
      acc.push({ group, trees: [tree] });
    }
    return acc;
  }, []);

  // ── Knowledge panel (client-side view switch, no server round-trip) ──
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [knowledgeInitialBaseId, setKnowledgeInitialBaseId] = useState<string | null>(null);
  const [knowledgeInitialDocId, setKnowledgeInitialDocId] = useState<string | null>(null);

  // Initialise from URL on first mount (handles direct links / refresh)
  useEffect(() => {
    if (searchParams.get('panel') === 'knowledge') {
      setKnowledgeOpen(true);
      setKnowledgeInitialBaseId(searchParams.get('kb') || searchParams.get('base') || searchParams.get('baseId') || null);
      setKnowledgeInitialDocId(searchParams.get('doc') || searchParams.get('docId') || null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  const openKnowledgePanel = useCallback((baseId?: string | null, docId?: string | null) => {
    setKnowledgeOpen(true);
    setKnowledgeInitialBaseId(baseId ?? null);
    setKnowledgeInitialDocId(docId ?? null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('panel', 'knowledge');
      if (baseId) url.searchParams.set('kb', baseId);
      else url.searchParams.delete('kb');
      if (docId) url.searchParams.set('doc', docId);
      else url.searchParams.delete('doc');
      url.searchParams.delete('tree_id');
      url.searchParams.delete('node');
      url.searchParams.delete('new');
      url.searchParams.delete('new_tree');
      window.history.pushState(null, '', url.pathname + url.search);
    }
  }, []);

  const closeKnowledgePanel = useCallback(() => {
    setKnowledgeOpen(false);
    setKnowledgeInitialBaseId(null);
    setKnowledgeInitialDocId(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('panel');
      url.searchParams.delete('kb');
      url.searchParams.delete('base');
      url.searchParams.delete('baseId');
      url.searchParams.delete('doc');
      url.searchParams.delete('docId');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  // Listen for custom event from ChatMessageBubble ("open doc in knowledge")
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      openKnowledgePanel(detail?.kbId ?? null, detail?.docId ?? null);
    };
    window.addEventListener('omytree:open-knowledge', handler);
    return () => window.removeEventListener('omytree:open-knowledge', handler);
  }, [openKnowledgePanel]);

  // Sync with browser back/forward buttons (popstate)
  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('panel') === 'knowledge') {
        setKnowledgeOpen(true);
        setKnowledgeInitialBaseId(params.get('kb') || params.get('base') || null);
        setKnowledgeInitialDocId(params.get('doc') || params.get('docId') || null);
      } else {
        setKnowledgeOpen(false);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const isTreeActive = (treeId: string) => {
    return selectedTreeId === treeId;
  };

  const handleTreeClick = (treeId: string) => {
    if (knowledgeOpen) closeKnowledgePanel();
    router.push(`/app?tree_id=${treeId}`);
  };

  const handleCreatingTreePlaceholderClick = () => {
    const targetTreeId = creatingTreePlaceholder?.treeId;
    if (!targetTreeId) return;
    handleTreeClick(targetTreeId);
  };

  const handleCreateTree = async () => {
    if (knowledgeOpen) closeKnowledgePanel();
    router.push("/app?new=1");
  };

  const handleDeleteClick = (treeId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setTreeToDelete(treeId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!treeToDelete || !session?.user?.id) return;

    setIsDeletingTree(true);

    try {
      await deleteTreeById(treeToDelete, session.user.id);

      // Remove tree from list
      removeTree(treeToDelete);

      // If we're currently viewing this tree, navigate to new-tree mode
      if (selectedTreeId === treeToDelete) {
        router.push("/app?new=1");
      }

      toast({
        title: t(lang, 'toast_tree_deleted'),
        description: t(lang, 'toast_tree_deleted_desc'),
      });
    } catch (err) {
      console.error("Failed to delete tree:", err);
      toast({
        title: t(lang, 'toast_tree_delete_failed'),
        description: t(lang, 'toast_tree_delete_failed_desc'),
        variant: "destructive",
      });
    } finally {
      setIsDeletingTree(false);
      setDeleteDialogOpen(false);
      setTreeToDelete(null);
    }
  };

  const handleRenameClick = (treeId: string, currentTitle: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setTreeToRename(treeId);
    setRenameTitle(currentTitle);
  };

  const handleRenameCancel = (suppressBlur = false) => {
    if (isRenamingTree) return;
    if (suppressBlur) {
      suppressRenameBlurRef.current = true;
    }
    setTreeToRename(null);
    setRenameTitle("");
  };

  const handleRenameConfirm = async () => {
    if (!treeToRename || !session?.user?.id || renameInFlightRef.current) return;

    const renameTargetId = treeToRename;
    const trimmedTitle = renameTitle.trim();
    const originalTitle = trees.find((tree) => tree.id === renameTargetId)?.title.trim() || "";

    if (!trimmedTitle || trimmedTitle === originalTitle) {
      handleRenameCancel();
      return;
    }

    renameInFlightRef.current = true;
    setIsRenamingTree(true);

    try {
      const data = await renameTreeById(renameTargetId, session.user.id, trimmedTitle);

      // Update tree in local state
      updateTree(renameTargetId, {
        display_title: data.tree.display_title,
        title: data.tree.title,
      });

      toast({
        title: t(lang, 'toast_tree_renamed'),
        description: t(lang, 'toast_tree_renamed_desc'),
      });
      setTreeToRename(null);
      setRenameTitle("");
    } catch (err) {
      console.error("Failed to rename tree:", err);
      toast({
        title: t(lang, 'toast_tree_rename_failed'),
        description: t(lang, 'toast_tree_rename_failed_desc'),
        variant: "destructive",
      });
    } finally {
      renameInFlightRef.current = false;
      setIsRenamingTree(false);
    }
  };

  const handleRenameInputBlur = () => {
    if (suppressRenameBlurRef.current) {
      suppressRenameBlurRef.current = false;
      return;
    }
    if (isRenamingTree) return;
    void handleRenameConfirm();
  };

  const handleRenameInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleRenameConfirm();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleRenameCancel(true);
    }
  };

  return (
    <div
      className="flex flex-col bg-background overflow-hidden"
      style={{
        height: 'var(--app-height, 100dvh)',
        transform: 'translateY(var(--app-offset-top, 0px))',
      }}
    >
      {/* Email verification banner */}
      {!user.emailVerified && (
        <EmailVerificationBanner userEmail={user.email} userId={user.id} lang={lang} />
      )}

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {!isCoarsePointer && (
          <aside className={cn(
            "hidden md:flex flex-col border-r min-h-0",
            sidebarTransitionClass,
            "sidebar-dot-bg",
            sidebarCollapsed === null ? "opacity-0" : "opacity-100",
            sidebarCollapsed === null ? "w-64" : (sidebarCollapsed ? "w-14" : "w-64")
          )}>
          {/* T20-6: Always render expanded view on server/initial to avoid hydration mismatch */}
          {sidebarCollapsed === null ? (
            // Initial/SSR state - render expanded but invisible (opacity-0 above)
            <div className="p-4 flex flex-col h-full gap-3 min-h-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 px-1">
                  <TreeDeciduous className="h-4 w-4 text-muted-foreground" />
                  <div
                    className="select-none"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                  >
                    <img
                      src="/images/logo.png"
                      alt="oMyTree"
                      draggable={false}
                      className="h-5 w-auto select-none pointer-events-none"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => setSidebarCollapsed(true)}
                  title={t(lang, 'sidebar_collapse')}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-9"
                onClick={handleCreateTree}
                data-testid="start-new-tree"
              >
                <Plus className="h-4 w-4" />
                {t(lang, 'sidebar_new_tree')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 h-9 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchChatsOpen(true)}
              >
                <Search className="h-4 w-4" />
                {t(lang, 'sidebar_search_chats')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-9 mt-1"
                onClick={() => {
                  openKnowledgePanel();
                  setMobileSidebarOpen?.(false);
                }}
              >
                <Library className="h-4 w-4" />
                {t(lang, 'sidebar_knowledge_base')}
              </Button>
            </div>
          ) : sidebarCollapsed ? (
            <div className="flex flex-col items-center py-4 h-full">
              {/* Top section: Expand and new tree buttons */}
              <div className="flex flex-col items-center gap-4">
                {/* Expand button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setSidebarCollapsed(false)}
                  title={t(lang, 'sidebar_expand')}
                >
                  <PanelLeftOpen className="h-5 w-5" />
                </Button>

                {/* New tree button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={handleCreateTree}
                  data-testid="start-new-tree"
                  title={t(lang, 'sidebar_new_tree')}
                >
                  <Plus className="h-5 w-5" />
                </Button>

                {/* Search button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchChatsOpen(true)}
                  title={t(lang, 'sidebar_search_chats')}
                >
                  <Search className="h-5 w-5" />
                </Button>

                {/* Knowledge base button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => openKnowledgePanel()}
                  title={t(lang, 'sidebar_knowledge_base')}
                >
                  <Library className="h-5 w-5" />
                </Button>
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Bottom section: User controls */}
              <div className="flex flex-col items-center gap-2 pb-2">
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-full h-9 w-9" data-testid="user-menu-trigger">
                      <div className="flex items-center justify-center w-full h-full rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {getUserInitial()}
                      </div>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="start" sideOffset={8} className="rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)]" style={{ backdropFilter: 'blur(14px) saturate(120%)', WebkitBackdropFilter: 'blur(14px) saturate(120%)' }}>
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)} data-testid="open-settings">
                      {t(lang, 'user_menu_settings')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleSignOut}>
                      {t(lang, 'user_menu_signout')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col h-full min-h-0">
              {/* Floating header button - absolute positioned on top of dot background */}
              <div className="absolute top-2 left-2 right-2 z-20 apple-glass-capsule !rounded-xl !py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TreeDeciduous className="h-4 w-4 text-muted-foreground" />
                    <div
                      className="select-none"
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      <img
                        src="/images/logo.png"
                        alt="oMyTree"
                        draggable={false}
                        className="h-5 w-auto select-none pointer-events-none"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setSidebarCollapsed(true)}
                    title={t(lang, 'sidebar_collapse')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Floating new tree button - absolute positioned below header */}
              {workspaceUiVisible && (
                <div className="absolute top-[66px] left-2 right-2 z-20">
                  <div
                    className="apple-glass-capsule !rounded-xl !px-3 !py-2.5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)] transition-all duration-1000 ease-out"
                    style={{ backdropFilter: "blur(14px) saturate(120%)", WebkitBackdropFilter: "blur(14px) saturate(120%)" }}
                  >
                    <Select
                      value={activeWorkspaceId || ""}
                      onValueChange={handleWorkspaceChange}
                      disabled={isLoadingWorkspaces || isSwitchingWorkspace || !activeWorkspaceId}
                    >
                      <SelectTrigger className="h-9 border-0 bg-transparent px-0 py-0 focus:ring-0">
                        <SelectValue placeholder={t(lang, 'app_workspace_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.kind === "team" ? ws.name : `${ws.name} ${t(lang, 'app_workspace_personal_suffix')}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Floating new tree button - absolute positioned below header */}
              <div className={cn("absolute left-2 right-2 z-20", desktopNewTreeTop)}>
                <button
                  onClick={handleCreateTree}
                  data-testid="start-new-tree"
                  className="w-full h-10 flex items-center gap-2 apple-glass-capsule !rounded-xl hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.1)] transition-all duration-1000 ease-out text-sm font-medium text-foreground px-3"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  {t(lang, 'sidebar_new_tree')}
                </button>
              </div>

              {/* T20-SEARCH: Search button */}
              <div className={cn("absolute left-2 right-2 z-20", desktopSearchTop)}>
                <button
                  onClick={() => setSearchChatsOpen(true)}
                  className="w-full h-10 flex items-center gap-2 apple-glass-capsule !rounded-xl hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.1)] transition-all duration-1000 ease-out text-sm font-medium text-foreground px-3"
                >
                  <Search className="h-4 w-4 text-primary" />
                  {t(lang, 'sidebar_search_chats')}
                </button>
              </div>

              {/* Floating knowledge base button */}
              <div className={cn("absolute left-2 right-2 z-20", desktopKnowledgeTop)}>
                <button
                  onClick={() => openKnowledgePanel()}
                  className="w-full h-10 flex items-center gap-2 apple-glass-capsule !rounded-xl hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.1)] transition-all duration-1000 ease-out text-sm font-medium text-foreground px-3"
                >
                  <Library className="h-4 w-4 text-primary" />
                  {t(lang, 'sidebar_knowledge_base')}
                </button>
              </div>

              {/* Tree list - content scrolls beneath floating buttons */}
              <ScrollArea className="flex-1 px-1">
                {/* Spacer to push content below floating buttons initially, but allows scrolling up */}
                <div className={cn("w-full shrink-0", desktopSpacerHeight)} />
                {isLoading && (
                  <div className="space-y-2 px-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton
                        key={i}
                        className="h-14 rounded-xl"
                      />
                    ))}
                  </div>
                )}

                {!isLoading && error && (
                  <div className="px-3 py-4 text-xs text-destructive">
                    {t(lang, 'app_trees_load_failed')}
                  </div>
                )}

                {!isLoading && !error && trees.length === 0 && !creatingTreePlaceholder && (
                  <div className="px-4 py-8 flex flex-col items-center text-center">
                    <div className="p-4 rounded-2xl bg-muted/20 border border-dashed border-border/60 mb-4">
                      <TreeDeciduous className="h-10 w-10 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground/80 mb-1">
                      {t(lang, 'app_trees_empty_title')}
                    </p>
                    <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[180px]">
                      {t(lang, 'app_trees_empty_desc')}
                    </p>
                  </div>
                )}

                {/* T-SIDEBAR-EARLY: When creating but tree list is empty, show placeholder with "今天" header */}
                {!isLoading && !error && trees.length === 0 && creatingTreePlaceholder && (
                  <div className="space-y-0.5 px-1">
                    <div>
                      <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                        <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                          {t(lang, 'app_date_today')}
                        </span>
                      </div>
                      <div className="px-0">
                        <button
                          type="button"
                          onClick={handleCreatingTreePlaceholderClick}
                          disabled={!creatingTreePlaceholder.treeId}
                          title={creatingTreePlaceholder.treeId ? t(lang, 'app_tree_placeholder_back') : t(lang, 'app_tree_placeholder_pending')}
                          className={cn(
                            "group relative w-full rounded-xl bg-muted/80 border border-border animate-in fade-in slide-in-from-left-2 transition-colors",
                            creatingTreePlaceholder.treeId ? "cursor-pointer md:hover:bg-muted" : "cursor-wait"
                          )}
                          style={{ animationDuration: '0.25s' }}
                        >
                          <div className="w-full text-left px-3 py-2 pr-10 flex items-center gap-2.5">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.6s' }} />
                                <span className="absolute inset-[2px] rounded-full bg-emerald-500/30 animate-pulse" style={{ animationDuration: '1s' }} />
                                <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              </div>
                              <span
                                className="text-sm font-medium line-clamp-1 text-muted-foreground/80"
                                style={{
                                  background: 'linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 80%)',
                                  backgroundSize: '200% 100%',
                                  WebkitBackgroundClip: 'text',
                                  WebkitTextFillColor: 'transparent',
                                  animation: 'sidebarShimmer 2.5s ease-in-out infinite',
                                }}
                              >
                                {creatingTreePlaceholder.userMessage.length > 30
                                  ? creatingTreePlaceholder.userMessage.slice(0, 30) + '…'
                                  : creatingTreePlaceholder.userMessage}
                              </span>
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!isLoading && !error && trees.length > 0 && (
                  <div className="space-y-0.5 px-1">
                    {groupedTrees.map((section, sectionIndex) => (
                      <div key={section.group || sectionIndex}>
                        {/* Time group separator */}
                        {section.group && (
                          <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                            <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                              {section.group}
                            </span>
                          </div>
                        )}
                        {/* T-SIDEBAR-EARLY: Placeholder inside first group when creating */}
                        {sectionIndex === 0 && creatingTreePlaceholder && (
                          <div className="px-0 mb-0.5">
                            <button
                              type="button"
                              onClick={handleCreatingTreePlaceholderClick}
                              disabled={!creatingTreePlaceholder.treeId}
                              title={creatingTreePlaceholder.treeId ? t(lang, 'app_tree_placeholder_back') : t(lang, 'app_tree_placeholder_pending')}
                              className={cn(
                                "group relative w-full rounded-xl bg-muted/80 border border-border animate-in fade-in slide-in-from-left-2 transition-colors",
                                creatingTreePlaceholder.treeId ? "cursor-pointer md:hover:bg-muted" : "cursor-wait"
                              )}
                              style={{ animationDuration: '0.25s' }}
                            >
                              <div className="w-full text-left px-3 py-2 pr-10 flex items-center gap-2.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                    <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.6s' }} />
                                    <span className="absolute inset-[2px] rounded-full bg-emerald-500/30 animate-pulse" style={{ animationDuration: '1s' }} />
                                    <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  </div>
                                  <span
                                    className="text-sm font-medium line-clamp-1 text-muted-foreground/80"
                                    style={{
                                      background: 'linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 80%)',
                                      backgroundSize: '200% 100%',
                                      WebkitBackgroundClip: 'text',
                                      WebkitTextFillColor: 'transparent',
                                      animation: 'sidebarShimmer 2.5s ease-in-out infinite',
                                    }}
                                  >
                                    {creatingTreePlaceholder.userMessage.length > 30
                                      ? creatingTreePlaceholder.userMessage.slice(0, 30) + '…'
                                      : creatingTreePlaceholder.userMessage}
                                  </span>
                                </div>
                              </div>
                            </button>
                          </div>
                        )}
                        {/* Trees in this group */}
                        {section.trees.map((tree, treeIndex) => {
                          const isActive = isTreeActive(tree.id);
                          const isEditing = treeToRename === tree.id;
                          const animIndex = sectionIndex * 3 + treeIndex;
                          return (
                            <div
                              key={tree.id}
                              className={cn(
                                "group relative rounded-xl",
                                "md:hover:bg-muted/60 transition-all duration-200",
                                "animate-in fade-in slide-in-from-left-2",
                                isActive && "bg-muted/80 border border-border"
                              )}
                              style={{ animationDelay: `${Math.min(animIndex * 30, 150)}ms`, animationFillMode: 'backwards' }}
                            >
                              {isEditing ? (
                                <div className="px-3 py-1.5 pr-10">
                                  <Input
                                    ref={renameInputRef}
                                    value={renameTitle}
                                    onChange={(e) => setRenameTitle(e.target.value)}
                                    onBlur={handleRenameInputBlur}
                                    onKeyDown={handleRenameInputKeyDown}
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={isRenamingTree}
                                    maxLength={100}
                                    aria-label={t(lang, 'tree_rename_label')}
                                    className="h-7 rounded-sm border-primary/60 bg-background px-2 text-sm font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-0"
                                  />
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleTreeClick(tree.id)}
                                  className="w-full text-left px-3 py-2 pr-10"
                                >
                                  <span className="text-sm font-medium line-clamp-2" title={tree.title}>
                                    {tree.title}
                                  </span>
                                </button>
                              )}

                              {/* Three-dot menu */}
                              <div className={cn(
                                "absolute right-2 top-1.5 transition-opacity duration-100",
                                isEditing && "opacity-0 pointer-events-none"
                              )}>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    side="left"
                                    align="start"
                                    sideOffset={8}
                                    className="w-52 rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)] data-[state=closed]:animate-none"
                                    onCloseAutoFocus={(event) => {
                                      if (treeToRename === tree.id) {
                                        event.preventDefault();
                                      }
                                    }}
                                  >
                                    <DropdownMenuItem
                                      onClick={(e) => handleRenameClick(tree.id, tree.title, e)}
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      {t(lang, 'tree_rename')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await downloadTreeJson(tree.id, session?.user?.id);
                                          toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_json_desc') });
                                        } catch (err) {
                                          console.error('export json failed', err);
                                          toast({ title: t(lang, 'toast_export_failed'), variant: 'destructive' });
                                        }
                                      }}
                                    >
                                      <FileJson className="h-4 w-4 mr-2" />
                                      {t(lang, 'export_json')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          await downloadTreeMarkdown(tree.id, session?.user?.id);
                                          toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_md_desc') });
                                        } catch (err) {
                                          console.error('export md failed', err);
                                          toast({ title: t(lang, 'toast_export_failed'), variant: 'destructive' });
                                        }
                                      }}
                                    >
                                      <FileText className="h-4 w-4 mr-2" />
                                      {t(lang, 'export_markdown')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={(e) => handleDeleteClick(tree.id, e)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      {t(lang, 'tree_delete')}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}

                {/* Auto load more sentinel (desktop) */}
                {!isLoading && hasMore && (
                  <div ref={desktopAutoLoadSentinelRef} className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {isLoadingMore ? (
                      <span className="inline-flex items-center justify-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t(lang, 'app_trees_loading_more')}
                      </span>
                    ) : t(lang, 'app_trees_autoload_hint')}
                  </div>
                )}

                <div className="h-[88px] w-full shrink-0" />
              </ScrollArea>

              {/* Bottom user profile section */}
              <div className="absolute bottom-2 left-2 right-2 z-20">
                <div className="apple-glass-capsule !rounded-xl !px-3 !py-2.5 shadow-[0_8px_40px_rgba(0,0,0,0.12)] hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)] transition-all duration-1000 ease-out" style={{ backdropFilter: 'blur(14px) saturate(120%)', WebkitBackdropFilter: 'blur(14px) saturate(120%)' }}>
                  <div className="flex items-center gap-2">
                    {isCoarsePointer ? (
                      <div className="relative flex-1" data-testid="user-menu-trigger">
                        <button className="w-full flex items-center gap-2 rounded-lg" type="button">
                          {/* Avatar */}
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                            {getUserInitial()}
                          </div>
                          {/* Name and badge */}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">
                                {user.name || user.email?.split('@')[0] || 'User'}
                              </span>
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {planBadgeLabel}
                              </span>
                            </div>
                          </div>
                        </button>
                        <select
                          aria-label={t(lang, 'user_menu_settings')}
                          className="absolute inset-0 opacity-0"
                          defaultValue=""
                          onChange={(e) => {
                            const v = e.target.value;
                            // reset so same option can be chosen again
                            e.target.selectedIndex = 0;
                            if (v === 'settings') setSettingsOpen(true);
                            if (v === 'signout') handleSignOut();
                          }}
                        >
                          <option value="" disabled>
                            {user.name || user.email?.split('@')[0] || 'User'}
                          </option>
                          <option value="settings">{t(lang, 'user_menu_settings')}</option>
                          <option value="signout">{t(lang, 'user_menu_signout')}</option>
                        </select>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex-1 flex items-center gap-2 rounded-lg" data-testid="user-menu-trigger">
                            {/* Avatar */}
                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                              {getUserInitial()}
                            </div>
                            {/* Name and badge */}
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">
                                  {user.name || user.email?.split('@')[0] || 'User'}
                                </span>
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                  {planBadgeLabel}
                                </span>
                              </div>
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-52 rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)]" style={{ backdropFilter: 'blur(14px) saturate(120%)', WebkitBackdropFilter: 'blur(14px) saturate(120%)' }}>
                          <DropdownMenuItem onClick={() => setSettingsOpen(true)} data-testid="open-settings">
                            {t(lang, 'user_menu_settings')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleSignOut}>
                            {t(lang, 'user_menu_signout')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <ThemeToggle className="h-7 w-7" />
                  </div>
                </div>
              </div>
            </div>
          )}
          </aside>
        )}

        {/* T30: Mobile sidebar Sheet */}
        <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0 sidebar-dot-bg">
            <SheetHeader className="sr-only">
              <SheetTitle>Sidebar</SheetTitle>
              <SheetDescription>Mobile navigation sidebar</SheetDescription>
            </SheetHeader>
            <div className="relative flex flex-col h-full min-h-0">
              {/* Floating header - match desktop sidebar */}
              <div className="absolute top-2 left-2 right-2 z-20 apple-glass-capsule !py-2.5 transform-gpu">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TreeDeciduous className="h-4 w-4 text-muted-foreground" />
                    <div
                      className="select-none"
                      onContextMenu={(e) => e.preventDefault()}
                      onDragStart={(e) => e.preventDefault()}
                    >
                      <img
                        src="/images/logo.png"
                        alt="oMyTree"
                        draggable={false}
                        className="h-5 w-auto select-none pointer-events-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating new tree button - match desktop sidebar */}
              {workspaceUiVisible && (
                <div className="absolute top-[66px] left-2 right-2 z-20">
                  <div
                    className="apple-glass-capsule !rounded-xl !px-3 !py-2.5 shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
                    style={{ backdropFilter: "blur(14px) saturate(120%)", WebkitBackdropFilter: "blur(14px) saturate(120%)" }}
                  >
                    <Select
                      value={activeWorkspaceId || ""}
                      onValueChange={(v) => {
                        handleWorkspaceChange(v);
                        setMobileSidebarOpen(false);
                      }}
                      disabled={isLoadingWorkspaces || isSwitchingWorkspace || !activeWorkspaceId}
                    >
                      <SelectTrigger className="h-9 border-0 bg-transparent px-0 py-0 focus:ring-0">
                        <SelectValue placeholder={t(lang, 'app_workspace_placeholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.kind === "team" ? ws.name : `${ws.name} ${t(lang, 'app_workspace_personal_suffix')}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Floating new tree button - match desktop sidebar */}
              <div className={cn("absolute left-2 right-2 z-20", mobileNewTreeTop)}>
                <button
                  onClick={() => {
                    handleCreateTree();
                    setMobileSidebarOpen(false);
                  }}
                  data-testid="start-new-tree"
                  className="w-full flex items-center gap-2 apple-glass-capsule hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.1)] transition-all duration-1000 ease-out text-sm font-medium text-foreground transform-gpu"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  {t(lang, 'sidebar_new_tree')}
                </button>
              </div>

              {/* Tree list - content scrolls beneath floating buttons */}
              <ScrollArea className="flex-1 px-1">
                {/* Spacer to push content below floating buttons initially, but allows scrolling up */}
                <div className={cn("w-full shrink-0", mobileSpacerHeight)} />
              {isLoading && (
                <div className="space-y-2 p-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-xl" />
                  ))}
                </div>
              )}

              {!isLoading && error && (
                <div className="px-4 py-4 text-xs text-destructive">
                  {t(lang, 'app_trees_load_failed')}
                </div>
              )}

              {!isLoading && !error && trees.length === 0 && !creatingTreePlaceholder && (
                <div className="px-4 py-4 text-xs text-muted-foreground">
                  {t(lang, 'app_trees_empty_title')}
                  <br />
                  {t(lang, 'app_trees_empty_desc')}
                </div>
              )}

              {/* T-SIDEBAR-EARLY: When creating but tree list is empty (mobile) */}
              {!isLoading && !error && trees.length === 0 && creatingTreePlaceholder && (
                <div className="space-y-0.5 px-1">
                  <div>
                    <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                      <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                        {t(lang, 'app_date_today')}
                      </span>
                    </div>
                    <div className="px-0">
                      <button
                        type="button"
                        onClick={() => {
                          handleCreatingTreePlaceholderClick();
                          if (creatingTreePlaceholder.treeId) {
                            setMobileSidebarOpen(false);
                          }
                        }}
                        disabled={!creatingTreePlaceholder.treeId}
                        title={creatingTreePlaceholder.treeId ? t(lang, 'app_tree_placeholder_back') : t(lang, 'app_tree_placeholder_pending')}
                        className={cn(
                          "group relative w-full rounded-xl bg-muted/80 border border-border animate-in fade-in slide-in-from-left-2 transition-colors",
                          creatingTreePlaceholder.treeId ? "cursor-pointer" : "cursor-wait"
                        )}
                        style={{ animationDuration: '0.25s' }}
                      >
                        <div className="w-full text-left px-3 py-2 pr-10 flex items-center gap-2.5">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                              <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.6s' }} />
                              <span className="absolute inset-[2px] rounded-full bg-emerald-500/30 animate-pulse" style={{ animationDuration: '1s' }} />
                              <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            </div>
                            <span
                              className="text-sm font-medium line-clamp-1 text-muted-foreground/80"
                              style={{
                                background: 'linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 80%)',
                                backgroundSize: '200% 100%',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                animation: 'sidebarShimmer 2.5s ease-in-out infinite',
                              }}
                            >
                              {creatingTreePlaceholder.userMessage.length > 24
                                ? creatingTreePlaceholder.userMessage.slice(0, 24) + '…'
                                : creatingTreePlaceholder.userMessage}
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!isLoading && !error && trees.length > 0 && (
                <div className="space-y-0.5 px-1">
                  {groupedTrees.map((section, sectionIndex) => (
                    <div key={section.group || sectionIndex}>
                      {/* Time group separator */}
                      {section.group && (
                        <div className="flex items-center gap-2 px-2 pt-3 pb-1.5">
                          <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                            {section.group}
                          </span>
                        </div>
                      )}
                      {/* T-SIDEBAR-EARLY: Placeholder inside first group when creating (mobile) */}
                      {sectionIndex === 0 && creatingTreePlaceholder && (
                        <div className="px-0 mb-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              handleCreatingTreePlaceholderClick();
                              if (creatingTreePlaceholder.treeId) {
                                setMobileSidebarOpen(false);
                              }
                            }}
                            disabled={!creatingTreePlaceholder.treeId}
                            title={creatingTreePlaceholder.treeId ? t(lang, 'app_tree_placeholder_back') : t(lang, 'app_tree_placeholder_pending')}
                            className={cn(
                              "group relative w-full rounded-xl bg-muted/80 border border-border animate-in fade-in slide-in-from-left-2 transition-colors",
                              creatingTreePlaceholder.treeId ? "cursor-pointer" : "cursor-wait"
                            )}
                            style={{ animationDuration: '0.25s' }}
                          >
                            <div className="w-full text-left px-3 py-2 pr-10 flex items-center gap-2.5">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className="relative flex items-center justify-center w-4 h-4 shrink-0">
                                  <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.6s' }} />
                                  <span className="absolute inset-[2px] rounded-full bg-emerald-500/30 animate-pulse" style={{ animationDuration: '1s' }} />
                                  <span className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                </div>
                                <span
                                  className="text-sm font-medium line-clamp-1 text-muted-foreground/80"
                                  style={{
                                    background: 'linear-gradient(90deg, currentColor 0%, currentColor 40%, transparent 80%)',
                                    backgroundSize: '200% 100%',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    animation: 'sidebarShimmer 2.5s ease-in-out infinite',
                                  }}
                                >
                                  {creatingTreePlaceholder.userMessage.length > 24
                                    ? creatingTreePlaceholder.userMessage.slice(0, 24) + '…'
                                    : creatingTreePlaceholder.userMessage}
                                </span>
                              </div>
                            </div>
                          </button>
                        </div>
                      )}
                      {/* Trees in this group */}
                      {section.trees.map((tree) => {
                        const isActive = isTreeActive(tree.id);
                        const isEditing = treeToRename === tree.id;
                        return (
                          <div
                            key={tree.id}
                            className={cn(
                              "group relative rounded-xl",
                              "transition-all duration-200",
                              isActive && "bg-muted/80 border border-border"
                            )}
                          >
                            {isEditing ? (
                              <div className="px-3 py-1.5 pr-10">
                                <Input
                                  ref={renameInputRef}
                                  value={renameTitle}
                                  onChange={(e) => setRenameTitle(e.target.value)}
                                  onBlur={handleRenameInputBlur}
                                  onKeyDown={handleRenameInputKeyDown}
                                  onClick={(e) => e.stopPropagation()}
                                  disabled={isRenamingTree}
                                  maxLength={100}
                                  aria-label={t(lang, 'tree_rename_label')}
                                  className="h-7 rounded-sm border-primary/60 bg-background px-2 text-sm font-medium shadow-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-0"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  handleTreeClick(tree.id);
                                  setMobileSidebarOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 pr-10"
                              >
                                <span className="text-sm font-medium line-clamp-2" title={tree.title}>
                                  {tree.title}
                                </span>
                              </button>
                            )}

                            {/* Three-dot menu */}
                            <div className={cn(
                              "absolute right-2 top-1.5 transition-opacity duration-100",
                              isEditing && "opacity-0 pointer-events-none"
                            )}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-60 hover:opacity-100 transition-opacity"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  side="left"
                                  align="start"
                                  sideOffset={8}
                                  className="w-52 rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)] data-[state=closed]:animate-none"
                                  onCloseAutoFocus={(event) => {
                                    if (treeToRename === tree.id) {
                                      event.preventDefault();
                                    }
                                  }}
                                >
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      handleRenameClick(tree.id, tree.title, e);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    {t(lang, 'tree_rename')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await downloadTreeJson(tree.id, session?.user?.id);
                                        toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_json_desc') });
                                      } catch (err) {
                                        console.error('export json failed', err);
                                        toast({ title: t(lang, 'toast_export_failed'), variant: 'destructive' });
                                      }
                                      setMobileSidebarOpen(false);
                                    }}
                                  >
                                    <FileJson className="h-4 w-4 mr-2" />
                                    {t(lang, 'export_json')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        await downloadTreeMarkdown(tree.id, session?.user?.id);
                                        toast({ title: t(lang, 'toast_exported'), description: t(lang, 'toast_export_md_desc') });
                                      } catch (err) {
                                        console.error('export md failed', err);
                                        toast({ title: t(lang, 'toast_export_failed'), variant: 'destructive' });
                                      }
                                      setMobileSidebarOpen(false);
                                    }}
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    {t(lang, 'export_markdown')}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={(e) => {
                                      handleDeleteClick(tree.id, e);
                                      setMobileSidebarOpen(false);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t(lang, 'tree_delete')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Auto load more sentinel (mobile) */}
              {!isLoading && hasMore && (
                <div ref={mobileAutoLoadSentinelRef} className="px-3 py-2 text-center text-xs text-muted-foreground">
                  {isLoadingMore ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t(lang, 'app_trees_loading_more')}
                    </span>
                  ) : t(lang, 'app_trees_autoload_hint')}
                </div>
              )}
            </ScrollArea>

              {/* Bottom user profile section - floating card like desktop */}
              <div className="absolute bottom-2 left-2 right-2 z-20">
                <div className="apple-glass-capsule hover:border-emerald-500 dark:hover:border-emerald-400 hover:shadow-[0_8px_40px_rgba(16,185,129,0.12)] transition-all duration-1000 ease-out transform-gpu" style={{ backdropFilter: 'blur(14px) saturate(120%)', WebkitBackdropFilter: 'blur(14px) saturate(120%)' }}>
                  <div className="flex items-center gap-2">
                    {isCoarsePointer ? (
                      <div className="relative flex-1" data-testid="user-menu-trigger">
                        <button className="w-full flex items-center gap-2 rounded-lg" type="button">
                          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                            {getUserInitial()}
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm font-medium truncate">
                                {user.name || user.email?.split('@')[0] || 'User'}
                              </span>
                              <span className="text-[11px] text-muted-foreground shrink-0">{planBadgeLabel}</span>
                            </div>
                          </div>
                        </button>
                        <select
                          aria-label={t(lang, 'user_menu_settings')}
                          className="absolute inset-0 opacity-0"
                          defaultValue=""
                          onChange={(e) => {
                            const v = e.target.value;
                            e.target.selectedIndex = 0;
                            if (v === 'settings') {
                              setSettingsOpen(true);
                              setMobileSidebarOpen(false);
                            }
                            if (v === 'signout') handleSignOut();
                          }}
                        >
                          <option value="" disabled>
                            {user.name || user.email?.split('@')[0] || 'User'}
                          </option>
                          <option value="settings">{t(lang, 'user_menu_settings')}</option>
                          <option value="signout">{t(lang, 'user_menu_signout')}</option>
                        </select>
                      </div>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="flex-1 flex items-center gap-2 rounded-lg"
                            data-testid="user-menu-trigger"
                          >
                            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                              {getUserInitial()}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-sm font-medium truncate">
                                  {user.name || user.email?.split('@')[0] || 'User'}
                                </span>
                                <span className="text-[11px] text-muted-foreground shrink-0">{planBadgeLabel}</span>
                              </div>
                            </div>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          side="top"
                          align="start"
                          sideOffset={8}
                          className="w-52 rounded-xl apple-glass shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
                        >
                          <DropdownMenuItem onClick={() => { setSettingsOpen(true); setMobileSidebarOpen(false); }} data-testid="open-settings">
                            {t(lang, 'user_menu_settings')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleSignOut}>
                            {t(lang, 'user_menu_signout')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    <div onClick={(e) => e.stopPropagation()}>
                      <ThemeToggle className="h-7 w-7" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* Mobile sidebar trigger - only for non-chat pages.
              Chat page integrates this into the top capsule toolbar. */}
          {activePage !== "home" && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "absolute top-3 left-3 z-40 h-9 w-9 glass-panel-soft shadow-sm",
                !isCoarsePointer && "md:hidden"
              )}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open sidebar</span>
            </Button>
          )}

          {activePage !== "home" ? (
            <div className="h-full w-full">{children}</div>
          ) : knowledgeOpen ? (
            <div className="h-full w-full">
              <KnowledgePanel
                lang={lang}
                userId={user.id}
                initialBaseId={knowledgeInitialBaseId}
                initialDocId={knowledgeInitialDocId}
                onClose={() => {
                  closeKnowledgePanel();
                  router.push('/app');
                }}
              />
            </div>
          ) : (
            <div className="h-full w-full">
              <TreeWorkspace
                layoutVariant="embedded"
                initialTreeId={selectedTreeId}
                initialNodeId={selectedNodeId}
                initialNewTreeSession={isNewTreeSession}
                onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Delete Tree Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(lang, 'tree_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(lang, 'tree_delete_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingTree}>{t(lang, 'shared_trees_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeletingTree}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingTree ? "..." : t(lang, 'tree_delete_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SearchChatsDialog
        open={searchChatsOpen}
        onOpenChange={setSearchChatsOpen}
        trees={trees}
        lang={lang}
        onSelectTree={(id) => {
          // App expects `tree_id` (not `treeId`). Preserve unrelated params (e.g. ws/panel)
          // but clear node/new flags so the selected conversation loads immediately.
          const params = new URLSearchParams(searchParams.toString());
          params.set('tree_id', id);
          params.delete('node');
          params.delete('node_id');
          params.delete('evidence');
          params.delete('evidence_id');
          params.delete('new');
          params.delete('new_tree');
          router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
          setMobileSidebarOpen(false);
          // Small delay to let navigation happen before cleaning up
          setTimeout(() => setSearchChatsOpen(false), 200);
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        initialTab={settingsInitialTab}
        onOpenChange={(next) => {
          setSettingsOpen(next);
          if (!next) {
            setSettingsInitialTab(undefined);
            if (pathname === "/app/settings") {
              router.replace("/app");
            }
          }
        }}
        user={user}
      />

    </div>
  );
}

function useAppShellScrollLock() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("app-shell");
    body.classList.add("app-shell");
    return () => {
      root.classList.remove("app-shell");
      body.classList.remove("app-shell");
    };
  }, []);
}

// Keep viewport height stable on mobile (iOS address bar / keyboard)
// by tracking visualViewport height and exposing it via CSS var.
// This reduces scroll "jump" and phantom blank space issues.
function useStableAppHeightCssVar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const set = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      document.documentElement.style.setProperty('--app-height', `${Math.round(height)}px`);
      document.documentElement.style.setProperty('--app-offset-top', `${Math.round(offsetTop)}px`);
    };

    const setSoon = () => {
      // iOS Safari can report an intermediate viewport size right at focus/blur.
      // Scheduling a follow-up tick helps avoid getting stuck with a too-small height.
      set();
      window.setTimeout(set, 60);
      window.setTimeout(set, 250);
    };

    set();

    const vv = window.visualViewport;
    // Use passive: true for better scroll/resize performance on high-refresh-rate displays
    vv?.addEventListener('resize', set, { passive: true });
    vv?.addEventListener('scroll', set, { passive: true });
    window.addEventListener('resize', set, { passive: true });
    window.addEventListener('orientationchange', setSoon, { passive: true });
    window.addEventListener('focusin', setSoon, { passive: true });
    window.addEventListener('focusout', setSoon, { passive: true });
    window.addEventListener('pageshow', setSoon, { passive: true });

    return () => {
      vv?.removeEventListener('resize', set);
      vv?.removeEventListener('scroll', set);
      window.removeEventListener('resize', set);
      window.removeEventListener('orientationchange', setSoon);
      window.removeEventListener('focusin', setSoon);
      window.removeEventListener('focusout', setSoon);
      window.removeEventListener('pageshow', setSoon);
    };
  }, []);
}
