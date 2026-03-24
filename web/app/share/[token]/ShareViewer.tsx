"use client";

import { useMemo, useState } from 'react';
import { ChatPane } from '@/app/app/workspace/ChatPane';
import type { ChatMessage } from '@/app/app/workspace/ChatMessageBubble';
import type { Node } from '@/app/app/workspace/types';
import { isRootNode, shortNodeId, normalizeNodesForVisuals } from '@/app/app/workspace/treeUtils';
import { buildLearningReport } from '@/app/app/workspace/report/reportUtils';
import { QANode } from '@/app/tree/qaClient';
import { TreeCanvas } from '@/app/app/workspace/TreeCanvas';

type SharedTreePayload = {
  version: string;
  tree: {
    id: string;
    name?: string | null;
    topic?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  nodes: Node[];
  lens?: Record<string, unknown>;
  timeline?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  metrics?: {
    version: 'v1';
    tree_id: string;
    node_count: number;
    depth_max: number;
    branch_node_count: number;
    user_question_count: number;
    ai_answer_count: number;
    created_at: string | null;
    updated_at: string | null;
  };
  qa?: {
    version: number;
    root_id: string | null;
    nodes: QANode[];
  };
};

function getPath(nodes: Node[], currentNodeId: string | null): Node[] {
  if (!currentNodeId) return [];
  const byId = new Map<string, Node>();
  nodes.forEach((n) => {
    if (n.id) byId.set(n.id, n);
  });
  const start = byId.get(currentNodeId);
  if (!start) return [];
  const path: Node[] = [];
  const visited = new Set<string>();
  let cursor: Node | undefined | null = start;
  while (cursor && !visited.has(cursor.id)) {
    path.push(cursor);
    visited.add(cursor.id);
    if (!cursor.parent_id) break;
    const parent = byId.get(cursor.parent_id);
    if (!parent) break;
    cursor = parent;
  }
  return path.reverse();
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function ShareViewer({ data, token }: { data: SharedTreePayload; token: string }) {
  // View mode locked to 'path' - always show path-based messages
  const viewMode = 'path' as const;
  
  // Use QANode model for tree visualization (consistent with Workspace)
  const qaNodes = useMemo(() => data.qa?.nodes || [], [data.qa?.nodes]);
  
  const sortedNodes = useMemo(() => {
    const normalized = normalizeNodesForVisuals(data.nodes || []);
    const getTime = (n: Node) => {
      const t = n.created_at ? new Date(n.created_at).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    };
    return [...normalized].sort((a, b) => {
      const ta = getTime(a);
      const tb = getTime(b);
      if (ta === tb) {
        return (a.level || 0) - (b.level || 0);
      }
      return ta - tb;
    });
  }, [data.nodes]);

  // Initial selection: last QANode (or fall back to last Node if no QANodes)
  const initialNodeId = useMemo(() => {
    if (qaNodes.length > 0) {
      return qaNodes[qaNodes.length - 1]?.id || null;
    }
    return sortedNodes[sortedNodes.length - 1]?.id || null;
  }, [qaNodes, sortedNodes]);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(initialNodeId);

  const currentNode = useMemo(
    () => sortedNodes.find((n) => n.id === currentNodeId) || sortedNodes[sortedNodes.length - 1] || null,
    [currentNodeId, sortedNodes]
  );
  const pathNodes = useMemo(() => getPath(sortedNodes, currentNode?.id || null), [sortedNodes, currentNode]);
  const rootNode = useMemo(() => sortedNodes.find((n) => isRootNode(n)) || null, [sortedNodes]);

  const pathMessages: ChatMessage[] = useMemo(
    () =>
      pathNodes.map((node) => {
        const role: ChatMessage['role'] =
          node.role === 'assistant' || node.role === 'ai'
            ? 'ai'
            : isRootNode(node)
              ? 'root'
              : node.role === 'system'
                ? 'system'
                : 'user';
        return {
          id: node.id,
          role,
          text: node.text || '',
          level: typeof node.level === 'number' ? node.level : null,
          isCurrent: node.id === currentNode?.id,
          isRoot: isRootNode(node),
        };
      }),
    [pathNodes, currentNode]
  );

  const allMessages: ChatMessage[] = useMemo(
    () =>
      sortedNodes.map((node) => {
        const role: ChatMessage['role'] =
          node.role === 'assistant' || node.role === 'ai'
            ? 'ai'
            : isRootNode(node)
              ? 'root'
              : node.role === 'system'
                ? 'system'
                : 'user';
        return {
          id: node.id,
          role,
          text: node.text || '',
          level: typeof node.level === 'number' ? node.level : null,
          isCurrent: node.id === currentNode?.id,
          isRoot: isRootNode(node),
        };
      }),
    [sortedNodes, currentNode]
  );

  const title = data.tree?.name || data.tree?.topic || 'Shared tree';
  const stats = useMemo(() => {
    const count = sortedNodes.length;
    const maxLevel = sortedNodes.reduce((acc, n) => Math.max(acc, n.level ?? 0), 0);
    const branchCount = sortedNodes.filter((n) => !isRootNode(n) && n.role !== 'ai' && n.role !== 'assistant').length;
    return { count, depth: maxLevel + 1, branches: Math.max(branchCount, 0) };
  }, [sortedNodes]);
  const report = useMemo(
    () =>
      buildLearningReport({
        tree: { name: title, topic: data.tree.topic, created_at: data.tree.created_at, updated_at: data.tree.updated_at },
        metrics: data.metrics as any,
        nodes: sortedNodes,
      }),
    [data.metrics, data.tree.created_at, data.tree.topic, data.tree.updated_at, sortedNodes, title]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-10 border-b border-border/80 glass-panel rounded-none px-6 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-900 flex items-center justify-center font-semibold dark:bg-emerald-900/40 dark:text-emerald-100">
              🌿
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{title}</h1>
              <p className="text-sm text-muted-foreground">Readonly share link · You can explore this tree, but not edit it.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/app"
              className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Back to oMyTree →
            </a>
            <span className="text-xs text-muted-foreground">
              Token: {shortNodeId(token, 10)}
            </span>
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <a href="/docs" className="underline hover:text-primary">What is oMyTree?</a>
          {' · '}
          <a href="/auth/register" className="underline hover:text-primary">Start your own tree</a>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1.6fr_1fr]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/70 bg-white shadow-sm dark:bg-slate-900">
          <ChatPane
            treeTitle={title}
            nodeLabel={currentNode ? (isRootNode(currentNode) ? 'Root' : `#${currentNode.level ?? '?'} · ${currentNode.role === 'ai' || currentNode.role === 'assistant' ? 'AI' : 'User'}`) : undefined}
            messages={viewMode === 'path' ? pathMessages : allMessages}
            readonly
          />
        </section>

        <aside className="flex min-h-0 flex-col gap-4 rounded-xl border border-border/70 bg-white px-4 py-4 shadow-sm dark:bg-slate-900">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mini tree</div>
            <div className="mt-2 h-48">
              <TreeCanvas
                nodes={qaNodes}
                selectedId={currentNodeId}
                onSelect={(id: string) => setCurrentNodeId(id)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatCard label="Nodes" value={stats.count} />
            <StatCard label="Depth" value={stats.depth} />
            <StatCard label="Branches" value={stats.branches} />
          </div>
          <div className="rounded-lg border border-border/60 bg-card/70 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Summary</div>
            <p className="mt-1 leading-relaxed">{report.summaryLine}</p>
          </div>
          {rootNode && (
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2 text-sm text-foreground">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Root preview</div>
              <p className="mt-1 line-clamp-4 text-sm">{rootNode.text || '(empty)'}</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
