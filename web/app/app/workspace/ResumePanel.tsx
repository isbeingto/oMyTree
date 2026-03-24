'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  FileText,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Lightbulb,
  Target,
  FileCheck,
  History,
  Info,
  Link
} from 'lucide-react';
import { Spinner, InlineSpinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';

/**
 * T56-1: Resume Panel - Six-block structure for snapshot display
 * 
 * Content blocks (fixed order):
 * A. Now + Status
 * B. Exploration Diary
 * C. Facts vs Inferences
 * D. Open Loops
 * E. Next Actions
 * F. Artifacts / Evidence
 */

export interface ResumeSnapshot {
  id: string;
  tree_id: string;
  scope_node_id: string | null;
  ts: string;
  mode: 'incremental' | 'full';
  based_on_snapshot_id: string | null;
  content: {
    A_now_status: {
      title: string;
      items: Array<{ text: string; sources: string[]; sources_missing_reason?: string }>;
    };
    B_exploration_diary: {
      title: string;
      items: Array<{
        title?: string;
        text: string;
        ts?: string;
        sources: string[];
        sources_missing_reason?: string;
      }>;
    };
    C_facts_vs_inferences: {
      title: string;
      facts: Array<{ text: string; subkind?: string; ts?: string; sources: string[]; sources_missing_reason?: string }>;
      inferences: Array<{ text: string; kind?: string; ts?: string; sources: string[]; sources_missing_reason?: string }>;
    };
    D_open_loops: {
      title: string;
      items: Array<{
        text: string;
        subkind?: string;
        ts?: string;
        suggested_next?: string;
        sources: string[];
        sources_missing_reason?: string;
      }>;
    };
    E_next_actions: {
      title: string;
      items: Array<{ text: string; sources: string[]; sources_missing_reason?: string }>;
    };
    F_artifacts: {
      title: string;
      items: Array<{ text: string; sources: string[]; sources_missing_reason?: string }>;
    };
    sources: string[];
    /** T58-7-3: Coverage metadata for gap UI */
    meta?: {
      coverage: number;
      sections_with_content: number;
      sections_with_sources: number;
      delta_summary?: {
        since_ts?: string | null;
        nodes: number;
        evidence: number;
      };
    };
  };
  diary: string;
  pinned: boolean;
  user_notes: string | null;
}

export interface ResumePanelProps {
  /** Tree ID for generating/fetching snapshots */
  treeId: string | null;
  /** Currently loaded snapshot */
  snapshot: ResumeSnapshot | null;
  /** Loading state */
  isLoading?: boolean;
  /** Snapshot generation loading state */
  isGenerating?: boolean;
  /** Error message */
  error?: string | null;
  /** List of all snapshots (for history) */
  snapshotHistory?: ResumeSnapshot[];
  /** Callback to generate a new snapshot */
  onGenerate?: () => Promise<{ snapshot: ResumeSnapshot | null; error: string | null }>;
  /** Callback to load a specific snapshot */
  onLoadSnapshot?: (snapshotId: string) => void;
  /** Callback when a source chip is clicked */
  onSourceClick?: (source: string) => void;
  /** T58-7-3: Callback to guide user to attach evidence */
  onGuideEvidenceAttach?: () => void;
  /** Language */
  lang?: Lang;
  /** Additional class names */
  className?: string;
}

/** Section collapse state */
type CollapsedSections = {
  status: boolean;
  diary: boolean;
  facts: boolean;
  openLoops: boolean;
  nextActions: boolean;
  artifacts: boolean;
  history: boolean;
};

const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = {
  status: false,      // A - 默认展开
  diary: false,       // B - 默认展开
  facts: false,       // C - 默认展开 (T58-1)
  openLoops: false,   // D - 默认展开 (T58-1)
  nextActions: true,  // E - 默认折叠
  artifacts: true,    // F - 默认折叠
  history: true,      // History - 默认折叠
};

/**
 * Source chip component - clickable tag for navigation
 * T59-1: Added evidence chip type support
 */
function SourceChip({
  source,
  onClick
}: {
  source: string;
  onClick?: (source: string) => void;
}) {
  const isClickable = Boolean(onClick);
  const chipType = source.startsWith('node:') ? 'node'
    : source.startsWith('turn:') ? 'turn'
      : source.startsWith('tree:') ? 'tree'
        : source.startsWith('evidence:') ? 'evidence'
          : 'other';

  const shortLabel = useMemo(() => {
    if (source.startsWith('node:')) return `N:${source.slice(5, 13)}`;
    if (source.startsWith('turn:')) return `T:${source.slice(5, 13)}`;
    if (source.startsWith('tree:')) return `🌳`;
    if (source.startsWith('evidence:')) return `📎${source.slice(9, 15)}`;
    return source.slice(0, 12);
  }, [source]);

  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] px-1.5 py-0 h-4 font-normal',
        'bg-slate-100/50 dark:bg-slate-800/50',
        'border-slate-200/80 dark:border-slate-700/60',
        isClickable && 'cursor-pointer hover:bg-primary/10 hover:border-primary/30',
        chipType === 'node' && 'text-blue-600 dark:text-blue-400',
        chipType === 'turn' && 'text-emerald-600 dark:text-emerald-400',
        chipType === 'tree' && 'text-amber-600 dark:text-amber-400',
        chipType === 'evidence' && 'text-purple-600 dark:text-purple-400'
      )}
      onClick={() => onClick?.(source)}
      title={source}
    >
      {shortLabel}
    </Badge>
  );
}

