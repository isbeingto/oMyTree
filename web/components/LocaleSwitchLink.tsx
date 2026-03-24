"use client";

import React from "react";

type SwitchLocale = "en" | "zh-Hans-CN";

function setLocaleCookie(locale: SwitchLocale) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `locale=${encodeURIComponent(locale)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function LocaleSwitchLink({
  toLocale,
  href,
  className,
  children,
}: {
  toLocale: SwitchLocale;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Always set cookie (sync) so middleware doesn't bounce users back.
        setLocaleCookie(toLocale);

        // Let modified clicks behave normally (new tab/window, download, etc.).
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.metaKey ||
          e.altKey ||
          e.ctrlKey ||
          e.shiftKey
        ) {
          return;
        }
      }}
    >
      {children}
    </a>
  );
}
