"use client";

import React, { useRef, useEffect } from "react";

export function InteractiveGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const glow = glowRef.current;
    if (!container || !glow) return;

    const current = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let rafId = 0;

    const placeAt = (x: number, y: number) => {
      glow.style.left = `${x}px`;
      glow.style.top = `${y}px`;
    };

    const setCenter = () => {
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      current.x = cx;
      current.y = cy;
      target.x = cx;
      target.y = cy;
      placeAt(cx, cy);
    };

    const tick = () => {
      current.x += (target.x - current.x) * 0.12;
      current.y += (target.y - current.y) * 0.12;
      placeAt(current.x, current.y);
      rafId = window.requestAnimationFrame(tick);
    };

    const updateTarget = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      target.x = clientX - rect.left;
      target.y = clientY - rect.top;
    };

    const handlePointerMove = (e: PointerEvent) => {
      updateTarget(e.clientX, e.clientY);
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateTarget(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      updateTarget(e.touches[0].clientX, e.touches[0].clientY);
    };

    setCenter();
    rafId = window.requestAnimationFrame(tick);
    window.addEventListener("resize", setCenter);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", setCenter);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
    >
      {/* The base grid */}
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"
        style={{
          maskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, #000 70%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 50%, #000 70%, transparent 100%)",
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,transparent,rgba(16,185,129,0.05),transparent)] w-1/2 h-full -translate-x-full animate-[scan_8s_linear_infinite]" />
      </div>
      
      {/* The spotlight glow */}
      <div
        ref={glowRef}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-[120px]"
      />

      {/* Accentuating circles */}
      <div className="absolute top-0 left-0 w-full h-full">
         <div className="absolute top-[10%] left-[10%] w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
         <div className="absolute bottom-[20%] right-[10%] w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}
