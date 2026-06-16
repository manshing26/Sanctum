# Sanctum

A local-first encrypted vault for files, bookmarks, secure notes, passwords, and private browsing. Vault content is encrypted at rest with AES-256-GCM and stays on the local machine.

---

## Features

### Vault Objects

- **Mixed object gallery** — files, bookmarks, and secure notes appear together in All Objects and folder views.
- **Encrypted files** — imported files are stored as encrypted blobs; original filenames are encrypted separately.
- **Encrypted bookmarks** — bookmark title, URL, and thumbnail data are stored encrypted.
- **Secure notes** — encrypted note title/body stored in SQLite; supports plain text and Markdown mode.
- **Folders** — shared nested folder tree for files, bookmarks, and notes.
- **Tags** — shared colour-coded tags across vault objects.
- **Favourites** — favourite files, bookmarks, and notes.
- **Ratings** — 1-5 star rating for files, bookmarks, and notes.
- **Search and filters** — search across mixed vault objects, including tags; filter by scope, tags, and favourites.
- **Grid and list views** — mixed file/bookmark/note layouts with object type badges.
- **Keyboard navigation** — arrow keys move through Vault list/grid items; `Enter` opens the focused file, bookmark, or note; `Space` remains selection/toggle.
- **Bulk workflows** — select by checkbox, select all, or drag box; bulk move, favourite, export, and delete.

### File Import, Preview, and Export

- **Import** — drag-and-drop or file picker; SHA-256 duplicate detection; conflict handling for replace / keep both / skip.
- **Secure delete on import** — optional overwrite/delete of source files after successful import.
- **Read-only external copies** — unsupported files open as read-only temporary decrypted copies; external edits are not saved back.
- **Export** — decrypt selected files to a chosen directory.
- **Document preview** — in-app read-only preview for:
  - PDF via PDF.js canvas rendering
  - DOCX via Mammoth readable HTML conversion
  - TXT, Markdown, CSV, TSV, JSON, XML, HTML
  - LOG, YAML/YML, TOML, INI, CONF, CFG, ENV, SQL
  - SVG as source text, not executable rendered SVG
- **Media viewer** — full-screen image, video, PDF, and document viewer with keyboard shortcut help.
- **Image viewer controls** — zoom, wheel zoom, rotate, reset, fullscreen, and drag-to-pan for zoomed images.
- **Thumbnail generation** — automatic thumbnails via `sharp` for images and `ffmpeg` for video first frames.
- **Fast media metadata** — image dimensions are read with `sharp`; video dimensions/duration are extracted with `ffmpeg`.

### Secure Notes

- Notes are first-class vault objects.
- Stored encrypted in the database, not as loose text files.
- Create/edit notes in a large in-app editor modal.
- Inspector shows a compact read-only summary and note actions.
- Supports copy body and single-note export as `.txt` or `.md`.

### Bookmark Workflow

- Save browser pages as encrypted bookmarks.
- Fetch thumbnails from Open Graph metadata when available.
- Replace bookmark thumbnails manually by choosing an existing Vault image.
- Browser area screenshots can be captured into Vault and then reused as bookmark thumbnails.
- Bookmark thumbnail picker supports filename search/filter.
- The Browser `Saved Web` drawer is read/open-only, searchable, grouped by domain, and opens/closes with `Cmd/Ctrl+B`.
- Open bookmarks in the built-in browser.
- Open bookmarks in an installed external private browser: Chrome, Brave, Edge, or Firefox.
- Import/export Netscape HTML bookmark files; selected bookmark export is supported.
- Bookmarks share folders, tags, favourites, ratings, and mixed vault views with files and notes.

### Password Manager

- Dedicated password UI separate from the vault gallery.
- Password records are encrypted in SQLite.
- Browser integration can surface saved credentials for the active domain.

### Built-in Private Browser

- Chromium `webview` in a separate Electron session partition.
- Multi-tab browsing with address bar, stacked tab counts, Saved Web drawer, back/forward/reload, tab close/new-tab shortcuts, and trackpad/mouse back-forward navigation.
- Configurable default search engine.
- Sanctum-owned new tab page.
- Save images/videos from the browser directly into the vault.
- Capture the visible browser page or drag-select an area and import it directly into Vault as an encrypted PNG.
- Blocks camera, microphone, notifications, and other permission requests.
- Pop-ups are blocked by default; user-approved pop-ups open as Sanctum tabs, not native windows.
- Browser audio is muted on vault lock and can be resumed per tab after unlock.
- Optional third-party cookie blocking.
- Clear-on-exit for cookies, cache, localStorage, IndexedDB, service workers, and related web storage.
- Browser extension/plugin UI is hidden in V1.

