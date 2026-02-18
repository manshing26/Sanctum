import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/utils';

type StarRatingProps = {
  value: number | undefined;
  onChange?: (rating: number | null) => void;
  size?: 'sm' | 'md';
  readOnly?: boolean;
};

export const StarRating = ({
  value,
  onChange,
  size = 'md',
  readOnly = false,
}: StarRatingProps): React.JSX.Element => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const currentValue = value ?? 0;
  const displayValue = hoverIndex !== null ? hoverIndex : currentValue;

  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const gap = size === 'sm' ? 'gap-0' : 'gap-0.5';

  return (
    <div
      className={cn('inline-flex items-center', gap)}
      onMouseLeave={() => !readOnly && setHoverIndex(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= displayValue;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => {
              if (readOnly || !onChange) return;
              onChange(star === currentValue ? null : star);
            }}
            onMouseEnter={() => !readOnly && setHoverIndex(star)}
            className={cn(
              'transition-colors',
              readOnly
                ? 'cursor-default'
                : 'cursor-pointer hover:scale-110',
              filled
                ? 'text-yellow-400'
                : 'text-text-muted/30',
            )}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
          >
            <Star
              className={cn(iconSize, filled && 'fill-current')}
            />
          </button>
        );
      })}
    </div>
  );
};
