import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-2)] px-3 text-sm text-[var(--fg)] outline-none transition-colors focus:border-accent-1",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";
