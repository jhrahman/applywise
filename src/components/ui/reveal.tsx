import * as React from "react";
import { cn } from "@/lib/utils";

// Decelerating curve (easeOutExpo-ish): fast off the mark, gently settling.
// Motion that starts quickly reads as responsive; the long tail is what makes
// it feel considered rather than abrupt.
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const VARIANTS = {
  /** Content within a card — a small lift, so a stagger of several reads as one wave. */
  row: { keyframes: "reveal-row", duration: 340 },
  /** A whole card — travels further and takes longer, because it's a bigger object. */
  block: { keyframes: "reveal-block", duration: 400 },
} as const;

export interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Milliseconds before this element starts arriving. */
  delay?: number;
  variant?: keyof typeof VARIANTS;
}

/**
 * Fades and lifts its children into place once, on mount.
 *
 * Starts at `opacity-0` and animates `forwards`, so the element is invisible
 * until its delay elapses — that's what produces the staggered cascade rather
 * than everything arriving at once. The consequence is that the finished state
 * depends on the animation running: the `prefers-reduced-motion` rule in
 * index.css keys off `data-reveal` to force the end state instead of cancelling
 * the animation, which would otherwise leave content stuck invisible.
 *
 * A CSS animation rather than a JS/spring library: this runs on the compositor,
 * costs no bundle weight, and can't drop frames while the page is still
 * settling after a cold tab open.
 */
export function Reveal({ delay = 0, variant = "row", className, style, ...props }: RevealProps) {
  const { keyframes, duration } = VARIANTS[variant];
  return (
    <div
      data-reveal=""
      className={cn("opacity-0", className)}
      style={{
        animation: `${keyframes} ${duration}ms ${EASING} forwards`,
        animationDelay: `${delay}ms`,
        ...style,
      }}
      {...props}
    />
  );
}
