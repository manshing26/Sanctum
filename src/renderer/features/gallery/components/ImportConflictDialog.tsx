import React from 'react';
import { AlertTriangle, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';
import type { ConflictAction, ConflictItem, ConflictResolution } from '../../../../shared/ipc';

type ImportConflictDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflicts: ConflictItem[];
  onConfirm: (decisions: ConflictResolution[]) => void;
};

const ACTION_LABELS: Record<ConflictAction, string> = {
  replace: 'Replace',
  keep_both: 'Keep both',
  skip: 'Skip',
};

const CONFLICT_TYPE_LABEL: Record<ConflictItem['conflictType'], string> = {
  exact_duplicate: 'Exact duplicate',
  name_conflict: 'Same name, different content',
};

export const ImportConflictDialog = ({
  open,
  onOpenChange,
  conflicts,
  onConfirm,
}: ImportConflictDialogProps): React.JSX.Element => {
  const [decisions, setDecisions] = React.useState<Map<string, ConflictAction>>(() =>
    new Map(conflicts.map((c) => [c.filePath, 'skip'])),
  );

  React.useEffect(() => {
    setDecisions(new Map(conflicts.map((c) => [c.filePath, 'skip'])));
  }, [conflicts]);

  const setAll = (action: ConflictAction): void => {
    setDecisions(new Map(conflicts.map((c) => [c.filePath, action])));
  };

  const setOne = (filePath: string, action: ConflictAction): void => {
    setDecisions((prev) => new Map(prev).set(filePath, action));
  };

  const handleConfirm = (): void => {
    const result: ConflictResolution[] = conflicts.map((c) => ({
      filePath: c.filePath,
      action: decisions.get(c.filePath) ?? 'skip',
      existingItemId: c.existingItemId,
    }));
    onConfirm(result);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Import conflicts ({conflicts.length})
          </DialogTitle>
          <DialogDescription>
            The following files already exist in the destination folder. Choose what to do for each.
          </DialogDescription>
        </DialogHeader>

        {/* Apply-to-all shortcuts */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <span className="text-xs text-text-muted">Apply to all:</span>
          {(['replace', 'keep_both', 'skip'] as ConflictAction[]).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => setAll(action)}
              className="rounded border border-border bg-surface px-2 py-0.5 text-xs text-text-primary hover:bg-surface-hover"
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>

        {/* Conflict list */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {conflicts.map((conflict) => {
            const current = decisions.get(conflict.filePath) ?? 'skip';
            const isExact = conflict.conflictType === 'exact_duplicate';
            return (
              <div
                key={conflict.filePath}
                className="rounded-lg border border-border bg-surface p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {conflict.fileName}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Copy className="h-3 w-3 shrink-0 text-text-muted" />
                      <span className="text-xs text-text-muted">
                        Existing: <span className="italic">{conflict.existingItemName}</span>
                      </span>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                      isExact
                        ? 'border-text-muted/30 bg-surface-hover text-text-muted'
                        : 'border-warning/40 bg-warning/10 text-warning',
                    )}
                  >
                    {CONFLICT_TYPE_LABEL[conflict.conflictType]}
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-1.5">
                  {(['replace', 'keep_both', 'skip'] as ConflictAction[]).map((action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setOne(conflict.filePath, action)}
                      className={cn(
                        'flex-1 rounded border px-2 py-1 text-xs font-medium transition-colors',
                        current === action
                          ? action === 'replace'
                            ? 'border-danger/50 bg-danger/10 text-danger'
                            : action === 'keep_both'
                              ? 'border-accent/50 bg-accent/10 text-accent'
                              : 'border-border bg-surface-hover text-text-primary'
                          : 'border-border bg-surface text-text-muted hover:bg-surface-hover hover:text-text-primary',
                      )}
                    >
                      {ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Import</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
