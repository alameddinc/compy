# Compy — Your memory & your AI's (Chrome Extension)

Highlight & note anything on the web, then hand your AI a clean, versioned task list.
**Local-first & private** — nothing leaves your machine. No account, no server, no tracking.

## Why Compy — notes for AI, for vibecoders

You're vibecoding across a big app. You spot a bug on one screen, a copy tweak on another,
an idea three routes deep — but you're mid-flow and can't fix them now. Compy is where those
land: **highlight it, drop a note, move on.** When you're ready, **Copy for AI** hands your
model a Markdown task list — grouped by site, tagged by color, and **versioned per domain** so
you only ever send what's *new* (v1 → v2 → v3), never the same task twice. Mark a batch **done**
and it moves to the archive. It's a scratchpad for you and a work queue for your AI at once.

## Features

- **Highlight anywhere** — select text → floating toolbar → pick a color or add a note.
- **Persistent highlights** — re-anchored on revisit using a W3C-style TextQuote model
  (quote + surrounding context), so highlights survive most page changes.
- **Dynamic pages** — a `MutationObserver` re-applies highlights as content loads. If the
  text is gone, the note becomes an **orphan** — still visible in the popup & dashboard,
  never lost.
- **Popup** — all notes for the current page, orphans flagged, inline edit, jump-to-highlight.
- **Dashboard** — every note across every site: search, filter by site/label, sort, bulk select.
- **Colors are tags** — each color is a label (urgent, idea, blocked…). Rename any of the 9
  built-ins and add your own custom colors, all stored locally. Labels ride along in exports (`#urgent`).
- **Done → Archive** — mark a note (or a whole selection) done; it leaves the board, the page,
  and future exports, and lands in the Archive (with its own site/label filters). Restore anytime.
- **Screenshot & annotate** — capture the visible page, draw boxes / arrows / text on it, then
  download the PNG (or copy it to the clipboard). Great for handing a visual bug to your AI.
- **Export**
  - **Copy for AI** — a Markdown task list (note + quoted highlight + URL + `#label`), grouped by site.
  - **Domain-based versioning** — each site tracks its own version. "New & changed" sends only the
    delta since the last export (v2 since v1…); **Export history** re-copies any past version.
  - **Markdown / CSV** files.
  - **Encrypted CSV** — AES-GCM + PBKDF2, passphrase-protected backup you can store anywhere
    and re-import on another device.
- **Import** — merges by id (newest wins). Auto-detects plain vs. encrypted files.
- **Keyboard shortcuts**
  - `Alt+Shift+H` — highlight selection
  - `Alt+Shift+N` — highlight + add note
  - `Alt+Shift+M` — add a page note (no highlight)
  - `Alt+Shift+S` — screenshot the page & annotate
  - open dashboard — popup grid button, right-click menu, or bind a key at chrome://extensions/shortcuts
  - screenshot is also on the popup 📷 button and the right-click menu
  - open popup — click the toolbar icon (bind a key at chrome://extensions/shortcuts)
  - `/` — focus search (in dashboard)

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the **`src/`** folder.
4. Pin the WebNotes icon. Done.

## Data & privacy

- Notes live in `chrome.storage.local` on your machine only.
- The extension makes **no network requests**. Site avatars are generated locally (letter tiles),
  not fetched from any favicon service.
- Backups are files you control. Use the **encrypted** export if you'll store them in the cloud.

## Project layout

```
src/
  manifest.json
  background/service-worker.js   commands, context menu, per-tab badge
  content/
    anchor.js                    text re-anchoring engine (TextQuote)
    highlighter.js               DOM highlight painter
    content.js                   orchestrator: toolbar, editor, orphan tracking
    content.css
  popup/                         current-page notes
  dashboard/                     all notes, search, export/import
  lib/
    store.js                     storage layer (source of truth)
    crypto.js                    AES-GCM backup encryption
    exporters.js                 CSV + Markdown serializers
    tokens.css                   shared design system (light/dark)
tools/generate_icons.py          regenerates PNG icons (stdlib only)
```

## Notes on cross-device use

This build is intentionally serverless. To use notes on another device: export (encrypted CSV
recommended), move the file, import. If you later want automatic email-login sync via Cloudflare
R2, that requires adding a small auth backend — kept out of scope here to preserve the
zero-trust, local-first design.
