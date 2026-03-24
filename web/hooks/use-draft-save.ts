import { useEffect, useRef } from "react";

/**
 * 简单的 localStorage 草稿保存 hook
 * 不会影响 hydration，因为完全在客户端运行
 */
export function useDraftSave<T extends Record<string, any>>(
  key: string,
  value: T,
  enabled: boolean = true
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    // 清除之前的定时器
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // 设置新的自动保存
    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (err) {
        console.warn(`Failed to save draft to ${key}:`, err);
      }
    }, 1000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [key, value, enabled]);
}

/**
 * 从 localStorage 恢复草稿
 */
export function restoreDraft<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;

  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.warn(`Failed to restore draft from ${key}:`, err);
  }

  return defaultValue;
}

/**
 * 清除草稿
 */
export function clearDraft(key: string) {
  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`Failed to clear draft ${key}:`, err);
  }
}
