import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Skeleton — oMyTree 统一骨架屏/占位符组件
 * 
 * 设计理念：
 * - 统一使用 bg-muted 作为底色，确保深浅模式一致性
 * - 柔和的脉冲动画 (pulse)，不刺眼
 * - 提供多种预设变体：line / circle / card / avatar
 * - 自动匹配暗色模式
 * ============================================================ */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 预设变体 */
  variant?: "line" | "circle" | "card" | "avatar" | "text" | "button";
  /** 是否播放动画 */
  animate?: boolean;
}

/**
 * 基础骨架屏组件。
 * 
 * @example
 * // 文本行占位
 * <Skeleton className="h-4 w-48" />
 * 
 * // 头像占位
 * <Skeleton variant="avatar" />
 * 
 * // 卡片占位
 * <Skeleton variant="card" />
 */
export function Skeleton({
  variant,
  animate = true,
  className,
  ...props
}: SkeletonProps) {
  const variantClasses = {
    line: "h-4 w-full rounded-md",
    circle: "h-10 w-10 rounded-full",
    card: "h-32 w-full rounded-xl",
    avatar: "h-9 w-9 rounded-full",
    text: "h-3.5 rounded-md",
    button: "h-9 w-24 rounded-md",
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "bg-muted/60 dark:bg-muted/30",
        animate && "animate-pulse",
        variant && variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

/* ============================================================
 * SkeletonGroup — 常用骨架屏组合预设
 * ============================================================ */

/** 列表项骨架 */
export function SkeletonListItem({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center gap-3 p-3", className)} {...props}>
      <Skeleton variant="avatar" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/** 卡片骨架 */
export function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 p-4 space-y-3",
        className
      )}
      {...props}
    >
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="flex gap-2 pt-2">
        <Skeleton variant="button" />
        <Skeleton variant="button" className="w-16" />
      </div>
    </div>
  );
}

/** 表格行骨架 */
export function SkeletonTableRow({
  cols = 4,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { cols?: number }) {
  return (
    <div className={cn("flex gap-4 py-3 px-2", className)} {...props}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === 0 ? "w-1/4" : "flex-1"
          )}
        />
      ))}
    </div>
  );
}

export default Skeleton;
