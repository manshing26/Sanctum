import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
};

const Spinner: React.FC<SpinnerProps> = ({ className, size = 'md' }) => (
  <Loader2 className={cn('animate-spin text-text-muted', sizeMap[size], className)} />
);

export { Spinner };
