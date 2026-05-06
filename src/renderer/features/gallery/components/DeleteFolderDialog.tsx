import React from 'react';
import { Trash2, FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../components/ui/Dialog';
import { Button } from '../../../components/ui/Button';

type DeleteFolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderName: string;
  onKeepFiles: () => void;
  onDeleteFiles: () => void;
  isBusy?: boolean;
};

export const DeleteFolderDialog = ({
  open,
  onOpenChange,
  folderName,
  onKeepFiles,
  onDeleteFiles,
  isBusy = false,
}: DeleteFolderDialogProps): React.JSX.Element => (
  <Dialog open={open} onOpenChange={(next) => (!isBusy ? onOpenChange(next) : undefined)}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Delete folder "{folderName}"</DialogTitle>
        <DialogDescription>
          This folder contains files. What would you like to do with them?
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={onKeepFiles}
          className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-hover disabled:opacity-50"
        >
          <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
          <div>
            <p className="text-sm font-medium text-text-primary">Keep files</p>
            <p className="text-xs text-text-muted">Files are moved to root and the folder is removed.</p>
          </div>
        </button>

        <button
          type="button"
          disabled={isBusy}
          onClick={onDeleteFiles}
          className="flex w-full items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-left transition-colors hover:border-danger/60 hover:bg-danger/10 disabled:opacity-50"
        >
          <Trash2 className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-medium text-danger">Delete files</p>
            <p className="text-xs text-danger/70">Permanently delete the folder and all files inside. Cannot be undone.</p>
          </div>
        </button>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isBusy}>
          Cancel
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);
