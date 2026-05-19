import React, { useState, useMemo } from 'react';
import { cn } from '../../lib/utils';

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: boolean;
  showStrength?: boolean;
}

interface StrengthLevel {
  score: number;
  label: string;
  color: string;
  fill: string;
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

  if (score <= 2) return { score, label: 'Weak',   color: '#c36b5f', fill: '#c36b5f' };
  if (score <= 5) return { score, label: 'Medium', color: '#c08a5e', fill: '#c08a5e' };
  return           { score, label: 'Strong', color: '#6a9e7f', fill: '#6a9e7f' };
}

const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, error, showStrength = false, value, style, ...props }, ref) => {
    const [visible, setVisible] = useState(false);
    const passwordValue = typeof value === 'string' ? value : '';

    const strength = useMemo(
      () => (showStrength && passwordValue.length > 0 ? getPasswordStrength(passwordValue) : null),
      [showStrength, passwordValue],
    );

    const borderColor = error ? '#c36b5f' : 'rgba(220,220,200,0.12)';

    return (
      <div className={cn('w-full', className)} style={style}>
        {/* Field: input + eye button side by side, single outer border */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          border: `1px solid ${borderColor}`,
          background: '#070807',
        }}>
          <input
            type={visible ? 'text' : 'password'}
            ref={ref}
            value={value}
            style={{
              minWidth: 0,
              height: 48,
              padding: '0 14px',
              border: 0,
              outline: 0,
              background: 'transparent',
              color: '#e8e6dc',
              fontFamily: MONO,
              fontSize: 13,
            }}
            {...props}
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible(!visible)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              background: 'none',
              border: 'none',
              borderLeft: '1px solid rgba(220,220,200,0.07)',
              cursor: 'pointer',
              color: '#79817a',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12 Q6 5 12 5 Q18 5 22 12 Q18 19 12 19 Q6 19 2 12 Z"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="3" y1="3" x2="21" y2="21"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12 Q6 5 12 5 Q18 5 22 12 Q18 19 12 19 Q6 19 2 12 Z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>

        {/* Strength bar */}
        {strength && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', flex: 1, gap: 3 }}>
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  style={{
                    height: 2,
                    flex: 1,
                    background: strength.score >= level * 2 - 1 ? strength.fill : 'rgba(220,220,200,0.07)',
                    transition: 'background 0.2s',
                  }}
                />
              ))}
            </div>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: strength.color }}>
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
