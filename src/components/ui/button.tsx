import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold tracking-tight transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-1 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-accent-1 to-accent-2 text-ash-3 shadow-[0_4px_14px_-2px_var(--color-accent-2)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-4px_var(--color-accent-2)] hover:brightness-105",
        outline:
          "border border-[var(--border)] bg-transparent text-[var(--fg)] hover:border-accent-1 hover:bg-white/5 hover:-translate-y-0.5",
        ghost: "bg-transparent text-[var(--fg)] hover:bg-white/5",
        destructive: "bg-red-500/90 text-white hover:bg-red-500 hover:-translate-y-0.5",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-7 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