### Backup, Restore, and Wipe

- **Backup** — creates a `.pvbackup` ZIP containing the encrypted DB, encrypted files, and manifest.
- **Replace restore** — verifies backup password, restores backups created by the current Sanctum backup format, replaces current vault content, and restarts cleanly.
- **Delete all vault items** — password-confirmed content reset that deletes files, bookmarks, notes, passwords, folders, tags, and metadata while preserving the vault password and app settings.
- **Reset Sanctum** — password-confirmed full local reset that deletes the vault password, vault data, settings, audit log, browser data, saved tabs, and local preferences, then exits to first-launch state.
- **Vault health repair** — scans for corrupt vault rows/blobs and can remove unrecoverable data after confirmation.

### Settings

- **Security** — auto-lock timeout, lock on minimize, lock when computer locks/sleeps, change password, Caps Lock warnings in password fields, and recent security audit log.
- **Appearance** — text size, thumbnail size, default Vault view.
- **Browser** — default search engine, third-party cookies, clear-on-exit.
- **Storage** — backup, replace restore, vault health scan/repair, full vault-content wipe, and full app reset.
- **About** — app version and crypto/KDF information.

---

## Security Model

- Master key is derived on unlock with Argon2id and kept only in memory.
- File content uses AES-256-GCM with per-file IV/auth tag.
- Original filenames are encrypted separately.
- Thumbnails are encrypted and stored as database BLOBs.
- Bookmarks, notes, and passwords are encrypted in SQLite.
- Failed unlock attempts trigger lockout.
- Security audit log records recent unlock, password-change, vault-wipe, restore, and repair events, including success/failure status without storing sensitive details. Audit records can be cleared independently in Security settings.
- Temporary opened files are cleared on lock/quit and opened as read-only copies when possible.
- In-app document preview fetches decrypted bytes through a temporary session URL; supported previews render in memory.
- HTML/DOCX preview output is sanitized before rendering; SVG is displayed as source text.
- The built-in browser runs in an isolated Electron partition separate from vault state.
- External private-browser opening sends the URL to the OS and the selected browser; privacy then depends on that browser's private/incognito mode.
- Auto-lock can trigger on idle timeout, window minimize, OS lock, and system sleep.

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
| Thumbnails and media metadata | `sharp`, `ffmpeg-static` |
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
│   └── windows/                       # Main and browser window controllers
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
    ├── browserSearch.ts               # Browser search engine templates
    ├── fileTypes.ts                   # MIME detection and previewability
    ├── ipc.ts                         # IPC channel names and shared types
    └── global.d.ts                    # Window API types
```

---

## Data Layout

All app data is stored under Electron `userData`:

```text
{userData}/
└── privateVault/
    ├── privatevault.db
    ├── privatevault.db-wal
    ├── privatevault.db-shm
    └── vault/
        ├── version.json
        ├── files/                     # encrypted file blobs
        └── temp/                      # temporary sessions, opened copies, restore work
```

### Database Schema v4

Files, bookmarks, and notes share `vault_objects` so they can be mixed in gallery views and share folders/tags/favourites.

| Table | Purpose |
|---|---|
| `auth_state` | Argon2id verifier, failed attempts, lockout timestamp |
| `auth_audit_log` | Recent security event audit records |
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

- Replace restore supports backups created by the current Sanctum backup format and requires the password that was active when the backup was created.
- Restoring replaces the current vault content and then restarts the app.
- Backups include encrypted files and encrypted database content, not plaintext exports.
- Backups include recent security audit records, but not plaintext secrets.

---

## Development

```bash
npm install
npm start           # Start in development mode
npx tsc --noEmit    # Type check
npm test            # Run tests
npm run make        # Package for the current platform
npm run build:mac   # Build macOS installer artifacts
npm run build:win   # Build Windows NSIS installer
```

Notes:
- `npm run package` / `npm run make` may need network access for Electron packaging metadata or platform assets.
- The Windows NSIS installer is current-user only (`perMachine: false`, `allowElevation: false`) to avoid the all-users/elevation handoff during install.
- Linux packaging is not a V1 release target. Debian/RPM maker support exists in the toolchain, but Linux has not been treated as a QA platform.
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
