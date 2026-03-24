"use client";

import React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { stripLocalePrefix } from "@/lib/site-i18n/locale-utils";

const DISABLED_PREFIXES = ["/api"];

export function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const disableMotion = DISABLED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const shouldAnimate = !reduceMotion && !disableMotion;
  const hasMountedRef = React.useRef(false);

  React.useEffect(() => {
    hasMountedRef.current = true;
  }, []);

  // Only run the outer page enter transition after the first mount.
  // This avoids surprising mount animations on deep links, while still allowing
  // nested Framer Motion components (e.g. landing Hero) to animate normally.
  const shouldAnimatePageEnter = shouldAnimate && hasMountedRef.current;

  // NOTE: On marketing/landing routes we show a fixed frosted-glass nav (FloatingNav).
  // A transformed sibling (e.g. route transition translateY) can create a new backdrop root
  // and prevent `backdrop-filter` from sampling underlying content, making glass look transparent.
  // To keep glass stable, avoid transform-based transitions on non-app/admin routes.
  const isAppLikeRoute = pathname.startsWith("/app") || pathname.startsWith("/admin");
  const allowTransformTransition = isAppLikeRoute;

  // Docs/changelog pages already have rich per-page enter animations.
  // Applying an extra outer route fade makes navigation look like a double load.
  const marketingPath = stripLocalePrefix(pathname);
  const hasPageOwnedEnterAnimation =
    marketingPath === "/docs" ||
    marketingPath.startsWith("/docs/") ||
    marketingPath === "/changelog" ||
    marketingPath.startsWith("/changelog/");

  // Use a stable key for app/admin routes to prevent unmounting persistent layouts
  // Within these routes, inner pages will still be updated by Next.js App Router
  const segments = pathname.split("/");
  const isPersistentLayout = segments[1] === "app" || segments[1] === "admin";
  const transitionKey = isPersistentLayout ? `/${segments[1]}` : pathname;

  // Fully bypass motion for persistent layouts to avoid any potential flickers during Next.js streaming
  if (isPersistentLayout || hasPageOwnedEnterAnimation) {
    return (
      <div className="w-full flex-1 flex flex-col">
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={transitionKey}
        initial={shouldAnimatePageEnter
          ? (allowTransformTransition ? { opacity: 0, y: 4 } : { opacity: 0 })
          : false}
        animate={allowTransformTransition ? { opacity: 1, y: 0 } : { opacity: 1 }}
        exit={shouldAnimate
          ? (allowTransformTransition ? { opacity: 0, y: -4 } : { opacity: 0 })
          : { opacity: 1 }}
        transition={shouldAnimatePageEnter ? { 
          duration: 0.2, 
          ease: [0.4, 0, 0.2, 1] 
        } : { duration: 0 }}
        style={{ willChange: allowTransformTransition ? "opacity, transform" : "opacity" }}
        className="w-full flex-1 flex flex-col"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
