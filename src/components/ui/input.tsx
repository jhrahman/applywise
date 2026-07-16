import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-dim)] outline-none transition-colors focus:border-accent-1",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";
