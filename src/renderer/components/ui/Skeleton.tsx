import React from 'react';
import { cn } from '../../lib/utils';

const Skeleton: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-border/30', className)}
      {...props}
    />
  );
};

export { Skeleton };
