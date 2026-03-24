import { appApiGet, appApiText } from "@/lib/app-api-client";

export async function downloadTreeJson(treeId: string, userId?: string) {
  if (!treeId) throw new Error('treeId is required');
  const data = await appApiGet<unknown>(`/tree/${treeId}/export/json`, {
    headers: userId ? { 'x-omytree-user-id': userId } : undefined,
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fname = `omytree-tree-${treeId}.json`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadTreeMarkdown(treeId: string, userId?: string) {
  if (!treeId) throw new Error('treeId is required');
  const text = await appApiText(`/tree/${treeId}/export/markdown`, {
    headers: userId ? { 'x-omytree-user-id': userId } : undefined,
  });
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fname = `omytree-tree-${treeId}.md`;
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
