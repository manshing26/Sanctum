import React from 'react';
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { cn } from '../../lib/utils';

const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

const ContextMenu = ContextMenuPrimitive.Root;
const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
const ContextMenuGroup = ContextMenuPrimitive.Group;
const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn('sanctum-ctx-content', className)}
      {...props}
    />
  </ContextMenuPrimitive.Portal>
));
ContextMenuContent.displayName = 'ContextMenuContent';

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn('sanctum-ctx-item', inset && 'sanctum-ctx-item--inset', className)}
    {...props}
  />
));
ContextMenuItem.displayName = 'ContextMenuItem';

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn('sanctum-ctx-item sanctum-ctx-item--check', className)}
    checked={checked}
    {...props}
  >
    <span className="sanctum-ctx-check-slot">
      <ContextMenuPrimitive.ItemIndicator>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 5l2.5 2.5 5-5" />
        </svg>
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = 'ContextMenuCheckboxItem';

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn('sanctum-ctx-label', inset && 'sanctum-ctx-item--inset', className)}
    {...props}
  />
));
ContextMenuLabel.displayName = 'ContextMenuLabel';

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn('sanctum-ctx-sep', className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn('sanctum-ctx-item', inset && 'sanctum-ctx-item--inset', className)}
    {...props}
  >
    {children}
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto' }}>
      <polyline points="3,2 7,5 3,8" />
    </svg>
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger';

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.SubContent
    ref={ref}
    className={cn('sanctum-ctx-content', className)}
    {...props}
  />
));
ContextMenuSubContent.displayName = 'ContextMenuSubContent';

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuGroup,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
};

// ── Sanctum context menu styles ──────────────────────────────────────
// Injected once as a style tag so the classes work without Tailwind.
if (typeof document !== 'undefined') {
  const id = 'sanctum-ctx-styles';
  if (!document.getElementById(id)) {
    const el = document.createElement('style');
    el.id = id;
    el.textContent = `
.sanctum-ctx-content {
  z-index: 9999;
  min-width: 180px;
  overflow: hidden;
  background: #0e100e;
  border: 1px solid rgba(220,220,200,0.14);
  padding: 4px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.55);
  animation: sanctum-ctx-in 100ms ease-out;
}

@keyframes sanctum-ctx-in {
  from { opacity: 0; transform: scale(0.97) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

.sanctum-ctx-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: #c4c9c5;
  cursor: pointer;
  user-select: none;
  outline: none;
  border-left: 2px solid transparent;
}

.sanctum-ctx-item:focus,
.sanctum-ctx-item[data-highlighted] {
  background: rgba(124,154,146,0.10);
  border-left-color: #7c9a92;
  color: #e8e6dc;
}

.sanctum-ctx-item[data-disabled] {
  pointer-events: none;
  opacity: 0.35;
}

.sanctum-ctx-item--inset {
  padding-left: 32px;
}

.sanctum-ctx-item--check {
  padding-left: 32px;
}

.sanctum-ctx-check-slot {
  position: absolute;
  left: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: #7c9a92;
}

/* Danger items */
.sanctum-ctx-item.text-danger,
.sanctum-ctx-item[class*="text-danger"] {
  color: #c36b5f;
}
.sanctum-ctx-item.text-danger:focus,
.sanctum-ctx-item.text-danger[data-highlighted],
.sanctum-ctx-item[class*="text-danger"]:focus,
.sanctum-ctx-item[class*="text-danger"][data-highlighted] {
  background: rgba(195,107,95,0.10);
  border-left-color: #c36b5f;
  color: #c36b5f;
}

.sanctum-ctx-label {
  padding: 5px 14px 4px;
  font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #4d524d;
}

.sanctum-ctx-sep {
  height: 1px;
  background: rgba(220,220,200,0.07);
  margin: 4px 0;
}

/* SVG icons inside items inherit muted colour */
.sanctum-ctx-item svg {
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  color: #79817a;
}
.sanctum-ctx-item:focus svg,
.sanctum-ctx-item[data-highlighted] svg {
  color: #7c9a92;
}
.sanctum-ctx-item.text-danger svg,
.sanctum-ctx-item[class*="text-danger"] svg {
  color: #c36b5f;
}
    `;
    document.head.appendChild(el);
  }
}
