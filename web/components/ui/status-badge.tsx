'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, AlertCircle, FolderSearch, X, Info } from 'lucide-react';

/**
 * T58-8-1: Unified StatusBadge component
 * 
 * Provides consistent styling for status indicators across panels.
 * 
 * Variants:
 * - ready: Green (emerald) - item is complete/ready
 * - gap: Amber - item has gaps/missing info
 * - needs_material: Blue - needs additional material
 * - ignored: Slate - item is ignored
 * - info: Slate light - informational
 */

export type StatusVariant = 'ready' | 'gap' | 'needs_material' | 'ignored' | 'info';

const variantConfig: Record<StatusVariant, {
    className: string;
    Icon: React.ElementType;
}> = {
    ready: {
        className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
        Icon: Check,
    },
    gap: {
        className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200 border-amber-200 dark:border-amber-800',
        Icon: AlertCircle,
    },
    needs_material: {
        className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200 border-blue-200 dark:border-blue-800',
        Icon: FolderSearch,
    },
    ignored: {
        className: 'bg-slate-100 text-slate-500 dark:bg-slate-800/30 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        Icon: X,
    },
    info: {
        className: 'bg-slate-50 text-slate-500 dark:bg-slate-800/20 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        Icon: Info,
    },
};

export interface StatusBadgeProps {
    variant: StatusVariant;
    children: React.ReactNode;
    showIcon?: boolean;
    className?: string;
}

export function StatusBadge({
    variant,
    children,
    showIcon = true,
    className,
}: StatusBadgeProps) {
    const { className: variantClassName, Icon } = variantConfig[variant];

    return (
        <Badge
            variant="outline"
            className={cn(
                'text-[10px] font-normal',
                variantClassName,
                className
            )}
        >
            {showIcon && <Icon className="h-3 w-3 mr-1 shrink-0" />}
            {children}
        </Badge>
    );
}

export default StatusBadge;
