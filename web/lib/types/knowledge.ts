export type ApiOkResponse<T> = {
  ok: true;
  data: T;
  trace_id?: string;
};

export type ApiOkResponseWithMeta<T, M> = ApiOkResponse<T> & {
  meta?: M;
};

export type PaginationMeta = {
  page: number;
  page_size: number;
  total: number;
};

export type ApiOkNoDataResponse = {
  ok: true;
  trace_id?: string;
};

export type KnowledgeBaseStatus = string;

export type KnowledgeBase = {
  id: string;
  name: string;
  description?: string | null;
  status?: KnowledgeBaseStatus;
  created_at?: string;
  updated_at?: string;
  document_count?: number;
  knowledge_count?: number;
  [key: string]: unknown;
};

// WeKnora calls these “knowledge” entries; oMyTree UI calls them “documents”.
export type KnowledgeDocument = {
  id: string;
  knowledge_base_id?: string;
  type?: string;
  title?: string;
  description?: string;
  source?: string;

  // WeKnora: pending/processing/failed/completed
  parse_status?: string;
  // WeKnora: enabled/disabled
  enable_status?: string;

  file_name?: string;
  file_type?: string;
  file_size?: number;
  storage_size?: number;

  processed_at?: string | null;
  error_message?: string;
  content?: string;

  created_at?: string;
  updated_at?: string;

  [key: string]: unknown;
};

export type KnowledgeSearchChunk = {
  id: string;
  content: string;
  score?: number;

  knowledge_id?: string;
  knowledge_title?: string;
  knowledge_filename?: string;
  knowledge_source?: string;

  chunk_index?: number;
  chunk_type?: string;
  start_at?: number;
  end_at?: number;

  metadata?: Record<string, unknown>;

  [key: string]: unknown;
};

// Payload we send to oMyTree turn APIs (KB-B.1).
export type KnowledgeContext = {
  baseId: string;
  documentIds?: string[];
  topK?: number;
};
