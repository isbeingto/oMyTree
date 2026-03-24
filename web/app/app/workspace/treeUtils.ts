import type { Node } from "./types";

export function isRootNode(node: Node | null | undefined): boolean {
  if (!node) return false;
  // Strict check: root must be user role and have no parent
  // Note: For legacy trees with system root, use normalizeNodesForVisuals first
  return !node.parent_id && node.role === 'user';
}

export function normalizeNodesForVisuals(nodes: Node[]): Node[] {
  // Detect legacy system root
  const systemRoot = nodes.find(n => !n.parent_id && (n.role === 'system' || n.role === 'topic'));
  
  if (systemRoot) {
    // Filter out system root and reparent its children
    return nodes
      .filter(n => n.id !== systemRoot.id)
      .map(n => {
        if (n.parent_id === systemRoot.id) {
          return { ...n, parent_id: null };
        }
        return n;
      });
  }
  
  return nodes;
}

export function shortNodeId(nodeId: string | null | undefined, length = 6): string {
  if (!nodeId) return "";
  return nodeId.slice(0, length);
}