/**
 * T58-8-1: Unified source chip row with max 5 chips + overflow
 */
const MAX_VISIBLE_CHIPS = 5;

function SourceChipRow({
  sources,
  onClick,
}: {
  sources: string[];
  onClick?: (source: string) => void;
}) {
  if (!sources?.length) return null;

  const visibleSources = sources.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = sources.length - MAX_VISIBLE_CHIPS;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {visibleSources.map((src, j) => (
        <SourceChip key={j} source={src} onClick={onClick} />
      ))}
      {overflowCount > 0 && (
        <Badge
          variant="outline"
          className="text-[10px] px-1.5 py-0 h-4 font-normal bg-slate-100/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400"
          title={`${overflowCount} more sources`}
        >
          +{overflowCount}
        </Badge>
      )}
    </div>
  );
}

/**
 * T58-7-3: Subtle hint for items with missing sources
 */
function SourceMissingHint({
  reason,
  lang = 'en'
}: {
  reason?: string;
  lang?: Lang;
}) {
  if (!reason) return null;

  return (
    <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
      <Info className="h-3 w-3 shrink-0" />
      <span className="italic">{t(lang, 'resume_sources_missing_hint')}</span>
    </div>
  );
}

/**
 * T58-7-3: Check if sources array contains meaningful (node/turn/evidence) references
 */
function hasMeaningfulSources(sources: string[] = []) {
  return sources.some(s =>
    s?.startsWith('node:') || s?.startsWith('turn:') || s?.startsWith('evidence:')
  );
}

