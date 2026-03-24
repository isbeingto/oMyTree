"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ChevronDown, Pause, Play } from "lucide-react";
import { mt } from "@/lib/site-i18n/marketing";
import type { SiteLocale } from "@/lib/site-i18n/locale-utils";
import { InteractiveGrid } from "./InteractiveGrid";
import { AppFrame } from "./AppFrame";
import { PassiveVideo } from "./PassiveVideo";
import {
  LANDING_HERO_MAIN_ASPECT_RATIO,
  pickPreferredMedia,
} from "./landingMediaUtils";

interface HeroProps {
  isLoggedIn?: boolean;
  locale?: SiteLocale;
}

type HeroPreviewMedia = { url: string; isVideo: boolean } | null;

const HERO_MEDIA_CACHE_TTL_MS = 10 * 60 * 1000;
const HERO_MEDIA_SESSION_KEY = "omytree:hero:media:v1";
const HERO_POSTER_SESSION_PREFIX = "omytree:hero:poster:";

const heroPreviewRuntimeCache: {
  media: HeroPreviewMedia;
  fetchedAt: number;
  inflight: Promise<HeroPreviewMedia> | null;
  posterByUrl: Record<string, string>;
} = {
  media: null,
  fetchedAt: 0,
  inflight: null,
  posterByUrl: {},
};

function isMediaCacheFresh() {
  if (!heroPreviewRuntimeCache.media) return false;
  return Date.now() - heroPreviewRuntimeCache.fetchedAt < HERO_MEDIA_CACHE_TTL_MS;
}

function readSessionMedia(): HeroPreviewMedia {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HERO_MEDIA_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { url?: string; isVideo?: boolean; ts?: number };
    if (!parsed?.url || typeof parsed.isVideo !== "boolean") return null;
    if (typeof parsed.ts === "number" && Date.now() - parsed.ts > HERO_MEDIA_CACHE_TTL_MS) return null;
    return { url: parsed.url, isVideo: parsed.isVideo };
  } catch {
    return null;
  }
}

function writeSessionMedia(media: HeroPreviewMedia) {
  if (typeof window === "undefined" || !media) return;
  try {
    window.sessionStorage.setItem(
      HERO_MEDIA_SESSION_KEY,
      JSON.stringify({ ...media, ts: Date.now() }),
    );
  } catch { /* ignore */ }
}

function readCachedPoster(url?: string): string | undefined {
  if (!url) return undefined;
  if (heroPreviewRuntimeCache.posterByUrl[url]) return heroPreviewRuntimeCache.posterByUrl[url];
  if (typeof window === "undefined") return undefined;
  try {
    const val = window.sessionStorage.getItem(`${HERO_POSTER_SESSION_PREFIX}${url}`);
    if (!val) return undefined;
    heroPreviewRuntimeCache.posterByUrl[url] = val;
    return val;
  } catch {
    return undefined;
  }
}

function writeCachedPoster(url: string, posterDataUrl: string) {
  heroPreviewRuntimeCache.posterByUrl[url] = posterDataUrl;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`${HERO_POSTER_SESSION_PREFIX}${url}`, posterDataUrl);
  } catch { /* ignore quota errors */ }
}

