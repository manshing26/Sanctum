# Sanctum / privateVault

A local-first encrypted vault for files, bookmarks, secure notes, passwords, and private browsing. Vault content is encrypted at rest with AES-256-GCM and stays on the local machine.

---

## Features

### Vault Objects
- **Mixed object gallery** — files, bookmarks, and secure notes appear together in All Objects and folder views.
- **Encrypted files** — imported files are stored as encrypted blobs; original filenames are encrypted separately.
- **Encrypted bookmarks** — bookmark title, URL, and thumbnail metadata are stored in the encrypted vault database.
- **Secure notes** — encrypted note title/body stored in SQLite; supports plain text and Markdown mode.
- **Folders** — shared nested folder tree for files, bookmarks, and notes.
- **Tags** — shared colour-coded tags across vault objects.
- **Favourites** — favourite files, bookmarks, and notes.
- **Ratings** — 1-5 star rating for files and bookmarks.
- **Search and filters** — search across mixed vault objects, including tags; filter by scope, tags, and favourites.
- **Grid and list views** — mixed file/bookmark/note layouts with object type badges.
- **Bulk workflows** — select by checkbox, select all, or drag box; bulk move, favourite, export, and delete.

### File Import, Preview, and Export
- **Import** — drag-and-drop or file picker; SHA-256 duplicate detection; conflict handling for replace / keep both / skip.
- **Secure delete on import** — optional 3-pass overwrite of source files before deletion.
- **Read-only external copies** — unsupported files open as read-only temporary decrypted copies; external edits are not saved back.
- **Export** — decrypt selected files to a chosen directory.
- **Document preview** — in-app read-only preview for:
  - PDF via PDF.js canvas rendering
  - DOCX via Mammoth readable HTML conversion
  - TXT, Markdown, CSV, TSV, JSON, XML, HTML
  - LOG, YAML/YML, TOML, INI, CONF, CFG, ENV, SQL
  - SVG as source text, not executable rendered SVG
- **Media viewer** — full-screen image and video viewer with keyboard navigation.
- **Thumbnail generation** — automatic thumbnails via `sharp` for images and `ffmpeg` for video first frames.

### Secure Notes
- Notes are first-class vault objects.
- Stored encrypted in the database, not as loose text files.
- Create/edit notes in a large in-app editor modal.
- Inspector shows a compact read-only summary and note actions.
- Supports copy body and single-note export as `.txt` or `.md`.

### Bookmark Workflow
- Save browser pages as encrypted bookmarks.
- Fetch thumbnails from Open Graph metadata when available.
- Replace bookmark thumbnails manually from scraped page images.
- Open bookmarks in the built-in browser.
- Import/export Netscape HTML bookmark files; selected bookmark export is supported.
- Bookmarks share folders, tags, favourites, and mixed vault views with files.

### Password Manager
- Dedicated password UI separate from the vault gallery.
- Password records are encrypted in SQLite.
- Browser integration can surface saved credentials for the active domain.

### Built-in Private Browser
- Chromium `webview` in a separate Electron session partition.
- Multi-tab browsing with address bar, back/forward/reload.
- Save images/videos from the browser directly into the vault.
- Blocks camera, microphone, notifications, and other permission requests.
- Optional third-party cookie blocking and pop-up blocking.
- Configurable homepage.
- Clear-on-exit for cookies, cache, localStorage, IndexedDB, service workers, and related web storage.
- Browser extension support for manual/dev use.

### Backup, Restore, and Wipe
- **Backup** — creates a `.pvbackup` ZIP containing the encrypted DB, encrypted files, and manifest.
- **Replace restore** — verifies backup password, replaces current vault content, and restarts cleanly.
- **Merge restore** — imports backup items into a new `Restored YYYY-MM-DD` root folder.
- **Delete all vault items** — password-confirmed content reset that deletes files, bookmarks, notes, passwords, folders, tags, and metadata while preserving the vault password and app settings.

### Settings
- **Security** — auto-lock timeout, lock on minimize, secure-delete default, change password.
- **Appearance** — thumbnail size, grid density, default view.
- **Browser** — homepage, pop-ups, third-party cookies, clear-on-exit.
- **Storage** — backup, replace restore, merge restore, full vault-content wipe.
- **About** — app version and crypto/KDF information.

---

## Security Model

- Master key is derived on unlock with Argon2id and kept only in memory.
- File content uses AES-256-GCM with per-file IV/auth tag.
- Original filenames are encrypted separately.
- Thumbnails are encrypted and stored as database BLOBs.
- Bookmarks, notes, and passwords are encrypted in SQLite.
- Failed unlock attempts trigger lockout.
- Temporary opened files are cleared on lock/quit and opened as read-only copies when possible.
- In-app document preview fetches decrypted bytes through a temporary session URL; supported previews render in memory.
- HTML/DOCX preview output is sanitized before rendering; SVG is displayed as source text.
- The built-in browser runs in an isolated Electron partition separate from vault state.

