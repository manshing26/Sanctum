import type { VaultItemSummary } from '../../../shared/ipc';

export type ViewerMediaState = {
  itemId: string;
  token: string;
  mediaUrl: string;
  mimeType: string;
  fileSize: number;
  expiresAt: string;
};

export type MediaViewerOverlayProps = {
  items: VaultItemSummary[];
  currentItemId: string;
  onClose: () => void;
  onNavigate: (itemId: string) => void;
  onMessage: (message: string) => void;
};
