# privateVault

A privacy-first, local-only media vault with a built-in private browser. All files are encrypted at rest with AES-256-GCM. Nothing leaves your machine.

---

## Features

### Vault
- **Encrypted storage** — every file encrypted with AES-256-GCM; filenames encrypted separately
- **Argon2id key derivation** — random salt per vault; master key in memory only, never on disk
- **Auto-lock** — configurable idle timeout; optional lock on window minimise
- **Failed login lockout** — 5 attempts triggers a 15-minute lockout
- **Change password** — re-derives key from fresh salt, re-encrypts all vault items and bookmarks atomically
- **Import** — drag-and-drop or file picker; SHA-256 duplicate detection; conflict resolution dialog (replace / keep both / skip)
- **Secure delete on import** — 3-pass overwrite of source files before deletion
- **Export** — decrypt selected files to any directory
- **Media viewer** — full-screen image and video viewer with keyboard navigation
- **Grid and list views** — configurable thumbnail size and grid density
- **Folders** — nested folder tree with create, rename, delete; files and bookmarks share the same folder tree
- **Tags** — colour-coded tags; multi-tag filtering; tags work across both files and bookmarks
- **Ratings** — 1–5 star rating per item
- **Favourites** — mark/filter by favourite
- **Search** — full-text search across filename, tags, and folder path
- **Thumbnail generation** — automatic thumbnails via `sharp` (images) and `ffmpeg` (video first-frame)
- **Marquee selection** — click-drag to select multiple items in the gallery
- **Mixed gallery view** — files and bookmarks appear together in "All Objects" and folder views

### Backup & Restore
- **Backup** — creates a `.pvbackup` zip (encrypted DB + all `.enc` files + manifest); requires vault to be unlocked
- **Replace restore** — verifies backup password, wipes current vault, restores backup DB and files, forces clean restart via countdown dialog
- **Merge restore** — imports backup items into live vault under a new root folder named `Restored YYYY-MM-DD`; preserves tags, ratings, and favourites; skips items whose UUID already exists; forces clean restart

### Bookmark Gallery
- Dedicated full-page tab showing saved bookmarks as a thumbnail grid or list
- Thumbnails fetched automatically from each site's Open Graph (`og:image`) meta tag at save time — fetched inside the browser session to bypass bot-blocking; can be replaced manually via an image picker that scrapes the live tab
- Encrypted and stored as BLOBs in the vault DB (AES-256-GCM, same key as vault)
- Fallback card with a deterministic gradient + domain initial when no `og:image` is available
- Click any card to open the URL in a new browser tab
- Inspector panel — rename, assign folder, assign tags, change thumbnail
- Multi-select — bulk delete, bulk move to folder
- Export to Netscape HTML bookmark file (all bookmarks, or selected only); import from browser-exported HTML
- Bookmarks appear alongside files in "All Objects" and folder views in the vault gallery
- Client-side search by title or domain; tag filtering
- Tab persistence — open tabs survive app restarts (URLs saved to `localStorage`)

### Built-in Private Browser
- Chromium-based `webview` sandboxed in a separate Electron session partition
- Multi-tab support with address bar, back/forward/reload
- Encrypted bookmarks (AES-GCM, stored in vault DB); save current page via star button or sidebar form
- Right-click → "Save to Vault" on images and videos; auto-imports and secure-deletes temp file
- Blocks all permissions (camera, microphone, notifications, etc.)
- Optional third-party cookie blocking (applies immediately without restart)
- Pop-up blocker
- Configurable homepage
- Clear-on-exit: cookies, cache, localStorage, IndexedDB, service workers
- Browser extension support (manual load, dev mode only)

### Settings
- **Security** — auto-lock timeout, lock on minimise, change password
- **Appearance** — thumbnail size, grid density, default view (grid/list)
- **Browser** — homepage, block pop-ups, block third-party cookies, clear on exit
- **Storage** — create backup, replace vault, merge vault, delete all vault items
- **About** — app version, encryption/KDF info

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 36 (context isolation, no `nodeIntegration`) |
| Main process | Node.js + TypeScript |
| Renderer | React 19 + TypeScript + Tailwind CSS v4 |
| UI components | Radix UI primitives + CVA |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Encryption | Node.js `crypto` — AES-256-GCM |
| KDF | `argon2` (Argon2id) |
| Thumbnails | `sharp` (images), `ffmpeg-static` + `ffprobe-static` (video) |
| Backup/zip | `archiver` (write), `adm-zip` (read) |
| Bundler | Webpack via Electron Forge |

---

## Project Structure

