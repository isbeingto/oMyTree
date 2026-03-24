"use client";

import { useCallback, useEffect, useState } from "react";
import { useCustom } from "@refinedev/core";
import { AlertCircle, Search } from "lucide-react";
import { AdminHeader } from "../_components/AdminHeader";
import { AdminPage, AdminSection } from "../_components/AdminUi";

interface ContextMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ContextInspectorResult {
  node: {
    id: string;
    question: string;
    answer: string;
    intent?: string;
    topic_tag?: string;
  };
  tree: {
    id: string;
    name: string;
    context_profile: string;
    memory_scope: string;
  };
  context: {
    profile: string;
    scope: string;
    intent?: string;
    limits: {
      recentTurns: number;
      pathDepth: number;
      treeStoryLimit: number;
    };
  };
  layers: {
    tree_story?: string;
    core_facts?: string;
    path_background?: string;
    recent_dialogue?: string;
  };
  tree_summary?: string;
  messages: ContextMessage[];
}

export default function ContextInspectorPage() {
  const [treeId, setTreeId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [inspectEnabled, setInspectEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContextInspectorResult | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["messages"]));

  const inspectQuery = useCustom<ContextInspectorResult>({
    url: `/api/admin/context-inspector?tree_id=${encodeURIComponent(treeId)}&node_id=${encodeURIComponent(nodeId)}`,
    method: "get",
    queryOptions: {
      enabled: inspectEnabled,
      retry: false,
    },
  });

  const loading = inspectQuery.query.isFetching;

  useEffect(() => {
    if (!inspectEnabled) return;
    if (inspectQuery.query.isSuccess) {
      setResult(inspectQuery.result.data as ContextInspectorResult);
      setInspectEnabled(false);
    } else if (inspectQuery.query.isError) {
      const err = inspectQuery.query.error;
      setError(err instanceof Error ? err.message : "加载失败");
      setInspectEnabled(false);
    }
  }, [
    inspectEnabled,
    inspectQuery.query.isSuccess,
    inspectQuery.query.isError,
    inspectQuery.result.data,
    inspectQuery.query.error,
  ]);

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const handleInspect = useCallback(() => {
    if (!treeId.trim() || !nodeId.trim()) {
      setError("请输入 Tree ID 和 Node ID");
      return;
    }

    setError(null);
    setResult(null);
    setInspectEnabled(true);
  }, [treeId, nodeId]);

  return (
    <AdminPage>
      <AdminHeader title="Context 检查器" description="检查任意节点的上下文构建结果与最终消息序列" />

      <AdminSection title="查询参数" description="输入 Tree ID 与 Node ID 后发起检查">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Tree ID</label>
            <input
              type="text"
              value={treeId}
              onChange={(e) => setTreeId(e.target.value)}
              placeholder="59f308cc-a0de-48b1-bc56-abc1aa349ca3"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Node ID</label>
            <input
              type="text"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="node-uuid-here"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>
        <button
          onClick={handleInspect}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          <Search size={16} />
          {loading ? "检查中..." : "开始检查"}
        </button>
      </AdminSection>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-medium">执行失败</p>
              <p className="mt-0.5 text-sm">{error}</p>
            </div>
          </div>
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <CollapsibleSection
            title="节点信息"
            expanded={expandedSections.has("node")}
            onToggle={() => toggleSection("node")}
          >
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <InfoRow label="Node ID" value={result.node.id} mono />
              <InfoRow label="Intent" value={result.node.intent || "N/A"} />
              <InfoRow label="Topic Tag" value={result.node.topic_tag || "N/A"} />
              <div className="col-span-full">
                <p className="mb-1 text-slate-600 dark:text-slate-400">Question:</p>
                <p className="rounded-lg bg-slate-100 p-2 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                  {result.node.question}
                </p>
              </div>
              {result.node.answer ? (
                <div className="col-span-full">
                  <p className="mb-1 text-slate-600 dark:text-slate-400">Answer:</p>
                  <p className="rounded-lg bg-slate-100 p-2 whitespace-pre-wrap text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                    {result.node.answer.substring(0, 500)}
                    {result.node.answer.length > 500 ? "..." : ""}
                  </p>
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Tree 与 Context 配置"
            expanded={expandedSections.has("config")}
            onToggle={() => toggleSection("config")}
          >
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <InfoRow label="Tree ID" value={result.tree.id} mono />
              <InfoRow label="Tree Name" value={result.tree.name} />
              <InfoRow label="Context Profile" value={result.context.profile} badge />
              <InfoRow label="Memory Scope" value={result.context.scope} badge />
              <InfoRow label="Recent Turns" value={result.context.limits.recentTurns} />
              <InfoRow label="Path Depth" value={result.context.limits.pathDepth} />
              <InfoRow label="Tree Story Limit" value={result.context.limits.treeStoryLimit} />
            </div>
          </CollapsibleSection>

          {Object.keys(result.layers).length > 0 ? (
            <CollapsibleSection
              title="Context Layers"
              expanded={expandedSections.has("layers")}
              onToggle={() => toggleSection("layers")}
            >
              <div className="space-y-3">
                {Object.entries(result.layers).map(([key, content]) => (
                  <div key={key}>
                    <p className="mb-1 text-xs font-medium uppercase text-slate-600 dark:text-slate-400">{key}</p>
                    <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-900">
                      {content || "(empty)"}
                    </pre>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          ) : null}

          {result.tree_summary ? (
            <CollapsibleSection
              title="Tree Summary"
              expanded={expandedSections.has("summary")}
              onToggle={() => toggleSection("summary")}
            >
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs dark:bg-slate-900">
                {result.tree_summary}
              </pre>
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            title={`Context Messages (${result.messages.length})`}
            expanded={expandedSections.has("messages")}
            onToggle={() => toggleSection("messages")}
          >
            <div className="space-y-3">
              {result.messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg border p-3 ${
                    msg.role === "system"
                      ? "border-violet-200 bg-violet-50 dark:border-violet-800/60 dark:bg-violet-900/15"
                      : msg.role === "user"
                        ? "border-blue-200 bg-blue-50 dark:border-blue-800/60 dark:bg-blue-900/15"
                        : "border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-900/15"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-slate-700 dark:text-slate-300">{msg.role}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Message #{idx + 1}</span>
                  </div>
                  <pre className="whitespace-pre-wrap text-xs font-mono text-slate-800 dark:text-slate-200">{msg.content}</pre>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>
      ) : null}
    </AdminPage>
  );
}

function CollapsibleSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <AdminSection className="p-0" title={undefined} description={undefined}>
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between border-b border-slate-200/70 px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-900/45"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
        <svg
          className={`h-5 w-5 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded ? <div className="px-5 pb-5 pt-4">{children}</div> : null}
    </AdminSection>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
  badge = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  badge?: boolean;
}) {
  return (
    <div>
      <p className="mb-1 text-slate-600 dark:text-slate-400">{label}</p>
      {badge ? (
        <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          {value}
        </span>
      ) : (
        <p className={`text-slate-900 dark:text-slate-100 ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
      )}
    </div>
  );
}
