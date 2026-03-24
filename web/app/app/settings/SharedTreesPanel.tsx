import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SharedTreeEntry, useUserShares } from './useUserShares';
import { t, type Lang } from '@/lib/i18n';

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return value;
  }
}

function buildShareUrl(token: string) {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return origin ? `${origin.replace(/\/$/, '')}/share/${token}` : `/share/${token}`;
}

export function SharedTreesPanel({ userId, lang }: { userId: string; lang: Lang }) {
  const { toast } = useToast();
  const { sharedTrees, isLoading, error, refetch, revokeShare, isRevoking } = useUserShares(userId);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const handleCopy = async (token: string) => {
    try {
      const url = buildShareUrl(token);
      await navigator.clipboard.writeText(url);
      toast({ title: t(lang, 'shared_trees_link_copied') });
    } catch (err) {
      console.error('copy failed', err);
      toast({ title: t(lang, 'shared_trees_copy_failed'), variant: 'destructive' });
    }
  };

  const handleRevoke = async (treeId: string) => {
    try {
      setRevokingId(treeId);
      await revokeShare(treeId);
      toast({ title: t(lang, 'shared_trees_link_revoked') });
    } catch (err) {
      console.error('revoke failed', err);
      toast({ title: t(lang, 'shared_trees_revoke_failed'), variant: 'destructive' });
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Card className="glass-panel-soft hover:shadow-md transition-shadow">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base">{t(lang, 'shared_trees_title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(lang, 'shared_trees_desc')}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <div className="text-sm text-muted-foreground">{t(lang, 'shared_trees_loading')}</div>}
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={() => { void refetch(); }}>
              {t(lang, 'shared_trees_retry')}
            </Button>
          </div>
        )}
        {!isLoading && !error && sharedTrees.length === 0 && (
          <div className="text-sm text-muted-foreground">
            {t(lang, 'shared_trees_empty')}
          </div>
        )}
        {!isLoading && sharedTrees.length > 0 && (
          <div className="space-y-3">
            {sharedTrees.map((entry) => {
              const title = entry.display_title || entry.topic || 'Untitled tree';
              const url = buildShareUrl(entry.share_token);
              return (
                <div key={entry.tree_id} className="rounded-md glass-panel-soft px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground">{title}</div>
                      <div className="text-xs text-muted-foreground">
                        {t(lang, 'shared_trees_shared_at')}: {formatDate(entry.share_enabled_at)} · {t(lang, 'shared_trees_created_at')}: {formatDate(entry.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleCopy(entry.share_token)}>
                        {t(lang, 'shared_trees_copy_link')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive">{t(lang, 'shared_trees_revoke')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t(lang, 'shared_trees_revoke_title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t(lang, 'shared_trees_revoke_desc')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t(lang, 'shared_trees_cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={isRevoking || revokingId === entry.tree_id}
                              className={cn('bg-destructive text-destructive-foreground hover:bg-destructive/90')}
                              onClick={() => handleRevoke(entry.tree_id)}
                            >
                              {t(lang, 'shared_trees_revoke')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="text-xs text-muted-foreground break-all">
                    {url}
                  </div>
                  {typeof entry.share_view_count === 'number' && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {t(lang, 'shared_trees_views')}: {entry.share_view_count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
