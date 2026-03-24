"use client";

import React from "react";
import { motion, useInView } from "framer-motion";
import { mt } from "@/lib/site-i18n/marketing";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";
import { AppFrame } from "./AppFrame";
import { PassiveVideo } from "./PassiveVideo";
import {
  LANDING_MEDIA_ASPECT_RATIO,
  pickPreferredMedia,
  sortMediaByOrder,
} from "./landingMediaUtils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface LandingMediaItem {
  id: string;
  section: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  title_en: string;
  title_zh: string;
  description_en: string;
  description_zh: string;
  sortOrder: number;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// Feature SVG icons
// ─────────────────────────────────────────────────────────────
function IconTree() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-6 h-6">
      <path d="M12 4v16M4 8h16" strokeLinecap="round" />
      <circle cx="12" cy="4" r="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <circle cx="4" cy="8" r="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <circle cx="20" cy="8" r="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
      <circle cx="12" cy="20" r="2" fill="currentColor" fillOpacity="0.4" stroke="none" />
    </svg>
  );
}

function IconModel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-6 h-6">
      <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAnnotate() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-6 h-6">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconOutcome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="w-6 h-6">
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.51 0 2.93.37 4.18 1.03" strokeLinecap="round" />
      <path d="M16 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Fallback placeholders (beautiful mock UIs)
