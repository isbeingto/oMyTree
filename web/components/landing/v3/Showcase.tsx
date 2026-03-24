"use client";

import React from "react";
import { motion } from "framer-motion";
import { mt } from "@/lib/site-i18n/marketing";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";
import { AppFrame } from "./AppFrame";
import { PassiveVideo } from "./PassiveVideo";
import {
  LANDING_MEDIA_ASPECT_RATIO,
  pickPreferredMedia,
  sortMediaByOrder,
} from "./landingMediaUtils";

interface LandingMediaItem {
  id: string;
  section: string;
  filename: string;
  mimeType: string;
  sortOrder: number;
}

function IconLayer3() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-6 h-6">
      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9" strokeLinecap="round" />
      <path d="M16 3l4 1-1 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 8v4l3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconKnowledge() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconReuse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="w-5 h-5">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Layer3Fallback() {
  return (
    <div className="absolute inset-0 flex bg-white dark:bg-[#0d1117]">
      {/* Knowledge list */}
      <div className="w-64 border-r border-slate-100 dark:border-white/5 p-4 flex flex-col gap-2 shrink-0">
        <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mb-2 px-1">KNOWLEDGE BASE</div>
        {[
          { name: "研究报告 2025.pdf", active: true },
          { name: "用户访谈记录.md", active: false },
          { name: "竞品分析.docx", active: false },
          { name: "产品规划 Q1.txt", active: false },
        ].map((item, i) => (
          <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${item.active ? "bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20" : "hover:bg-slate-50 dark:hover:bg-white/4"}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${item.active ? "bg-emerald-500/20" : "bg-slate-100 dark:bg-white/8"}`}>
              <div className={`w-2.5 h-3 rounded-sm ${item.active ? "bg-emerald-500/60" : "bg-slate-400/40 dark:bg-white/20"}`} />
            </div>
            <div className={`text-[10px] truncate ${item.active ? "text-emerald-700 dark:text-emerald-300 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
              {item.name}
            </div>
          </div>
        ))}
        <div className="mt-3 px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-white/15 flex items-center gap-2 cursor-pointer">
          <div className="w-4 h-4 rounded flex items-center justify-center text-slate-400 dark:text-slate-500">+</div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 w-24" />
        </div>
      </div>
      {/* RAG chat */}
      <div className="flex-1 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            RAG ON
          </div>
          <div className="h-3 w-32 rounded-full bg-slate-200 dark:bg-white/10" />
        </div>
        <div className="flex-1 p-5 flex flex-col gap-4 overflow-hidden">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-white/10 shrink-0" />
            <div className="max-w-md bg-white dark:bg-[#161b22] rounded-2xl rounded-tl-sm p-3 border border-slate-200 dark:border-white/8 shadow-sm space-y-2">
              {[100, 88, 76].map((w, i) => <div key={i} className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10" style={{ width: `${w}%` }} />)}
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/6">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div className="h-2 rounded-full bg-emerald-400/30 w-32" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 dark:border-white/5 p-4">
          <div className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/8 px-4 py-3">
            <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-white/8" />
            <div className="w-7 h-7 rounded-xl bg-emerald-500/15" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ShowcaseProps {
  locale?: SiteLocale;
}

export function Showcase({ locale = "en" }: ShowcaseProps) {
  const [mediaBySection, setMediaBySection] = React.useState<Record<string, LandingMediaItem[]>>({});

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/landing-media", { cache: "no-store" });
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.items)) return;
        const grouped: Record<string, LandingMediaItem[]> = {};
        for (const item of data.items as LandingMediaItem[]) {
          if (!grouped[item.section]) grouped[item.section] = [];
          grouped[item.section].push(item);
        }
        for (const sec of Object.keys(grouped)) {
          grouped[sec] = sortMediaByOrder(grouped[sec]);
        }
        if (!cancelled) setMediaBySection(grouped);
      } catch { /* use fallbacks */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function getMedia(section: string) {
    const list = mediaBySection[section] ?? [];
    const item = pickPreferredMedia(list);
    if (!item) return null;
    return { url: `/api/landing-media/file/${item.filename}`, isVideo: item.mimeType?.startsWith("video/") };
  }

  const media = getMedia("showcase_layer3");

  return (
    <section className="py-28 md:py-36 relative bg-slate-50 dark:bg-slate-900/40 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.07] to-transparent" />
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/[0.07] to-transparent" />
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] blur-[100px] rounded-full" />
      </div>

      <div className="relative container mx-auto px-4 md:px-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* ── Text Content ── */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-5 flex flex-col justify-center"
          >
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wider uppercase mb-6
              bg-emerald-500/8 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400
              border border-emerald-500/15 dark:border-emerald-400/15 w-fit">
              <IconLayer3 />
              {mt(locale, "l3_badge")}
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter mb-5 text-slate-900 dark:text-white leading-[1.08] text-balance">
              {mt(locale, "l3_title")}
            </h2>

            <p className="text-lg text-slate-500 dark:text-slate-400 leading-relaxed mb-10 font-light">
              {mt(locale, "l3_subtitle")}
            </p>

            <div className="space-y-8">
              {/* Feature 1 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                  <IconKnowledge />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                    {mt(locale, "l3_knowledge_title")}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {mt(locale, "l3_knowledge_desc")}
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-emerald-400">
                  <IconReuse />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
                    {mt(locale, "l3_reuse_title")}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    {mt(locale, "l3_reuse_desc")}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Screenshot area ── */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="lg:col-span-7 relative"
          >
            {/* Glow */}
            <div className="absolute inset-x-[10%] -top-6 h-12 bg-emerald-500/15 dark:bg-emerald-500/20 blur-[50px] rounded-full pointer-events-none" />

            <AppFrame url="www.omytree.com/app?panel=knowledge" className="w-full shadow-2xl">
              <div className="relative overflow-hidden" style={{ aspectRatio: LANDING_MEDIA_ASPECT_RATIO }}>
                {media ? (
                  media.isVideo ? (
                    <PassiveVideo
                      className="absolute inset-0 w-full h-full object-cover"
                      src={media.url}
                      preload="metadata"
                      playWhenInView
                    />
                  ) : (
                    <img
                      className="absolute inset-0 w-full h-full object-cover"
                      src={media.url}
                      alt={mt(locale, "l3_title")}
                      loading="lazy"
                    />
                  )
                ) : (
                  <Layer3Fallback />
                )}
              </div>
            </AppFrame>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
