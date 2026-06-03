import React, { useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { fontSize } from '../../theme/typography';

const T = {
  bg: '#0a0c0b',
  bg2: '#10110f',
  line: 'rgba(220,220,200,0.07)',
  line2: 'rgba(220,220,200,0.12)',
  text: '#e8e6dc',
  mute: '#79817a',
  accent: '#7c9a92',
  danger: '#c36b5f',
  warn: '#c08a5e',
};

const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const SERIF = "'Fraunces', Georgia, serif";

export type SanctumDialogVariant = 'default' | 'warning' | 'danger';
export type SanctumDialogSize = 'sm' | 'md' | 'lg' | 'xl';

type SanctumDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: SanctumDialogVariant;
  size?: SanctumDialogSize;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  closeOnOverlay?: boolean;
  showClose?: boolean;
  busy?: boolean;
  zIndex?: number;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
};

type SanctumConfirmDialogProps = Omit<SanctumDialogProps, 'footer'> & {
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
};

const sizeWidth: Record<SanctumDialogSize, number | string> = {
  sm: 360,
  md: 430,
  lg: 560,
  xl: 'min(760px, calc(100vw - 48px))',
};

const variantColor = (variant: SanctumDialogVariant): string => {
  if (variant === 'danger') return T.danger;
  if (variant === 'warning') return T.warn;
  return T.accent;
};

const buttonStyle = (variant: 'secondary' | SanctumDialogVariant, disabled = false): React.CSSProperties => {
  const isSecondary = variant === 'secondary';
  const color = isSecondary ? T.line2 : variantColor(variant);
  return {
    height: 32,
    padding: '0 14px',
    background: isSecondary ? 'none' : color,
    border: `1px solid ${color}`,
    color: isSecondary ? T.mute : T.bg,
    fontFamily: MONO,
    fontSize: fontSize(10),
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
};

export const SanctumDialog = ({
  open,
  onOpenChange,
  title,
  description,
  variant = 'default',
  size = 'md',
  children,
  footer,
  closeOnOverlay = true,
  showClose = true,
  busy = false,
  zIndex = 9999,
  initialFocusRef,
}: SanctumDialogProps): React.JSX.Element => {
  const accent = variantColor(variant);

  const requestOpenChange = (nextOpen: boolean): void => {
    if (busy && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={requestOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          onClick={(event) => event.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex, background: 'rgba(0,0,0,0.72)' }}
        />
        <DialogPrimitive.Content
          onClick={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => {
            if (!initialFocusRef?.current) return;
            event.preventDefault();
            initialFocusRef.current.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (!closeOnOverlay || busy) event.preventDefault();
          }}
          style={{
            position: 'fixed',
            left: '50%',
            top: '50%',
            zIndex: zIndex + 1,
            width: sizeWidth[size],
            maxWidth: 'calc(100vw - 48px)',
            maxHeight: 'calc(100vh - 48px)',
            transform: 'translate(-50%, -50%)',
            background: T.bg2,
            border: `1px solid ${variant === 'default' ? T.line2 : accent}`,
            display: 'flex',
            flexDirection: 'column',
            outline: 'none',
          }}
        >
          <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${T.line}`, position: 'relative' }}>
            <DialogPrimitive.Title style={{ fontFamily: SERIF, fontWeight: 300, fontSize: fontSize(20), color: T.text, margin: '0 0 4px' }}>
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description style={{ fontFamily: MONO, fontSize: fontSize(10), color: T.mute, margin: 0, lineHeight: 1.6 }}>
                {description}
              </DialogPrimitive.Description>
            )}
            {showClose && (
              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  disabled={busy}
                  title="Close"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 12,
                    width: 26,
                    height: 26,
                    background: 'none',
                    border: `1px solid ${T.line2}`,
                    color: T.mute,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    opacity: busy ? 0.55 : 1,
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="2" y1="2" x2="10" y2="10" />
                    <line x1="10" y1="2" x2="2" y2="10" />
                  </svg>
                </button>
              </DialogPrimitive.Close>
            )}
          </div>

          {children && (
            <div style={{ padding: '16px 22px', overflowY: 'auto' }}>
              {children}
            </div>
          )}

          {footer && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 22px 18px', borderTop: children ? `1px solid ${T.line}` : undefined }}>
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export const SanctumConfirmDialog = ({
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmDisabled = false,
  onConfirm,
  variant = 'default',
  children,
  busy = false,
  onOpenChange,
  ...props
}: SanctumConfirmDialogProps): React.JSX.Element => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <SanctumDialog
      {...props}
      variant={variant}
      busy={busy}
      onOpenChange={onOpenChange}
      initialFocusRef={confirmButtonRef}
      footer={(
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            style={buttonStyle('secondary', busy)}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => { void onConfirm(); }}
            disabled={busy || confirmDisabled}
            style={buttonStyle(variant, busy || confirmDisabled)}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      {children}
    </SanctumDialog>
  );
};
