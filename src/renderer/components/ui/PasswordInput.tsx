import React, { useState, useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: boolean;
  showStrength?: boolean;
}

interface StrengthLevel {
  score: number;
  label: string;
  color: string;
  bgColor: string;
}

function getPasswordStrength(password: string): StrengthLevel {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'text-danger', bgColor: 'bg-danger' };
  if (score <= 4) return { score, label: 'Fair', color: 'text-warning', bgColor: 'bg-warning' };
  if (score <= 5) return { score, label: 'Good', color: 'text-info', bgColor: 'bg-info' };
  return { score, label: 'Strong', color: 'text-success', bgColor: 'bg-success' };
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, error, showStrength = false, value, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const passwordValue = typeof value === 'string' ? value : '';

    const strength = useMemo(
      () => (showStrength && passwordValue.length > 0 ? getPasswordStrength(passwordValue) : null),
      [showStrength, passwordValue],
    );

    return (
      <div className="w-full">
        <div className="relative">
          <input
            type={visible ? 'text' : 'password'}
            className={cn(
              'flex h-9 w-full rounded-lg border bg-bg px-3 py-2 pr-10 text-sm text-text-primary outline-none transition placeholder:text-text-muted/50',
              'focus:ring-2',
              error
                ? 'border-danger focus:border-danger focus:ring-danger/20'
                : 'border-border focus:border-accent focus:ring-accent/25',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            ref={ref}
            value={value}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible(!visible)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-text-muted transition-colors hover:text-text-primary"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {strength && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    strength.score >= level * 2 - 1
                      ? strength.bgColor
                      : 'bg-border/30',
                  )}
                />
              ))}
            </div>
            <span className={cn('text-xs font-medium', strength.color)}>
              {strength.label}
            </span>
          </div>
        )}
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';

export { PasswordInput, getPasswordStrength };
