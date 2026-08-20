import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-90 focus-visible:ring-ring",
        // Headline action: the same quiet gold as landing Sign up. One per screen.
        brand:
          "border border-gold bg-gold text-gold-foreground shadow-[0_8px_28px_color-mix(in_srgb,var(--gold)_28%,transparent)] hover:bg-[color-mix(in_srgb,var(--gold)_88%,#fff)] hover:border-[color-mix(in_srgb,var(--gold)_88%,#fff)] focus-visible:ring-gold",
        signal:
          "bg-signal text-signal-foreground shadow-[0_8px_28px_color-mix(in_srgb,var(--signal)_35%,transparent)] hover:brightness-110 focus-visible:ring-signal",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring",
        outline:
          "border border-border bg-background hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring",
        // Quiet twin of `brand` — landing Sign in gold outline.
        "outline-brand":
          "border border-gold/55 bg-transparent text-gold hover:border-gold hover:bg-gold/10 focus-visible:ring-gold",
        ghost: "hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-ring",
      },
      size: {
        sm: "h-8 px-3",
        default: "h-9 px-4 py-2",
        lg: "h-10 px-6",
        xl: "h-14 px-7 text-base",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