Sanctum protects data at rest and reduces accidental plaintext exposure. It does not protect decrypted content from software with full access to the unlocked user session or operating system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 40 with context isolation and no renderer `nodeIntegration` |
| Main process | Node.js + TypeScript |
| Renderer | React 19 + TypeScript + Tailwind CSS v4 |
| UI components | Radix UI primitives + CVA |
| Database | SQLite via `better-sqlite3` with WAL mode |
| Encryption | Node.js `crypto` AES-256-GCM |
| KDF | `argon2` Argon2id |
| Thumbnails | `sharp`, `ffmpeg-static`, `ffprobe-static` |
| Document preview | `pdfjs-dist`, `mammoth`, `dompurify` |
| Backup/zip | `archiver`, `adm-zip` |
| Bundler | Webpack via Electron Forge |

---

## Project Structure

```text
src/
├── main/
│   ├── app.ts                         # App bootstrap, services, windows, IPC registration
│   ├── db/Database.ts                 # SQLite schema and migrations
│   ├── ipc/                           # IPC handlers by domain
│   ├── services/
│   │   ├── auth/                      # Vault create/unlock/lock/change password
│   │   ├── bookmark/                  # Encrypted bookmark CRUD
│   │   ├── folder/                    # Shared folder tree
│   │   ├── note/                      # Encrypted secure notes
│   │   ├── password/                  # Encrypted password records
│   │   ├── tag/                       # Shared tag CRUD
│   │   ├── import/                    # Import, metadata, thumbnails
│   │   ├── security/                  # Secure delete
│   │   ├── settings/                  # App settings
│   │   └── vault/                     # File storage, backup/restore, media sessions
│   ├── state/SessionStore.ts          # In-memory master key/session state
│   └── windows/                       # Main, browser, settings window controllers
├── preload/                           # contextBridge APIs
├── renderer/
│   ├── App.tsx                        # Auth screens, top nav, session state
│   ├── features/
│   │   ├── gallery/                   # Vault tab, mixed object UI, inspector
│   │   ├── viewer/                    # Media/document preview overlay
│   │   ├── browser/                   # Private browser workspace
│   │   ├── passwords/                 # Password manager
│   │   └── settings/                  # Settings page
│   └── components/ui/                 # Shared UI primitives
└── shared/
    ├── fileTypes.ts                   # MIME detection and previewability
    ├── ipc.ts                         # IPC channel names and shared types
    └── global.d.ts                    # Window API types
```

---

## Data Layout

All app data is stored under Electron `userData`:

```text
{userData}/
├── privatevault.db
├── privatevault.db-wal
├── privatevault.db-shm
└── vault/
    ├── version.json
    ├── files/                         # encrypted file blobs
    └── temp/                          # temporary sessions, opened copies, restore work
```

### Database Schema v4

Files, bookmarks, and notes share `vault_objects` so they can be mixed in gallery views and share folders/tags/favourites.

| Table | Purpose |
|---|---|
| `auth_state` | Argon2id verifier, failed attempts, lockout timestamp |
| `vault_config` | KDF salt and Argon2id parameters |
| `vault_objects` | Parent row for `file`, `bookmark`, and `note` objects |
| `vault_items` | File metadata, encrypted filename, encrypted blob metadata, thumbnails, hashes |
| `bookmarks` | Encrypted title, URL, and thumbnail data |
| `notes` | Encrypted note title/body and note format |
| `folders` | Shared nested folder tree |
| `tags` | Shared tag names and colours |
| `object_tags` | Many-to-many object/tag assignments |
| `passwords` | Encrypted password records |
| `settings` | App settings |
| `schema_meta` | Internal schema version |

Migrations from older schemas run at startup. v3 introduced mixed vault objects; v4 adds notes.

---

## Backup Format

`.pvbackup` files are ZIP archives:

```text
privatevault.db
vault/version.json
vault/files/*.enc
backup_manifest.json
```

- Replace restore requires the password that was active when the backup was created.
- Merge restore also requires the backup password and places imported content under `Restored YYYY-MM-DD`.
- Backups include encrypted files and encrypted database content, not plaintext exports.

---

## Development

```bash
npm install
npm start          # Start in development mode
npx tsc --noEmit   # Type check
npm test           # Run tests
npm run make       # Package for the current platform
```

Notes:
- `npm run package` / `npm run make` may need network access for Electron packaging metadata or platform assets.
- Build artifacts such as `.webpack/`, `out/`, and `dist/` can be large and should not be treated as source size.

---

## Current Preview Support

| Category | Formats |
|---|---|
| Media | common image/video MIME types |
| PDF | `.pdf` |
| Word | `.docx` |
| Text/data | `.txt`, `.md`, `.csv`, `.tsv`, `.json`, `.xml`, `.html` |
| Source/config | `.log`, `.yaml`, `.yml`, `.toml`, `.ini`, `.conf`, `.cfg`, `.env`, `.sql` |
| SVG | `.svg` as source text |
| External read-only fallback | `.doc`, `.rtf`, `.xls/.xlsx`, `.ppt/.pptx`, ODF, unknown binary files |

