"use client";

import React from "react";

interface AppFrameProps {
  children: React.ReactNode;
  className?: string;
  url?: string;
  showChrome?: boolean;
}

/**
 * macOS-style browser window chrome — wraps landing page screenshots/videos
 * for a polished "product preview" look.
 * Fully supports light & dark mode via Tailwind.
 */
export function AppFrame({
  children,
  className = "",
  url = "www.omytree.com",
  showChrome = true,
}: AppFrameProps) {
  return (
    <div
      className={[
        "relative flex flex-col rounded-[18px] md:rounded-[22px] overflow-hidden select-none",
        // Light shadow stack
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.06),0_24px_48px_-8px_rgba(0,0,0,0.10)]",
        // Dark shadow stack
        "dark:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.4),0_24px_64px_-8px_rgba(0,0,0,0.55)]",
        // Border
        "ring-1 ring-slate-200/90 dark:ring-white/[0.07]",
        "bg-white dark:bg-[#0d1117]",
        className,
      ].join(" ")}
    >
      {showChrome ? (
        <div
          className={[
            "h-9 md:h-10 flex items-center px-3 md:px-4 gap-3 shrink-0",
            "bg-slate-100/90 dark:bg-[#161b22]",
            "border-b border-slate-200/80 dark:border-white/[0.05]",
          ].join(" ")}
        >
          {/* Traffic-light dots */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#ff5f56] dark:bg-[#ff453a]" />
            <span className="block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#ffbd2e] dark:bg-[#ffd60a]" />
            <span className="block w-2.5 h-2.5 md:w-3 md:h-3 rounded-full bg-[#27c93f] dark:bg-[#32d74b]" />
          </div>

          {/* URL pill — centred */}
          <div className="flex-1 flex justify-center min-w-0">
            <div
              className={[
                "inline-flex items-center gap-1 px-2.5 py-[3px] rounded-[6px]",
                "bg-white/80 dark:bg-white/[0.06]",
                "ring-1 ring-slate-200/70 dark:ring-white/[0.07]",
                "text-[10px] md:text-[11px] leading-5 font-medium",
                "text-slate-400 dark:text-slate-500",
                "max-w-[180px] md:max-w-[220px] truncate",
              ].join(" ")}
            >
              {/* Lock icon */}
              <svg className="w-2.5 h-2.5 text-emerald-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="truncate">{url}</span>
            </div>
          </div>

          {/* Right spacer keeps URL centred */}
          <div className="w-14 shrink-0" />
        </div>
      ) : null}

      {/* ─── Page content ─── */}
      <div className="relative flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
