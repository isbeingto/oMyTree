import * as React from "react";
import { cn } from "@/lib/utils";
import { Spinner, SpinnerSize } from "./spinner";

/* ============================================================
 * LoadingOverlay — oMyTree 统一加载遮罩层
 * 
 * 设计理念：
 * - 全屏 / 容器级两种模式
 * - 毛玻璃遮罩效果，与 oMyTree Glass Design System 一致
 * - Spinner + 可选文字标签
 * - 优雅的淡入动画
 * ============================================================ */

export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 全屏模式 (fixed) 或容器模式 (absolute) */
  fullScreen?: boolean;
  /** Spinner 尺寸 */
  spinnerSize?: SpinnerSize;
  /** 加载提示文字 */
  label?: string;
  /** 是否显示半透明背景 */
  backdrop?: boolean;
}

/**
 * 加载遮罩层，支持全屏和容器两种模式。
 * 
 * @example
 * // 全屏加载
 * <LoadingOverlay fullScreen label="正在加载..." />
 * 
 * // 容器级加载（需要父容器 relative）
 * <div className="relative">
 *   <LoadingOverlay label="加载中" />
 * </div>
 */
export function LoadingOverlay({
  fullScreen = false,
  spinnerSize = "lg",
  label,
  backdrop = true,
  className,
  ...props
}: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        "inset-0 z-50 flex flex-col items-center justify-center gap-3",
        fullScreen ? "fixed" : "absolute",
        backdrop && "bg-background/60 dark:bg-background/70 backdrop-blur-sm",
        "animate-in fade-in duration-200",
        className
      )}
      {...props}
    >
      <Spinner size={spinnerSize} label={label} showLabel={!!label} />
    </div>
  );
}

/* ============================================================
 * PageLoader — 路由级 loading.tsx 标配组件
 * 
 * 由 进度条 + 可选中心 spinner 组成
 * ============================================================ */

export interface PageLoaderProps {
  /** 是否显示中心 spinner（较重的页面推荐开启） */
  showSpinner?: boolean;
  /** Spinner 尺寸 */
  spinnerSize?: SpinnerSize;
  /** 加载提示文字 */
  label?: string;
}

/**
 * 路由切换过渡加载器。
 * 包含顶部品牌色进度条 + 可选中心 spinner。
 * 
 * @example
 * // 在 loading.tsx 中：
 * export default function Loading() {
 *   return <PageLoader showSpinner />;
 * }
 */
export function PageLoader({
  showSpinner = false,
  spinnerSize = "lg",
  label,
}: PageLoaderProps) {
  return (
    <>
      {/* 顶部进度条 */}
      <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 bg-transparent overflow-hidden">
        <div className="h-full bg-primary animate-progress-bar w-full origin-left" />
      </div>

      {/* 中心 Spinner（可选） */}
      {showSpinner && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Spinner size={spinnerSize} label={label} showLabel={!!label} />
        </div>
      )}
    </>
  );
}

/* ============================================================
 * SectionLoader — 内容区块/面板级加载
 * 
 * 针对 Panel 或 Section 级别的加载状态，比全页更轻量
 * ============================================================ */

export interface SectionLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Spinner 尺寸 */
  size?: SpinnerSize;
  /** 加载提示文字 */
  label?: string;
  /** 最小高度 */
  minHeight?: string;
}

/**
 * 区块级加载指示器，用于面板/卡片内的内容加载。
 * 
 * @example
 * {isLoading ? (
 *   <SectionLoader label="加载数据..." />
 * ) : (
 *   <DataTable />
 * )}
 */
export function SectionLoader({
  size = "md",
  label,
  minHeight = "120px",
  className,
  ...props
}: SectionLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 py-8",
        className
      )}
      style={{ minHeight }}
      {...props}
    >
      <Spinner size={size} label={label} showLabel={!!label} />
    </div>
  );
}

export default LoadingOverlay;
