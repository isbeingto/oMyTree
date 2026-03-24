"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function LegalMarkdown({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-8 mb-4 text-slate-900 dark:text-white">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mt-8 mb-4 text-slate-900 dark:text-white">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-medium mt-6 mb-3 text-slate-900 dark:text-white">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="my-4 leading-relaxed text-slate-600 dark:text-slate-400">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="my-4 pl-6 list-disc space-y-2 text-slate-600 dark:text-slate-400">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-4 pl-6 list-decimal space-y-2 text-slate-600 dark:text-slate-400">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-slate-200">
                {children}
              </code>
            );
          }
          return (
            <code className="block p-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-mono overflow-x-auto">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-4 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-x-auto">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-4 pl-4 border-l-4 border-emerald-500 italic text-slate-600 dark:text-slate-400">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            className="text-emerald-600 dark:text-emerald-400 hover:underline"
            target={href?.startsWith("http") ? "_blank" : undefined}
            rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
          >
            {children}
          </a>
        ),
        hr: () => <hr className="my-8 border-slate-200 dark:border-white/10" />,
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-900 dark:text-white">
            {children}
          </strong>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