function CoverageBadge({ coverage, lang = 'en' }: { coverage?: number; lang?: Lang }) {
  if (coverage === undefined || Number.isNaN(coverage)) return null;
  const percent = Math.max(0, Math.min(100, Math.round(coverage * 100)));
  const label = `${percent}%`;
  const toneClass = percent >= 90
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
    : percent >= 70
      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800'
      : 'bg-slate-100/70 text-slate-600 border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700';

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 h-4 shrink-0', toneClass)}
          >
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
          <div className="font-medium">
            {t(lang, 'resume_coverage_label') || 'Coverage'}: {label}
          </div>
          <div>{t(lang, 'resume_coverage_tooltip')}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DeltaSummaryRow({
  delta,
  lang = 'en',
}: {
  delta?: {
    nodes: number;
    evidence: number;
    since_ts?: string | null;
  } | null;
  lang?: Lang;
}) {
  if (!delta) return null;
  const items = [
    { key: 'nodes', count: delta.nodes, label: t(lang, 'resume_delta_nodes') || 'nodes' },
    { key: 'evidence', count: delta.evidence, label: t(lang, 'resume_delta_evidence') || 'evidence' },
  ];
  const visibleItems = items.filter(item => item.count > 0);
  if (visibleItems.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-slate-50/60 px-2.5 py-1.5 text-[11px] text-muted-foreground"
      title={delta.since_ts ? new Date(delta.since_ts).toLocaleString() : undefined}
    >
      <span className="font-medium text-slate-500 dark:text-slate-400">
        {t(lang, 'resume_delta_since') || 'Since last snapshot'}
      </span>
      {visibleItems.map(item => (
        <Badge key={item.key} variant="secondary" className="text-[10px] px-1.5 h-4">
          +{item.count} {item.label}
        </Badge>
      ))}
    </div>
  );
}

/**
 * Collapsible section header
 */
function SectionHeader({
  icon: Icon,
  title,
  count,
  collapsed,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full text-left py-2 px-1 -mx-1 rounded-md hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium text-foreground flex-1">{title}</span>
      {typeof count === 'number' && count > 0 && (
        <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
          {count}
        </Badge>
      )}
      {collapsed ? (
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

/**
 * Empty state component
 */
function EmptyState({
  onGenerate,
  lang = 'en',
  isGenerating,
}: {
  onGenerate?: () => void;
  lang?: Lang;
  isGenerating?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <FileText className="h-6 w-6 text-primary" />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-foreground">
          {t(lang, 'resume_empty_title') || 'No Resume Snapshot Yet'}
        </h3>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          {t(lang, 'resume_empty_desc') ||
            'Generate a snapshot to capture your exploration progress, key insights, and open questions.'}
        </p>
      </div>
      <Button
        size="sm"
        onClick={onGenerate}
        disabled={isGenerating}
        className="gap-2"
      >
        {isGenerating ? (
          <InlineSpinner size="sm" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {t(lang, 'resume_generate_btn') || 'Generate Snapshot'}
      </Button>
    </div>
  );
}

/**
 * Loading state component
 */
function LoadingState({
  lang = 'en',
  isGenerating = false,
}: {
  lang?: Lang;
  isGenerating?: boolean;
}) {
  const title = isGenerating
    ? t(lang, 'resume_loading') || 'Generating snapshot...'
    : t(lang, 'resume_loading_existing') || 'Loading resume...';
  const desc = isGenerating
    ? t(lang, 'resume_loading_desc') || 'Analyzing your exploration trail'
    : t(lang, 'resume_loading_existing_desc') || 'Fetching the latest snapshots';

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-4">
      <Spinner size="lg" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

/**
 * Snapshot content display component
 */
function SnapshotContent({
  snapshot,
  collapsedSections,
  onToggleSection,
  onSourceClick,
  lang = 'en',
}: {
  snapshot: ResumeSnapshot;
  collapsedSections: CollapsedSections;
  onToggleSection: (section: keyof CollapsedSections) => void;
  onSourceClick?: (source: string) => void;
  lang?: Lang;
}) {
  const { content } = snapshot;

  return (
    <div className="space-y-3">
      {/* A. Now + Status */}
      <section>
        <SectionHeader
          icon={Target}
          title={t(lang, 'resume_section_now') || content.A_now_status.title || 'Now + Status'}
          collapsed={collapsedSections.status}
          onToggle={() => onToggleSection('status')}
        />
        {!collapsedSections.status && (
          <div className="pl-5 space-y-1.5">
            {content.A_now_status.items.map((item, i) => (
              <div key={i} className="space-y-1">
                <div className="text-sm text-foreground leading-relaxed line-clamp-2">
                  {item.text}
                </div>
                {hasMeaningfulSources(item.sources) ? (
                  <SourceChipRow sources={item.sources} onClick={onSourceClick} />
                ) : (
                  <SourceMissingHint reason={item.sources_missing_reason} lang={lang} />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <DeltaSummaryRow delta={content.meta?.delta_summary} lang={lang} />

      {/* B. Exploration Diary */}
      <section>
        <SectionHeader
          icon={Clock}
          title={t(lang, 'resume_section_diary') || content.B_exploration_diary.title || 'Exploration Diary'}
          count={content.B_exploration_diary.items.length}
          collapsed={collapsedSections.diary}
          onToggle={() => onToggleSection('diary')}
        />
        {!collapsedSections.diary && (
          <div className="pl-5 space-y-2">
            {content.B_exploration_diary.items.map((item, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="text-foreground">{item.text || item.title}</div>
                {hasMeaningfulSources(item.sources) ? (
                  <SourceChipRow sources={item.sources} onClick={onSourceClick} />
                ) : (
                  <SourceMissingHint reason={item.sources_missing_reason} lang={lang} />
                )}
              </div>
            ))}
            {content.B_exploration_diary.items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t(lang, 'resume_empty_diary') || 'No entries yet'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* C. Facts vs Inferences */}
      <section>
        <SectionHeader
          icon={CheckCircle2}
          title={t(lang, 'resume_section_facts') || content.C_facts_vs_inferences.title || 'Facts vs Inferences'}
          count={(content.C_facts_vs_inferences.facts?.length || 0) + (content.C_facts_vs_inferences.inferences?.length || 0)}
          collapsed={collapsedSections.facts}
          onToggle={() => onToggleSection('facts')}
        />
        {!collapsedSections.facts && (
          <div className="pl-5 space-y-2">
            {/* Facts */}
            {content.C_facts_vs_inferences.facts?.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                  {t(lang, 'resume_facts_label') || 'Facts'}
                </div>
                {content.C_facts_vs_inferences.facts.map((fact, i) => (
                  <div key={i} className="text-xs text-foreground pl-2 border-l-2 border-emerald-300 dark:border-emerald-700">
                    {fact.text}
                    {hasMeaningfulSources(fact.sources) ? (
                      <SourceChipRow sources={fact.sources} onClick={onSourceClick} />
                    ) : (
                      <SourceMissingHint reason={fact.sources_missing_reason} lang={lang} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Inferences */}
            {content.C_facts_vs_inferences.inferences?.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  {t(lang, 'resume_inferences_label') || 'Inferences'}
                </div>
                {content.C_facts_vs_inferences.inferences.map((inf, i) => (
                  <div key={i} className="text-xs text-foreground pl-2 border-l-2 border-amber-300 dark:border-amber-700">
                    {inf.text}
                    {hasMeaningfulSources(inf.sources) ? (
                      <SourceChipRow sources={inf.sources} onClick={onSourceClick} />
                    ) : (
                      <SourceMissingHint reason={inf.sources_missing_reason} lang={lang} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {(!content.C_facts_vs_inferences.facts?.length && !content.C_facts_vs_inferences.inferences?.length) && (
              <p className="text-xs text-muted-foreground italic">
                {t(lang, 'resume_empty_facts') || 'No facts or inferences recorded'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* D. Open Loops */}
      <section>
        <SectionHeader
          icon={HelpCircle}
          title={t(lang, 'resume_section_open_loops') || content.D_open_loops.title || 'Open Loops'}
          count={content.D_open_loops.items.length}
          collapsed={collapsedSections.openLoops}
          onToggle={() => onToggleSection('openLoops')}
        />
        {!collapsedSections.openLoops && (
          <div className="pl-5 space-y-1.5">
            {content.D_open_loops.items.map((item, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="text-foreground flex items-start gap-1.5">
                  <span className="text-amber-500">?</span>
                  <span>{item.text}</span>
                </div>
                {hasMeaningfulSources(item.sources) ? (
                  <div className="pl-4"><SourceChipRow sources={item.sources} onClick={onSourceClick} /></div>
                ) : (
                  <div className="pl-4"><SourceMissingHint reason={item.sources_missing_reason} lang={lang} /></div>
                )}
              </div>
            ))}
            {content.D_open_loops.items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t(lang, 'resume_empty_open_loops') || 'No open questions'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* E. Next Actions */}
      <section>
        <SectionHeader
          icon={Lightbulb}
          title={t(lang, 'resume_section_next_actions') || content.E_next_actions.title || 'Next Actions'}
          count={content.E_next_actions.items.length}
          collapsed={collapsedSections.nextActions}
          onToggle={() => onToggleSection('nextActions')}
        />
        {!collapsedSections.nextActions && (
          <div className="pl-5 space-y-1.5">
            {content.E_next_actions.items.map((item, i) => (
              <div key={i} className="text-xs text-foreground flex items-start gap-1.5">
                <span className="text-primary">→</span>
                <span>{item.text}</span>
              </div>
            ))}
            {content.E_next_actions.items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t(lang, 'resume_empty_actions') || 'No suggested actions'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* F. Artifacts */}
      <section>
        <SectionHeader
          icon={FileCheck}
          title={t(lang, 'resume_section_artifacts') || content.F_artifacts.title || 'Artifacts / Evidence'}
          count={content.F_artifacts.items.length}
          collapsed={collapsedSections.artifacts}
          onToggle={() => onToggleSection('artifacts')}
        />
        {!collapsedSections.artifacts && (
          <div className="pl-5 space-y-1.5">
            {content.F_artifacts.items.map((item, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="text-foreground">{item.text}</div>
                {hasMeaningfulSources(item.sources) ? (
                  <SourceChipRow sources={item.sources} onClick={onSourceClick} />
                ) : (
                  <SourceMissingHint reason={item.sources_missing_reason} lang={lang} />
                )}
              </div>
            ))}
            {content.F_artifacts.items.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                {t(lang, 'resume_empty_artifacts') || 'No artifacts recorded'}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Snapshot history list component
 */
function HistoryList({
  snapshots,
  currentSnapshotId,
  onLoadSnapshot,
  collapsed,
  onToggle,
  lang = 'en',
}: {
  snapshots: ResumeSnapshot[];
  currentSnapshotId?: string;
  onLoadSnapshot?: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  lang?: Lang;
}) {
  if (snapshots.length === 0) return null;

  return (
    <section className="border-t border-border pt-3 mt-3">
      <SectionHeader
        icon={History}
        title={t(lang, 'resume_history') || 'History'}
        count={snapshots.length}
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {!collapsed && (
        <div className="pl-5 space-y-1">
          {snapshots.map((snap) => {
            const isActive = snap.id === currentSnapshotId;
            const dateStr = new Date(snap.ts).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <button
                key={snap.id}
                onClick={() => onLoadSnapshot?.(snap.id)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors',
                  'hover:bg-slate-100/60 dark:hover:bg-slate-800/60',
                  isActive && 'bg-primary/10 text-primary'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate flex-1">
                    {snap.id.slice(0, 8)}...
                  </span>
                  <span className="text-muted-foreground shrink-0">{dateStr}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * T56-1: Resume Panel - Main component
 */
export function ResumePanel({
  treeId,
  snapshot,
  isLoading = false,
  isGenerating = false,
  error,
  snapshotHistory = [],
  onGenerate,
  onLoadSnapshot,
  onSourceClick,
  onGuideEvidenceAttach,
  lang = 'en',
  className,
}: ResumePanelProps) {
  // Section collapse state - default: keep status and diary open
  const [collapsedSections, setCollapsedSections] = useState<CollapsedSections>(() => ({
    ...DEFAULT_COLLAPSED_SECTIONS,
  }));
  const [generateFeedback, setGenerateFeedback] = useState<{
    state: 'idle' | 'success' | 'error';
    message?: string;
  }>({ state: 'idle' });
  const generateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleSection = (section: keyof CollapsedSections) => {
    setCollapsedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  useEffect(() => {
    setCollapsedSections({ ...DEFAULT_COLLAPSED_SECTIONS });
  }, [snapshot?.id, treeId]);

  useEffect(() => {
    if (!isGenerating) return;
    setGenerateFeedback({ state: 'idle' });
  }, [isGenerating]);

  useEffect(() => {
    if (generateFeedback.state !== 'success') return;
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current);
    }
    generateTimeoutRef.current = setTimeout(() => {
      setGenerateFeedback({ state: 'idle' });
    }, 3500);
    return () => {
      if (generateTimeoutRef.current) {
        clearTimeout(generateTimeoutRef.current);
      }
    };
  }, [generateFeedback.state]);

  const handleGenerateClick = async () => {
    if (!onGenerate) return;
    if (generateTimeoutRef.current) {
      clearTimeout(generateTimeoutRef.current);
      generateTimeoutRef.current = null;
    }
    try {
      const result = await onGenerate();
      if (result?.snapshot) {
        setGenerateFeedback({ state: 'success' });
        return;
      }
      const reason = result?.error || error || t(lang, 'resume_generate_failed_reason') || 'Failed to generate snapshot';
      setGenerateFeedback({ state: 'error', message: reason });
    } catch (err: any) {
      const reason = err?.message || error || t(lang, 'resume_generate_failed_reason') || 'Failed to generate snapshot';
      setGenerateFeedback({ state: 'error', message: reason });
    }
  };

  // No tree ID
  if (!treeId) {
    return (
      <div className={cn('flex items-center justify-center h-full p-6', className)}>
        <p className="text-xs text-muted-foreground text-center">
          {t(lang, 'resume_no_tree') || 'Select a tree to view its resume'}
        </p>
      </div>
    );
  }

  if (!snapshot) {
    if (isLoading) {
      return (
        <div className={cn('h-full', className)}>
          <LoadingState lang={lang} isGenerating={isGenerating} />
        </div>
      );
    }

    if (error) {
      return (
        <div className={cn('flex flex-col items-center justify-center h-full p-6 text-center space-y-3', className)}>
          <p className="text-xs text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={handleGenerateClick}>
            {t(lang, 'resume_retry') || 'Retry'}
          </Button>
        </div>
      );
    }

    return (
      <div className={cn('h-full', className)}>
        <EmptyState
          onGenerate={handleGenerateClick}
          lang={lang}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  // Success state - show snapshot content
  const dateStr = new Date(snapshot.ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const generateStatusText = isGenerating
    ? t(lang, 'resume_generate_loading') || 'Generating...'
    : generateFeedback.state === 'success'
      ? t(lang, 'resume_generate_success') || 'Snapshot updated'
      : generateFeedback.state === 'error'
        ? `${t(lang, 'resume_generate_failed') || 'Failed'}: ${generateFeedback.message || error || t(lang, 'resume_generate_failed_reason') || 'Failed to generate snapshot'}`
        : null;
  const generateStatusClass = isGenerating
    ? 'text-slate-500 dark:text-slate-400'
    : generateFeedback.state === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : generateFeedback.state === 'error'
        ? 'text-red-600 dark:text-red-400'
        : 'text-muted-foreground';

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with snapshot meta */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{dateStr}</span>
          <Badge
            variant="outline"
            className="text-[10px] px-1 h-4 shrink-0"
          >
            {snapshot.mode}
          </Badge>
          {snapshot.content.meta?.coverage !== undefined && (
            <CoverageBadge coverage={snapshot.content.meta.coverage} lang={lang} />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 gap-1.5"
              onClick={handleGenerateClick}
              disabled={isGenerating}
              title={t(lang, 'resume_refresh') || 'Generate new snapshot'}
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span className="text-[11px] max-w-[96px] truncate">
                {t(lang, 'resume_generate_btn') || 'Generate Snapshot'}
              </span>
            </Button>
            {generateStatusText && (
              <span
                className={cn('text-[10px] leading-tight text-right max-w-[160px] line-clamp-1', generateStatusClass)}
                title={generateFeedback.message || error || undefined}
              >
                {generateStatusText}
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 text-[11px] text-red-600 dark:text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 truncate" title={error}>
            {error}
          </span>
        </div>
      )}

      {/* T58-7-3: CTA row when coverage is low */}
      {snapshot.content.meta?.coverage !== undefined && snapshot.content.meta.coverage < 1 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-slate-50/50 dark:bg-slate-900/50">
          <Info className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 flex-1">
            {t(lang, 'resume_sources_hint')}
          </span>
          {onGuideEvidenceAttach && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] gap-1 text-slate-600 dark:text-slate-300"
              onClick={onGuideEvidenceAttach}
            >
              <Link className="h-3 w-3" />
              {t(lang, 'resume_attach_evidence')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-2 text-[11px] gap-1 text-slate-600 dark:text-slate-300"
            onClick={handleGenerateClick}
            disabled={isGenerating}
          >
            <Sparkles className="h-3 w-3" />
            {t(lang, 'resume_refresh')}
          </Button>
        </div>
      )}

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-1">
          {/* Snapshot content blocks */}
          <SnapshotContent
            snapshot={snapshot}
            collapsedSections={collapsedSections}
            onToggleSection={toggleSection}
            onSourceClick={onSourceClick}
            lang={lang}
          />

          {/* History list */}
          <HistoryList
            snapshots={snapshotHistory}
            currentSnapshotId={snapshot.id}
            onLoadSnapshot={onLoadSnapshot}
            collapsed={collapsedSections.history}
            onToggle={() => toggleSection('history')}
            lang={lang}
          />
        </div>
      </ScrollArea>
    </div>
  );
}

export default ResumePanel;
