import { requireWorkspaceContext } from "../../middleware/workspace_context.js";

export function requireKnowledgeAuth(pg) {
  return requireWorkspaceContext(pg);
}