export function Hero({ isLoggedIn = false, locale = "en" }: HeroProps) {
  // NOTE: Keep the initial render deterministic across SSR and the client.
  // Reading sessionStorage/matchMedia during render can cause hydration mismatches (React #418).
  const [heroMedia, setHeroMedia] = React.useState<HeroPreviewMedia>(null);
  const [mediaQueryDone, setMediaQueryDone] = React.useState(false);
  // 视频/图片实际可播放/加载完成前保持 false，用于控制淡入
  const [mediaReady, setMediaReady] = React.useState(false);
  const [heroPoster, setHeroPoster] = React.useState<string | undefined>(undefined);
  const [mockFallbackReached, setMockFallbackReached] = React.useState(false);
  const [queryHintVisible, setQueryHintVisible] = React.useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = React.useState<boolean>(true);
  const [heroPausedByUser, setHeroPausedByUser] = React.useState<boolean | null>(null);
  const heroPaused = heroPausedByUser ?? !isDesktopViewport;

  const capturePosterFromVideo = React.useCallback((video: HTMLVideoElement, url?: string) => {
    if (!url || readCachedPoster(url)) return;
    if (video.videoWidth < 2 || video.videoHeight < 2) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.78);
      writeCachedPoster(url, dataUrl);
      setHeroPoster(dataUrl);
    } catch {
      // Ignore canvas/security errors and keep going without poster cache.
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const hydrateFromMedia = (media: HeroPreviewMedia) => {
      if (cancelled) return;
      if (media) {
        setHeroMedia(media);
        const cachedPoster = readCachedPoster(media.url);
        if (cachedPoster) setHeroPoster(cachedPoster);
      }
      setMediaQueryDone(true);
    };

    // Try fast client-only caches first.
    const sessionMedia = readSessionMedia();
    if (sessionMedia) {
      heroPreviewRuntimeCache.media = sessionMedia;
      heroPreviewRuntimeCache.fetchedAt = Date.now();
      hydrateFromMedia(sessionMedia);
      return () => { cancelled = true; };
    }

    if (isMediaCacheFresh()) {
      hydrateFromMedia(heroPreviewRuntimeCache.media);
      return () => { cancelled = true; };
    }

    if (heroPreviewRuntimeCache.inflight) {
      heroPreviewRuntimeCache.inflight.then(hydrateFromMedia).catch(() => hydrateFromMedia(null));
      return () => { cancelled = true; };
    }

    const request = (async (): Promise<HeroPreviewMedia> => {
      try {
        const res = await fetch("/api/landing-media", { cache: "force-cache" });
        const data = await res.json();
        if (!data?.ok || !Array.isArray(data.items)) return null;
        const item = pickPreferredMedia(
          (data.items as Array<{ section: string; filename: string; mimeType: string; sortOrder?: number }>)
            .filter((i) => i.section === "hero_app"),
        );
        if (!item) return null;
        const media = {
          url: `/api/landing-media/file/${item.filename}`,
          isVideo: item.mimeType?.startsWith("video/"),
        };
        heroPreviewRuntimeCache.media = media;
        heroPreviewRuntimeCache.fetchedAt = Date.now();
        writeSessionMedia(media);
        return media;
      } catch {
        return null;
      }
    })();

    heroPreviewRuntimeCache.inflight = request;
    request
      .then(hydrateFromMedia)
      .catch(() => hydrateFromMedia(null))
      .finally(() => {
        if (heroPreviewRuntimeCache.inflight === request) {
          heroPreviewRuntimeCache.inflight = null;
        }
      });

    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 840px)");
    const syncViewport = () => setIsDesktopViewport(mq.matches);
    syncViewport();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", syncViewport);
      return () => mq.removeEventListener("change", syncViewport);
    }
    mq.addListener(syncViewport);
    return () => mq.removeListener(syncViewport);
  }, []);

  React.useEffect(() => {
    setMediaReady(false);
    setMockFallbackReached(false);
    setHeroPausedByUser(null);
    setHeroPoster(readCachedPoster(heroMedia?.url));
  }, [heroMedia?.url]);

  React.useEffect(() => {
    if (!heroMedia) return;
    const t = window.setTimeout(() => setMockFallbackReached(true), heroPoster ? 260 : 1000);
    return () => window.clearTimeout(t);
  }, [heroMedia?.url, heroPoster]);

  React.useEffect(() => {
    if (mediaQueryDone) {
      setQueryHintVisible(false);
      return;
    }
    const t = window.setTimeout(() => setQueryHintVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, [mediaQueryDone]);

  const shouldShowMock = !heroMedia || (!mediaReady && !mockFallbackReached && !heroPoster);
  const shouldShowMediaLayer = Boolean(heroMedia) && !shouldShowMock;
  const isHeroVideo = heroMedia?.isVideo ?? false;
  const shouldShowMediaLoadingHint = Boolean(heroMedia)
    && isHeroVideo
    && !mediaReady
    && !shouldShowMock;

  const toggleHeroPlayback = React.useCallback(() => {
    setHeroPausedByUser((prev) => {
      const current = prev ?? !isDesktopViewport;
      return !current;
    });
  }, [isDesktopViewport]);

  return (
    <section className="relative flex flex-col items-center justify-center overflow-hidden pt-32 pb-0">
      <InteractiveGrid />

      <div className="container relative z-10 mx-auto px-4 text-center">
        {/* Release Status Badge */}
        <div
          className="mb-8"
          style={{ animation: "hero-pop 520ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        >
          <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 backdrop-blur-md">
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {mt(locale, "hero_badge")}
          </span>
        </div>

        {/* Main Title with Masking & Shimmer */}
        <h1
          className="text-5xl md:text-8xl font-black tracking-tight mb-6 leading-[1.1] text-slate-950 dark:text-white"
          style={{
            animation: "hero-rise 820ms cubic-bezier(0.22, 1, 0.36, 1) both",
            animationDelay: "120ms",
          }}
        >
          <span className="inline-block">{mt(locale, "hero_title_1")}</span>
          <br />
          <span className="relative">
             <span
               className="bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 bg-clip-text text-transparent"
               style={{ WebkitTextFillColor: "transparent" }}
             >
               {mt(locale, "hero_title_2")}
             </span>
             {/* Decorative underscore */}
             <span
               className="absolute -bottom-2 left-0 right-0 h-1 bg-emerald-500/30 origin-left"
               style={{
                 animation: "hero-underline 1000ms cubic-bezier(0.22, 1, 0.36, 1) both",
                 animationDelay: "800ms",
               }}
             />
          </span>
        </h1>

        {/* Descriptive Subtext */}
        <p
          className="max-w-2xl mx-auto text-lg md:text-xl text-slate-600 dark:text-slate-400 mb-10 leading-relaxed font-light"
          style={{
            animation: "hero-rise 820ms cubic-bezier(0.22, 1, 0.36, 1) both",
            animationDelay: "260ms",
          }}
        >
          {mt(locale, "hero_subtitle")}
        </p>

        {/* Dual Actions */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            href={isLoggedIn ? "/app" : "/auth/register?next=/app"}
            className="group relative px-8 py-4 bg-emerald-600 dark:bg-emerald-500 text-white font-bold rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] animate-[shimmer_3s_infinite]" />
            <span className="relative z-10 flex items-center gap-2">
              {isLoggedIn ? mt(locale, "cta_open") : mt(locale, "hero_cta_start")}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </Link>

          <Link
            href="#features"
            className="group px-8 py-4 bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-semibold rounded-2xl transition-all backdrop-blur-xl hover:scale-105 active:scale-95"
          >
            <span className="flex items-center gap-2">
              {mt(locale, "hero_cta_demo")}
              <ChevronDown className="w-4 h-4 group-hover:translate-y-1 transition-transform" />
            </span>
          </Link>
        </motion.div>

        {/* ── Hero App Preview ── */}
        <motion.div
          initial={{ opacity: 0, y: 64 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 md:mt-20 mx-auto relative w-[min(94vw,1120px)]"
        >
          {/* Ambient glow behind the frame */}
          <div className="absolute inset-x-[8%] -top-6 h-12 bg-emerald-500/25 blur-[48px] rounded-full pointer-events-none" />

          <AppFrame url="www.omytree.com" className="w-full" showChrome={false}>
            <div className="relative w-full" style={{ aspectRatio: LANDING_HERO_MAIN_ASPECT_RATIO }}>
              {/* Media layer: fades in once video/image is actually loaded */}
              {heroMedia && (
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{ opacity: shouldShowMediaLayer ? 1 : 0 }}
                >
                  {heroMedia.isVideo ? (
                    <>
                      <PassiveVideo
                        className="absolute inset-0 w-full h-full object-contain"
                        src={heroMedia.url}
                        poster={heroPoster}
                        preload={isDesktopViewport ? "auto" : "metadata"}
                        paused={heroPaused}
                        playWhenInView
                        onMetadataReady={(video) => {
                          if (heroPoster) {
                            setMediaReady(true);
                            capturePosterFromVideo(video, heroMedia.url);
                          }
                        }}
                        onReady={(video) => {
                          setMediaReady(true);
                          capturePosterFromVideo(video, heroMedia.url);
                        }}
                      />
                      <button
                        type="button"
                        aria-label={heroPaused ? "Play hero preview" : "Pause hero preview"}
                        onClick={toggleHeroPlayback}
                        className="absolute z-20 bottom-3 right-3 md:bottom-4 md:left-4 md:right-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20 backdrop-blur-md transition-transform hover:scale-105 active:scale-95"
                      >
                        {heroPaused ? <Play className="h-3.5 w-3.5 translate-x-[0.5px]" /> : <Pause className="h-3.5 w-3.5" />}
                      </button>
                    </>
                  ) : (
                    <img
                      className="absolute inset-0 w-full h-full object-contain"
                      src={heroMedia.url}
                      alt="oMyTree app preview"
                      onLoad={() => setMediaReady(true)}
                    />
                  )}
                </div>
              )}
              <div
                className="absolute inset-0 flex flex-col bg-white dark:bg-[#0d1117] transition-opacity duration-500"
                style={{ opacity: shouldShowMock ? 1 : 0 }}
                aria-hidden="true"
              >
                {/* App top bar */}
                <div className="h-10 border-b border-slate-100 dark:border-white/5 flex items-center px-5 gap-3">
                  <div className="w-5 h-5 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" />
                  </div>
                  <div className="w-28 h-3 rounded-full bg-slate-200 dark:bg-white/10" />
                  <div className="flex-1" />
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/6" />
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/6" />
                    <div className="w-16 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20" />
                  </div>
                </div>
                {/* Sidebar + canvas body */}
                <div className="flex flex-1 overflow-hidden">
                  {/* Tree sidebar */}
                  <div className="w-48 border-r border-slate-100 dark:border-white/5 p-3 flex flex-col gap-2">
                    {[1, 0, 2, 1, 2, 0, 1].map((indent, i) => (
                      <div key={i} className="flex items-center gap-1.5" style={{ paddingLeft: indent * 14 }}>
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${indent === 0 ? "bg-emerald-400/80" : "bg-slate-300 dark:bg-white/20"}`} />
                        <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 flex-1" />
                      </div>
                    ))}
                  </div>
                  {/* Main chat area */}
                  <div className="flex-1 bg-slate-50/50 dark:bg-black/20 flex flex-col">
                    <div className="flex-1 p-6 flex flex-col gap-4 overflow-hidden">
                      {/* AI bubble */}
                      <div className="flex gap-3 max-w-lg">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 shrink-0 mt-0.5" />
                        <div className="flex-1 bg-white dark:bg-[#161b22] rounded-2xl rounded-tl-sm p-3 border border-slate-200 dark:border-white/8 shadow-sm space-y-1.5">
                          <div className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10 w-4/5" />
                          <div className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10 w-full" />
                          <div className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10 w-3/4" />
                        </div>
                      </div>
                      {/* User bubble */}
                      <div className="flex gap-3 max-w-lg self-end">
                        <div className="bg-emerald-600 dark:bg-emerald-500 rounded-2xl rounded-tr-sm p-3 space-y-1.5">
                          <div className="h-2.5 rounded-full bg-white/30 w-32" />
                          <div className="h-2.5 rounded-full bg-white/20 w-24" />
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 shrink-0 mt-0.5" />
                      </div>
                      {/* Another AI bubble */}
                      <div className="flex gap-3 max-w-xl">
                        <div className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-white/10 shrink-0 mt-0.5" />
                        <div className="flex-1 bg-white dark:bg-[#161b22] rounded-2xl rounded-tl-sm p-3 border border-slate-200 dark:border-white/8 shadow-sm space-y-1.5">
                          <div className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10 w-full" />
                          <div className="h-2.5 rounded-full bg-slate-150 dark:bg-white/10 w-5/6" />
                          <div className="h-2.5 rounded-full bg-emerald-500/15 w-2/3" />
                        </div>
                      </div>
                    </div>
                    {/* Input bar */}
                    <div className="border-t border-slate-100 dark:border-white/5 p-4">
                      <div className="flex items-center gap-3 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/8 px-4 py-3">
                        <div className="flex-1 h-3 rounded-full bg-slate-100 dark:bg-white/8" />
                        <div className="w-7 h-7 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                          <div className="w-3 h-3 rounded-sm bg-emerald-500/60 rotate-45" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {queryHintVisible && !mediaQueryDone && !heroMedia && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/18 dark:bg-black/18 backdrop-blur-[2px]">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/85 dark:bg-slate-900/75 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200/80 dark:ring-white/15">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    Loading live preview...
                  </div>
                </div>
              )}
              {shouldShowMediaLoadingHint && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/18 dark:bg-black/25 backdrop-blur-[2px]">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/88 dark:bg-slate-900/80 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 ring-1 ring-slate-200/80 dark:ring-white/15">
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-emerald-500/80 border-t-transparent" />
                    Streaming preview...
                  </div>
                </div>
              )}
            </div>
          </AppFrame>

          {/* Fade edge at the bottom (creates a "peek" transition into features) */}
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white dark:from-slate-950 to-transparent pointer-events-none" />
        </motion.div>
      </div>
      
      {/* Decorative Blur Orbs */}
      <div className="absolute top-[20%] -left-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[10%] -right-20 w-96 h-96 bg-teal-500/10 rounded-full blur-[120px] pointer-events-none" />
    </section>
  );
}
