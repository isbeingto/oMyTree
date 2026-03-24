'use client';

import * as React from 'react';
import { Search, MessageSquare, History, X, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t, type Lang } from '@/lib/i18n';
import type { MyTree } from '@/lib/hooks/useMyTrees';
import { useRouter } from 'next/navigation';

interface SearchChatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trees: MyTree[];
  lang: Lang;
  onSelectTree: (treeId: string) => void;
}

export function SearchChatsDialog({
  open,
  onOpenChange,
  trees,
  lang,
  onSelectTree,
}: SearchChatsDialogProps) {
  const [search, setSearch] = React.useState('');
  const isZh = lang === 'zh-CN';
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return trees.slice(0, 20); // Show recent if no search
    const q = search.toLowerCase();
    return trees.filter((t) => 
      t.title?.toLowerCase().includes(q) || 
      t.display_title?.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [trees, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 border-none shadow-2xl sm:max-w-[640px] gap-0 rounded-2xl overflow-hidden bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{isZh ? '搜索对话' : 'Search Conversations'}</DialogTitle>
          <DialogDescription>
            {isZh ? '搜索并打开您的历史对话' : 'Search and open your conversation history'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col h-[min(80vh,600px)]">
          {/* Header & Search Input */}
          <div className="p-4 bg-muted/20 border-b border-border/50">
            <div className="text-xl font-bold mb-4 px-2" aria-hidden="true">
              {isZh ? '搜索' : 'Search'}
            </div>
            <div className="relative group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2">
                <Search className="h-5 w-5 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" />
              </div>
              <input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isZh ? "搜索对话" : "Search conversations"}
                className="w-full h-12 pl-12 pr-4 bg-background border border-border/60 rounded-full text-base outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                aria-label={isZh ? "搜索对话" : "Search conversations"}
              />
            </div>
          </div>

          {/* Results Area */}
          <ScrollArea className="flex-1">
            <div className="p-2 b">
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {search ? (isZh ? '搜索结果' : 'Search results') : (isZh ? '近期对话' : 'Recent conversations')}
              </div>
              
              {filtered.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center gap-2">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground/40">
                    <Search className="h-6 w-6" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isZh ? '未找到相关对话' : 'No conversations found'}
                  </p>
                </div>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {filtered.map((tree) => (
                    <button
                      key={tree.id}
                      onClick={() => {
                        onSelectTree(tree.id);
                        onOpenChange(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-500/5 dark:hover:bg-emerald-500/10 text-left transition-all group"
                    >
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 group-hover:bg-emerald-500/10 transition-colors">
                        <MessageSquare className="h-5 w-5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                          {tree.display_title || tree.title || (isZh ? '无标题' : 'Untitled')}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 opacity-60">
                          <History className="h-3 w-3" />
                          <span className="text-[11px] truncate">
                            {new Date(tree.updated_at || tree.created_at).toLocaleDateString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Footer / Shortcut hints */}
          <div className="p-3 border-t border-border/40 bg-muted/10 text-[10px] text-muted-foreground/60 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-background border border-border shadow-sm">Enter</kbd>
              <span>{isZh ? '在新窗口打开' : 'Open in new window'}</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-background border border-border shadow-sm">ESC</kbd>
              <span>{isZh ? '取消' : 'Cancel'}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
