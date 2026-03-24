import type { MessageAttachment } from '@/components/message/MessageAttachmentCard';

export interface Citation {
  kbId?: string | null;
  docId: string;
  docName: string;
  snippet: string;
  score?: number | null;
}

export interface Node {
  id: string;
  tree_id: string;
  parent_id: string | null;
  level: number;
  role: string;
  text: string;
  /** DeepSeek Reasoning: raw reasoning/thinking text (optional) */
  reasoning_content?: string | null;
  created_at: string;
  depth?: number;
  title?: string | null;
  summary?: string | null;
  title_or_first_5_words?: string | null;
  provider?: string | null;
  model?: string | null;
  is_byok?: boolean | null;
  /** T85-fix: Attachments for user messages */
  attachments?: MessageAttachment[];

  /** KB-3.x: Inline citations returned for this AI message (not persisted yet) */
  citations?: Citation[];
}