// ─────────────────────────────────────────────────────────────
function TreeFallback() {
  const items = [
    { d: 0, label: "主线讨论", color: "bg-emerald-400" },
    { d: 1, label: "分支 A", color: "bg-teal-400" },
    { d: 2, label: "深入探讨", color: "bg-teal-300" },
    { d: 1, label: "分支 B", color: "bg-teal-400" },
    { d: 2, label: "关联问题", color: "bg-teal-300" },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-[#0d1117] p-8">
      <div className="w-full max-w-xs space-y-2.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2.5" style={{ paddingLeft: item.d * 24 }}>
            <div className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
            <div className="h-7 rounded-xl bg-white dark:bg-white/6 border border-slate-200 dark:border-white/8 flex-1 flex items-center px-3 shadow-sm">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelFallback() {
  const models = [
    { name: "GPT-4o", active: true },
    { name: "DeepSeek", active: false },
    { name: "Claude 3.7", active: false },
    { name: "Gemini 2.0", active: false },
  ];
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-slate-50 dark:bg-[#0d1117] p-8">
      <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
        {models.map(({ name, active }) => (
          <div
            key={name}
            className={`rounded-2xl border p-4 flex flex-col gap-2 transition-all ${
              active
                ? "border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10 ring-1 ring-emerald-500/20"
                : "border-slate-200 dark:border-white/8 bg-white dark:bg-white/[0.03]"
            }`}
          >
            <div className={`text-xs font-semibold ${active ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
              {name}
            </div>
            <div className="h-1.5 rounded-full bg-slate-200/70 dark:bg-white/8 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnotateFallback() {
  return (
    <div className="absolute inset-0 flex flex-col bg-white dark:bg-[#0d1117] p-5 gap-4 overflow-hidden">
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/8 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8 w-4/5" />
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8 w-full" />
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8 w-3/4" />
        </div>
      </div>
      <div className="ml-11 px-4 py-3 rounded-2xl border border-amber-400/30 bg-amber-50 dark:bg-amber-400/8 space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400" />
          <div className="h-2 w-20 rounded-full bg-amber-400/40" />
        </div>
        <div className="h-2 rounded-full bg-amber-300/40 w-5/6" />
        <div className="h-2 rounded-full bg-amber-300/30 w-2/3" />
      </div>
      <div className="flex gap-3">
        <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-white/8 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8 w-full" />
          <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8 w-4/6" />
        </div>
      </div>
    </div>
  );
}

function OutcomeFallback() {
  return (
    <div className="absolute inset-0 flex flex-col bg-white dark:bg-[#0d1117] p-5 gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="h-4 w-36 rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          READY
        </div>
      </div>
      <div className="h-px bg-slate-100 dark:bg-white/6" />
      <div className="space-y-3">
        {[100, 88, 95, 72].map((w, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-2.5 rounded-full bg-slate-100 dark:bg-white/8" style={{ width: `${w}%` }} />
              {i % 2 === 0 && <div className="h-2 rounded-full bg-slate-50 dark:bg-white/5 w-4/5" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BentoCard — Bento Box layout card
// ─────────────────────────────────────────────────────────────
interface BentoCardProps {
  icon: React.ReactNode;
  tag?: string;
  title: string;
  description: string;
  mediaNode: React.ReactNode;
  className?: string;
  delay?: number;
  mediaAspectRatio?: string;
}

function BentoCard({ icon, tag, title, description, mediaNode, className = "", delay = 0, mediaAspectRatio = LANDING_MEDIA_ASPECT_RATIO }: BentoCardProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      onMouseMove={handleMouseMove}
      className={`group relative flex flex-col overflow-hidden rounded-[32px] bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200/60 dark:border-white/10 hover:border-emerald-500/30 dark:hover:border-emerald-400/30 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/5 dark:hover:shadow-emerald-400/5 ${className}`}
    >
      {/* Mouse Spotlight Glow */}
      <div
        className="pointer-events-none absolute -inset-px rounded-[31px] opacity-0 transition duration-300 group-hover:opacity-100 z-0"
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(16,185,129,0.06), transparent 40%)`,
        }}
      />

      {/* Text Content */}
      <div className="relative z-10 flex flex-col gap-4 p-8 md:p-10">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/5 shadow-sm border border-slate-200/50 dark:border-white/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform duration-500">
            {icon}
          </div>
          {tag && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 dark:border-emerald-400/20">
              {tag}
            </span>
          )}
        </div>
        <div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white leading-tight mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors duration-500">
            {title}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 leading-relaxed max-w-md">
            {description}
          </p>
        </div>
      </div>

      {/* Media */}
      <div className="relative w-full mt-4 px-8 md:px-10 pb-0 z-10">
        <AppFrame url="www.omytree.com" className="w-full rounded-t-2xl rounded-b-none border-b-0 shadow-2xl transition-transform duration-700 group-hover:-translate-y-3">
          <div className="relative w-full bg-white dark:bg-[#0d1117] overflow-hidden" style={{ aspectRatio: mediaAspectRatio }}>
            <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-[1.03]">
              {mediaNode}
            </div>
          </div>
        </AppFrame>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// BentoFeatures — exported main component
// ─────────────────────────────────────────────────────────────
export function BentoFeatures({ locale = "en" }: { locale?: SiteLocale }) {
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

  function MediaSlot({ section, index = 0, fallback }: { section: string; index?: number; fallback: React.ReactNode }) {
    const list = mediaBySection[section] ?? [];
    const item = pickPreferredMedia(list, index);
    if (!item) return <>{fallback}</>;
    const url = `/api/landing-media/file/${item.filename}`;
    if (item.mimeType?.startsWith("video/")) {
      return (
        <PassiveVideo
          className="absolute inset-0 h-full w-full object-cover"
          src={url}
          preload="metadata"
          playWhenInView
        />
      );
    }
    return <img className="absolute inset-0 h-full w-full object-cover" src={url} alt={item.title_en || item.title_zh || ""} loading="lazy" />;
  }

  const sectionTitle =
    locale === "zh-Hans-CN" ? (
      <>
        <span>这将改变你与 AI 协作的</span>
        <span className="whitespace-nowrap">方式。</span>
      </>
    ) : (
      mt(locale, "value_title")
    );

  return (
    <section id="features" className="relative py-28 md:py-36 overflow-hidden bg-white dark:bg-slate-950">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden -z-0">
        <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/[0.025] dark:bg-emerald-500/[0.04] blur-[140px] rounded-full" />
        <div className="absolute bottom-[10%] right-10 w-[500px] h-[300px] bg-teal-500/[0.03] dark:bg-teal-500/[0.05] blur-[100px] rounded-full" />
      </div>

      <div className="relative container mx-auto px-4 md:px-8 max-w-7xl">
        {/* ════ Section Header ════ */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mb-16 md:mb-24 text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wider uppercase mb-6
            bg-emerald-500/8 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400
            border border-emerald-500/15 dark:border-emerald-400/15">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
            {mt(locale, "layers_badge")}
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter mb-5 text-slate-900 dark:text-white leading-[1.08] text-balance">
            {sectionTitle}
          </h2>

          <p className="text-lg md:text-xl text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto font-light">
            {mt(locale, "layers_subtitle")}
          </p>
        </motion.div>

        {/* ════ Bento Grid ════ */}
        <div className="mt-16 md:mt-24 grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {/* 1. Tree branch (Large, span 8) */}
          <BentoCard
            className="md:col-span-8"
            delay={0.1}
            icon={<IconTree />}
            tag={mt(locale, "l1_badge")}
            title={mt(locale, "l1_tree_title")}
            description={mt(locale, "l1_tree_desc")}
            mediaNode={<MediaSlot section="layer1_tree" index={0} fallback={<TreeFallback />} />}
          />

          {/* 2. Model switch (Medium, span 4) */}
          <BentoCard
            className="md:col-span-4"
            delay={0.2}
            icon={<IconModel />}
            title={mt(locale, "l1_model_title")}
            description={mt(locale, "l1_model_desc")}
            mediaAspectRatio="1 / 1"
            mediaNode={<MediaSlot section="layer1_model" index={0} fallback={<ModelFallback />} />}
          />

          {/* 3. Annotate (Medium, span 4) */}
          <BentoCard
            className="md:col-span-4"
            delay={0.3}
            icon={<IconAnnotate />}
            title={mt(locale, "l1_annotate_title")}
            description={mt(locale, "l1_annotate_desc")}
            mediaAspectRatio="1 / 1"
            mediaNode={<MediaSlot section="layer1_annotation" index={0} fallback={<AnnotateFallback />} />}
          />

          {/* 4. Outcomes (Large, span 8) */}
          <BentoCard
            className="md:col-span-8"
            delay={0.4}
            icon={<IconOutcome />}
            tag={mt(locale, "l2_badge")}
            title={mt(locale, "l2_outcome_title")}
            description={mt(locale, "l2_outcome_desc")}
            mediaNode={<MediaSlot section="layer2_outcome" index={0} fallback={<OutcomeFallback />} />}
          />
        </div>
      </div>
    </section>
  );
}
