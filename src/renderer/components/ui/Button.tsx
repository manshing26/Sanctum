import React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-foreground hover:bg-accent-hover focus-visible:ring-accent/50',
        secondary:
          'border border-border bg-surface text-text-primary hover:bg-surface-hover hover:border-accent/50 focus-visible:ring-accent/50',
        ghost:
          'text-text-muted hover:bg-surface-hover hover:text-text-primary focus-visible:ring-accent/50',
        danger:
          'border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20 focus-visible:ring-danger/50',
        'danger-solid':
          'bg-danger text-white hover:bg-danger-hover focus-visible:ring-danger/50',
        warning:
          'border border-warning/30 bg-warning/10 text-warning hover:bg-warning/20 focus-visible:ring-warning/50',
        'warning-solid':
          'bg-warning text-white hover:bg-warning-hover focus-visible:ring-warning/50',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs [&_svg]:h-3.5 [&_svg]:w-3.5',
        md: 'h-9 px-4 text-sm [&_svg]:h-4 [&_svg]:w-4',
        lg: 'h-10 px-5 text-sm [&_svg]:h-5 [&_svg]:w-5',
        icon: 'h-9 w-9 [&_svg]:h-4 [&_svg]:w-4',
        'icon-sm': 'h-7 w-7 [&_svg]:h-3.5 [&_svg]:w-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button, buttonVariants };
