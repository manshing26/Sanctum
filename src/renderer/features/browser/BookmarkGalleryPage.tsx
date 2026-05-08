import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Trash2, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { BookmarkSummary } from '../../../shared/ipc';
import { Button } from '../../components/ui/Button';
import { ScrollArea } from '../../components/ui/ScrollArea';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '../../components/ui/ContextMenu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/Dialog';
import { cn } from '../../lib/utils';

type BookmarkGalleryPageProps = {
  onOpenUrl: (url: string) => void;
};

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

// Deterministic pastel gradient from a domain string.
const domainGradient = (domain: string): string => {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1},55%,45%), hsl(${h2},60%,35%))`;
};

const BookmarkCard = ({
  bookmark,
  onOpen,
  onRename,
  onDelete,
}: {
  bookmark: BookmarkSummary;
  onOpen: (url: string) => void;
  onRename: (bookmark: BookmarkSummary) => void;
  onDelete: (id: number) => void;
}): React.JSX.Element => {
  const domain = getDomain(bookmark.url);
  const initial = domain.charAt(0).toUpperCase();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpen(bookmark.url)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen(bookmark.url);
            }
          }}
          className="group flex cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-surface transition-all hover:border-accent/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-accent/50"
        >
          {/* Thumbnail area */}
          <div className="relative aspect-video w-full overflow-hidden bg-surface-hover">
            {bookmark.thumbnailDataUrl ? (
              <img
                src={bookmark.thumbnailDataUrl}
                alt={bookmark.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={{ background: domainGradient(domain) }}
              >
                <span className="text-4xl font-bold text-white/80 select-none">{initial}</span>
              </div>
            )}
          </div>

          {/* Info area */}
          <div className="flex flex-col gap-0.5 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-text-primary" title={bookmark.title}>
              {bookmark.title}
            </p>
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{domain}</span>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onRename(bookmark)}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => onDelete(bookmark.id)}
          className="text-danger focus:text-danger"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export const BookmarkGalleryPage = ({ onOpenUrl }: BookmarkGalleryPageProps): React.JSX.Element => {
  const [bookmarks, setBookmarks] = useState<BookmarkSummary[]>([]);
  const [search, setSearch] = useState('');
  const [renameTarget, setRenameTarget] = useState<BookmarkSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await window.browserAPI.listBookmarks();
    if (result.ok) setBookmarks(result.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: number): Promise<void> => {
    await window.browserAPI.deleteBookmark({ id });
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    toast.success('Bookmark deleted.');
  };

  const openRename = (bookmark: BookmarkSummary): void => {
    setRenameTarget(bookmark);
    setRenameTitle(bookmark.title);
    setRenameDialogOpen(true);
  };

  const handleRename = async (): Promise<void> => {
    if (!renameTarget) return;
    const trimmed = renameTitle.trim();
    if (!trimmed || trimmed === renameTarget.title) {
      setRenameDialogOpen(false);
      return;
    }
    const created = await window.browserAPI.createBookmark({
      title: trimmed,
      url: renameTarget.url,
      thumbnailUrl: renameTarget.thumbnailDataUrl,
    });
    if (!created.ok) {
      toast.error(created.error);
      return;
    }
    await window.browserAPI.deleteBookmark({ id: renameTarget.id });
    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameTitle('');
    toast.success('Bookmark renamed.');
    await load();
  };

  const filtered = search.trim()
    ? bookmarks.filter((b) => {
        const q = search.toLowerCase();
        return b.title.toLowerCase().includes(q) || getDomain(b.url).toLowerCase().includes(q);
      })
    : bookmarks;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="text-base font-semibold text-text-primary">Bookmarks</h1>
        <div className="relative ml-auto flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-48 rounded-full border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => onOpenUrl('https://duckduckgo.com/')}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1 px-6 py-5">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-sm text-text-muted">
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-text-muted">
            {search ? 'No bookmarks match your search.' : 'No bookmarks yet. Bookmark a site in the browser.'}
          </div>
        ) : (
          <div
            className={cn('grid gap-4')}
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}
          >
            {filtered.map((bookmark) => (
              <BookmarkCard
                key={bookmark.id}
                bookmark={bookmark}
                onOpen={onOpenUrl}
                onRename={openRename}
                onDelete={(id) => void handleDelete(id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Rename dialog */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            setRenameTarget(null);
            setRenameTitle('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Bookmark</DialogTitle>
            <DialogDescription>Update the bookmark title.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              placeholder="Bookmark title"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameTitle.trim()) void handleRename();
              }}
              className="h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-text-primary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleRename()} disabled={!renameTitle.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
