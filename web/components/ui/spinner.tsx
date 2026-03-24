import * as React from "react";
import { cn } from "@/lib/utils";

/* ============================================================
 * Spinner — oMyTree 统一加载指示器
 * 
 * 设计理念：
 * - 使用品牌色 emerald 作为主色调，与全站设计系统一致
 * - 支持 5 种尺寸：xs / sm / md / lg / xl，覆盖从按钮内联到全页加载
 * - 轨道 (track) + 弧线 (arc) 双层结构，轨道为低透明度背景
 * - 流畅的渐变弧线旋转，cubic-bezier 缓动提升质感
 * - 完善的 a11y：aria-label + role="status"
 * - 自动适配深色模式
 * ============================================================ */

const sizeMap = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
} as const;

const trackWidthMap = {
  xs: 2,
  sm: 2,
  md: 2.5,
  lg: 3,
  xl: 3.5,
} as const;

export type SpinnerSize = keyof typeof sizeMap;

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 尺寸：xs(12px) / sm(16px) / md(24px) / lg(32px) / xl(48px) */
  size?: SpinnerSize;
  /** 自定义颜色 class，默认使用 primary 色 */
  colorClass?: string;
  /** 辅助文字，同时作为 aria-label */
  label?: string;
  /** 是否显示辅助文字 */
  showLabel?: boolean;
}

/**
 * 统一的 SVG 旋转 Spinner 组件。
 * 
 * @example
 * // 按钮内联
 * <Spinner size="xs" />
 * 
 * // 面板级加载
 * <Spinner size="md" label="正在加载..." showLabel />
 * 
 * // 全页加载
 * <Spinner size="xl" />
 */
export function Spinner({
  size = "md",
  colorClass,
  label,
  showLabel = false,
  className,
  ...props
}: SpinnerProps) {
  const trackWidth = trackWidthMap[size];
  const radius = 10;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="status"
      aria-label={label || "Loading"}
      className={cn(
        "inline-flex flex-col items-center justify-center gap-2",
        className
      )}
      {...props}
    >
      <svg
        className={cn(
          sizeMap[size],
          "animate-spin",
          colorClass
        )}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animationDuration: "0.8s",
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* 轨道（背景环） */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={trackWidth}
          strokeLinecap="round"
          className="opacity-15"
        />
        {/* 旋转弧线 */}
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={trackWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.7}
          className={cn(
            "opacity-90",
            !colorClass && "text-primary"
          )}
        />
      </svg>

      {showLabel && label && (
        <span
          className={cn(
            "text-muted-foreground animate-pulse",
            size === "xs" || size === "sm" ? "text-xs" : "text-sm"
          )}
        >
          {label}
        </span>
      )}

      {/* Screen reader only */}
      <span className="sr-only">{label || "Loading"}</span>
    </div>
  );
}

/* ============================================================
 * InlineSpinner — 用于按钮/文本行内的轻量 spinner
 * ============================================================ */

export interface InlineSpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

/**
 * 行内 spinner，无 role/aria，适用于已有容器提供 a11y 的场景（如按钮内）。
 */
export function InlineSpinner({ size = "sm", className }: InlineSpinnerProps) {
  const trackWidth = trackWidthMap[size];
  const radius = 10;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      className={cn(sizeMap[size], "animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{
        animationDuration: "0.8s",
        animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        stroke="currentColor"
        strokeWidth={trackWidth}
        strokeLinecap="round"
        className="opacity-15"
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        stroke="currentColor"
        strokeWidth={trackWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * 0.7}
      />
    </svg>
  );
}

export default Spinner;
