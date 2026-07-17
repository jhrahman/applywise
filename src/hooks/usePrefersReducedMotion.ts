import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Tracks the OS "reduce motion" setting.
 *
 * CSS handles this on its own (see the media query in index.css); this is for
 * motion driven from JS, which can't be reached that way.
 *
 * Reads the value during the initial state rather than in an effect on purpose:
 * an effect runs after the first paint, so an animation would play a frame or
 * two before being told to stop — the exact flash the setting exists to avoid.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = () => setPrefersReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return prefersReduced;
}