```
src/
├── main/                        # Electron main process
│   ├── app.ts                   # Bootstrap: service wiring, window lifecycle, IPC registration
│   ├── db/
│   │   └── Database.ts          # SQLite schema, migrations, getDb()
│   ├── ipc/                     # IPC handler registration (one file per domain)
│   ├── services/
│   │   ├── auth/AuthService.ts      # Vault create, unlock, lock, change password, lockout
│   │   ├── crypto/CryptoService.ts  # AES-256-GCM encrypt/decrypt, Argon2id derive/verify
│   │   ├── vault/
│   │   │   ├── VaultService.ts          # Item CRUD, import, export, search, thumbnails
│   │   │   ├── BackupService.ts         # .pvbackup creation
│   │   │   ├── RestoreService.ts        # Replace restore + merge restore
│   │   │   ├── MediaSessionService.ts   # privatevault-media:// protocol handler
│   │   │   └── VaultPaths.ts            # Centralised path resolution
│   │   ├── folder/FolderService.ts      # Folder tree CRUD, move (cycle detection), assign items
│   │   ├── tag/TagService.ts            # Tag CRUD, assign to items
│   │   ├── bookmark/BookmarkService.ts  # Encrypted bookmark CRUD
│   │   ├── import/
│   │   │   ├── ImportService.ts         # Conflict detection, import orchestration
│   │   │   ├── MetadataService.ts       # ffprobe metadata extraction
│   │   │   └── ThumbnailService.ts      # sharp + ffmpeg thumbnail generation
│   │   ├── download/DownloadService.ts  # Browser download → vault import pipeline
│   │   ├── security/SecureDeleteService.ts  # 3-pass overwrite + delete
│   │   └── settings/SettingsService.ts      # Key-value settings store
│   ├── state/SessionStore.ts    # In-memory master key, session status
│   └── windows/                 # MainWindowController, BrowserWindowController, SettingsWindowController
├── preload/
│   ├── index.ts                 # Main window contextBridge — full electronAPI
│   └── browser.ts               # Browser window contextBridge — browserAPI
├── renderer/
│   ├── App.tsx                  # Auth screens (unlock / create), main layout, session management
│   ├── features/
│   │   ├── gallery/             # GalleryPage, grid/list, folder sidebar, toolbar, item details
│   │   ├── viewer/              # Full-screen image/video viewer overlay
│   │   ├── browser/             # BrowserWorkspace (webview wrapper), BookmarkGalleryPage
│   │   └── settings/            # SettingsPage (tabbed settings)
│   └── components/ui/           # Shared Radix-based UI primitives
└── shared/
    ├── ipc.ts                   # All IPC channel names and TypeScript types
    └── global.d.ts              # Window type augmentation (electronAPI)
```

---

## Data Layout (on disk)

All data is stored in Electron's `userData` directory:

```
{userData}/
├── privatevault.db          # SQLite database (WAL mode)
├── privatevault.db-wal
├── privatevault.db-shm
└── vault/
    ├── version.json         # Vault format version
    ├── files/               # {uuid}.enc per item
    └── temp/                # Temporary files used during restore/verify
```

### Database Schema (v3)

Files and bookmarks share a parent `vault_objects` table so they can be organised under the same folder tree, tagged with the same tags, and sorted together in the gallery.

| Table | Purpose |
|---|---|
| `auth_state` | Argon2id password verifier, failed attempts, lockout timestamp |
| `vault_config` | KDF salt and Argon2id parameters |
| `vault_objects` | Parent row for every gallery object — holds `type` (`file`/`bookmark`), `folder_id`, `is_favorite`, `rating`, `created_at`, `updated_at` |
| `vault_items` | File-specific metadata: encrypted filename, mime type, dimensions, thumbnail blob (enc), IV, auth tag, content hash — FK → `vault_objects` |
| `bookmarks` | Bookmark-specific data: encrypted title, URL, og:image thumbnail blob — FK → `vault_objects` |
| `folders` | Nested folder tree (adjacency list, `parent_id`); shared by files and bookmarks |
| `tags` | Tag name and colour |
| `object_tags` | Many-to-many junction: `vault_objects` ↔ `tags` (replaces old `item_tags`/`bookmark_tags`) |
| `passwords` | Encrypted saved passwords |
| `schema_meta` | Internal version key (`schema_version`) |
| `settings` | Key-value application settings |

Automatic migration from v2 (flat `vault_items` + separate `bookmarks`) to v3 runs at startup inside a single transaction.

---

## Backup Format (.pvbackup)

A `.pvbackup` file is a ZIP archive:

```
privatevault.db          # Full database snapshot (WAL checkpointed before backup)
vault/version.json       # Version marker
vault/files/*.enc        # All encrypted item files
backup_manifest.json     # { createdAt, schemaVersion, itemCount, tables }
```

- **Replace restore** requires the password active when the backup was created
- **Merge restore** also requires the backup password; existing items (matched by UUID) are skipped; items placed in a new root folder `Restored YYYY-MM-DD`
- Backups include a `schemaVersion` field; v2 and v3 backups are both supported for merge restore

---

## Development

```bash
npm install
npm start          # Start in development mode (Webpack + Electron)
npm run make       # Package for the current platform
npx tsc --noEmit   # Type check without emitting
```

---

## Security Notes

- The master key is derived fresh on every unlock and held only in `SessionStore` (in-memory). It is never written to disk.
- Every `.enc` file uses a unique random IV; the IV and GCM auth tag are stored in `vault_items`.
- Original filenames are encrypted separately from file content, also with a unique IV.
- Thumbnails are encrypted with the same master key and stored as BLOBs in the database — never as readable image files on disk.
- The password verifier is an Argon2id hash — the plaintext password is never stored.
- Backup files contain the encrypted database and encrypted `.enc` files. Without the backup password, the contents cannot be decrypted.
- The built-in browser runs in a sandboxed Electron session partition, isolated from the vault session.
- 5 failed unlock attempts triggers a 15-minute lockout to prevent brute-force attacks.
