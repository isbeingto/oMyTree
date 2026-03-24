'use client';

import React from 'react';
import { Library, ArrowRight, Database, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { t, type Lang } from '@/lib/i18n';

interface KnowledgeEntryCardProps {
  lang: Lang;
  onClick: () => void;
  mountedCount?: number;
  lastUpdated?: string;
}

export function KnowledgeEntryCard({ lang, onClick, mountedCount = 0, lastUpdated }: KnowledgeEntryCardProps) {
  const isZh = lang === 'zh-CN';

  return (
    <Card className="group relative overflow-hidden apple-glass-capsule !rounded-2xl border-border/50 hover:border-emerald-500/50 transition-all duration-500 shadow-sm hover:shadow-[0_8px_40px_rgba(16,185,129,0.08)]">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.02] to-sky-500/[0.02] pointer-events-none" />
      
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Library className="h-5 w-5" />
          </div>
          {mountedCount > 0 && (
            <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              {isZh ? `${mountedCount} 个已挂载` : `${mountedCount} Mounted`}
            </span>
          )}
        </div>
        <CardTitle className="text-lg mt-2 font-bold tracking-tight">
          {t(lang, 'sidebar_knowledge_base')}
        </CardTitle>
        <CardDescription className="text-xs line-clamp-1">
          {isZh ? '管理并组织你的资料，用于对话问答' : 'Manage your documents for RAG sessions'}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              <span>{isZh ? '资料柜' : 'Vault'}</span>
            </div>
            {lastUpdated && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{lastUpdated}</span>
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClick}
            className="h-8 rounded-lg group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300"
          >
            <span className="mr-1">{isZh ? '管理' : 'Manage'}</span>
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
