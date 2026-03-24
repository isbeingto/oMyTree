"use client";

import React from "react";

interface PassiveVideoProps {
  src: string;
  className?: string;
  /** 封面图 URL，视频未加载前显示，避免黑屏 */
  poster?: string;
  /** 预加载策略。英雄区首屏视频建议传 "auto"，默认 "metadata" */
  preload?: "none" | "metadata" | "auto";
  /** 视频第一帧解码完成（loadeddata 事件）时回调，用于触发淡入动画 */
  onReady?: (video: HTMLVideoElement) => void;
  /** 请求开始时回调，可用于展示加载态 */
  onLoadStart?: (video: HTMLVideoElement) => void;
  /** 元数据就绪回调 */
  onMetadataReady?: (video: HTMLVideoElement) => void;
  /** 是否自动播放。默认 true */
  autoPlay?: boolean;
  /** 是否循环。默认 true */
  loop?: boolean;
  /** 外部受控暂停态（如 Hero 的播放开关） */
  paused?: boolean;
  /** 仅在进入视口后播放。默认 true */
  playWhenInView?: boolean;
  /** 视口可见阈值，默认 0.35 */
  inViewThreshold?: number;
  /** 尊重系统“减少动态效果”偏好。默认 true */
  respectReducedMotion?: boolean;
  /** 当未提供 poster 时，是否尝试自动抓取首帧。默认 false */
  inferPosterFromVideo?: boolean;
}

export function PassiveVideo({
  src,
  className = "",
  poster,
  preload = "metadata",
  onReady,
  onLoadStart,
  onMetadataReady,
  autoPlay = true,
  loop = true,
  paused = false,
  playWhenInView = true,
  inViewThreshold = 0.35,
  respectReducedMotion = true,
  inferPosterFromVideo = false,
}: PassiveVideoProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [autoPoster, setAutoPoster] = React.useState<string | undefined>(undefined);
  const [isInView, setIsInView] = React.useState(!playWhenInView);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (!respectReducedMotion) {
      setPrefersReducedMotion(false);
      return;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, [respectReducedMotion]);

  React.useEffect(() => {
    if (!playWhenInView) {
      setIsInView(true);
      return;
    }
    const el = videoRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setIsInView(entry.isIntersecting && entry.intersectionRatio >= inViewThreshold);
      },
      { threshold: [0, inViewThreshold, 1] },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [playWhenInView, inViewThreshold, src]);

  const shouldPlay = autoPlay
    && !paused
    && (!respectReducedMotion || !prefersReducedMotion)
    && (!playWhenInView || isInView);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (shouldPlay) {
      void el.play().catch(() => {
        // Ignore autoplay rejection; user interaction can resume playback.
      });
      return;
    }
    el.pause();
  }, [shouldPlay, src]);

  React.useEffect(() => {
    if (!inferPosterFromVideo) {
      setAutoPoster(undefined);
      return;
    }
    // 若外部已显式传入 poster，直接使用，无需自动捕获
    if (poster) { setAutoPoster(undefined); return; }
    setAutoPoster(undefined);

    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = src;

    const capture = () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth || 1280;
        c.height = v.videoHeight || 720;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0);
          setAutoPoster(c.toDataURL("image/jpeg", 0.82));
        }
      } catch { /* canvas taint / security error: ignore */ } finally {
        v.src = "";
      }
    };

    v.addEventListener("loadeddata", capture, { once: true });
    v.load();

    return () => { v.src = ""; };
  }, [src, poster, inferPosterFromVideo]);

  return (
    <video
      ref={videoRef}
      className={`pointer-events-none select-none ${className}`}
      src={src}
      poster={poster ?? autoPoster}
      muted
      playsInline
      loop={loop}
      autoPlay={autoPlay}
      preload={preload}
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload noplaybackrate noremoteplayback nofullscreen"
      draggable={false}
      tabIndex={-1}
      aria-hidden="true"
      onLoadStart={(event) => onLoadStart?.(event.currentTarget)}
      onLoadedMetadata={(event) => onMetadataReady?.(event.currentTarget)}
      onLoadedData={(event) => onReady?.(event.currentTarget)}
    />
  );
}
