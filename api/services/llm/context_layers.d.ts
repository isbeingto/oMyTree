export type MemoryScope = 'branch' | 'tree';

export interface LayeredContextInput {
  scope?: MemoryScope;
  breadcrumbTitles?: string[];
  pathSummary?: string;
  parentSummary?: string;
  parentFullText?: string;
  treeSummary?: string;
  rollingSummary?: string;
  recentTurns?: Array<{
    role?: string;
    text: string;
    topic_tag?: string | null;
    attachments?: unknown[];
    thought_signature?: string | null;
    reasoning_content?: string | null;
  }>;
  activeTopicTag?: string | null;
  limits?: {
    pathSummary?: number;
    parentSummary?: number;
    rollingSummary?: number;
    parentFull?: number;
    recentTurns?: number;
    recentTurnChars?: number;
    treeStory?: number;
  };
}

export interface LayeredContext {
  tree_story: string | null;
  rolling_summary: string | null;
  core_facts: string[];
  path_background: string | null;
  recent_dialogue: Array<{ role: string; text: string; attachments?: unknown[] }>;
}

export function truncateBySentence(value: string, limit: number): string;
export function buildLayeredContextSections(
  params: LayeredContextInput,
  options?: {
    userText?: string;
    semanticCoreFactsEnabled?: boolean;
    profile?: string;
  }
): Promise<LayeredContext>;
