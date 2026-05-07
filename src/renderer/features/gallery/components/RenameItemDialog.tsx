import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';

type RenameItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (newName: string) => void;
};

const splitName = (name: string): { base: string; ext: string } => {
  const i = name.lastIndexOf('.');
  if (i > 0) {
    return { base: name.slice(0, i), ext: name.slice(i + 1) };
  }
  return { base: name, ext: '' };
};

export const RenameItemDialog = ({
  open,
  onOpenChange,
  currentName,
  onConfirm,
}: RenameItemDialogProps): React.JSX.Element => {
  const { base: initialBase, ext: initialExt } = splitName(currentName);
  const [base, setBase] = useState(initialBase);
  const [ext, setExt] = useState(initialExt);
  const baseRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const { base: b, ext: e } = splitName(currentName);
      setBase(b);
      setExt(e);
      setTimeout(() => {
        baseRef.current?.select();
      }, 50);
    }
  }, [open, currentName]);

  const buildName = (): string => {
    const cleanExt = ext.trim().replace(/^\.+/, '');
    return cleanExt ? `${base.trim()}.${cleanExt}` : base.trim();
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const newName = buildName();
    if (!newName || newName === currentName) {
      onOpenChange(false);
      return;
    }
    onConfirm(newName);
    onOpenChange(false);
  };

  const isValid = base.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2">
            <Input
              ref={baseRef}
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="File name"
              className="min-w-0 flex-1"
              autoFocus
            />
            <div className="flex w-24 shrink-0 items-center rounded-lg border border-border bg-bg px-2 text-sm text-text-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <span className="select-none text-text-muted/60">.</span>
              <input
                value={ext}
                onChange={(e) => setExt(e.target.value.replace(/^\.+/, ''))}
                placeholder="ext"
                className="w-full min-w-0 bg-transparent text-text-primary outline-none placeholder:text-text-muted/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid}>
              Rename
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
