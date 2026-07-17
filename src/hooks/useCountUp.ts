import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/** Decelerating, to match the CSS easing the reveal animations use. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts from 0 up to `target`, returning the value for the current frame.
 *
 * requestAnimationFrame rather than a CSS transition because the number itself
 * has to change, not just a style — and driving the meter's width from the same
 * value keeps the bar and the digits exactly in step, which they wouldn't be if
 * one were a CSS transition and the other a JS loop.
 *
 * Returns `target` immediately when the user prefers reduced motion, or when
 * `enabled` is false — the number is information, so it must always arrive.
 */
export function useCountUp(
  target: number,
  { delay = 0, duration = 650, enabled = true }: { delay?: number; duration?: number; enabled?: boolean } = {}
): number {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animate = enabled && !prefersReducedMotion;
  const [value, setValue] = useState(() => (animate ? 0 : target));

  useEffect(() => {
    if (!animate) {
      setValue(target);
      return;
    }

    let frame = 0;
    let startedAt = 0;

    const tick = (now: number) => {
      startedAt ||= now;
      const progress = Math.min(1, (now - startedAt) / duration);
      setValue(Math.round(target * easeOutCubic(progress)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    const timer = setTimeout(() => {
      frame = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, delay, duration, animate]);

  return value;
}
