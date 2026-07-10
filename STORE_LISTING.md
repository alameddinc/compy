# Chrome Web Store — Listing (copy/paste ready)

## Product name (≤ 45 chars)
```
Compy — Your memory & your AI's
```

## Summary / short description (≤ 132 chars)
```
Highlight & note anything on the web, then hand your AI a versioned task list. Made for vibecoders shipping fast. Local & private.
```

## Category
```
Productivity
```

## Language
```
English
```

## Detailed description (paste into "Description")
```
Compy is a local-first highlighter and note tool for people who move fast across a lot of pages — and want to hand the result to an AI.

You're vibecoding across a big app. You spot a bug on one screen, a copy tweak on another, an idea three routes deep — but you're mid-flow and can't stop. Compy is where those land: highlight it, drop a note, move on. When you're ready, one click hands your model a clean Markdown task list.

HIGHLIGHT ANYWHERE
• Select text on any site → floating toolbar → pick a color or add a note.
• Highlights re-appear when you come back, re-anchored with a W3C-style TextQuote model so they survive most page changes.
• Dynamic pages: if the text is gone, the note becomes an "orphan" — still visible in the popup and dashboard, never lost.

COLORS ARE TAGS
• Each color is a label — urgent, idea, blocked, whatever fits how you work.
• Rename the built-ins and add your own custom colors. Labels ride along in exports (#urgent).

HAND IT TO YOUR AI
• Copy for AI → a Markdown task list grouped by site, tagged by color, with the quote + URL for context.
• Domain-based versioning: each site tracks its own version. "New & changed" sends only what changed since your last export (v2 since v1…), so you never paste the same task twice. Export history re-copies any past version.
• Mark a batch done → it moves to the Archive, out of the board and future exports.

ONE DASHBOARD
• Every note across every site: search, filter by site and label, sort, bulk select, bulk done.

PRIVATE BY DEFAULT
• Everything stays on your device in your browser. No account, no server, no analytics, no tracking.
• Manual backup: export an encrypted CSV (AES-GCM + passphrase) and re-import it anywhere.

SHORTCUTS
• Alt+Shift+H — highlight selection
• Alt+Shift+N — highlight + add note
• Alt+Shift+M — add a page note (no highlight)
• Alt+Shift+D — open dashboard
```

## Single purpose (Privacy tab)
```
Compy lets you highlight text and attach notes on any web page, then review, organize, and export them from one local dashboard.
```

## Permission justifications (Privacy tab)

**Host permissions (`<all_urls>`)**
```
Compy displays your saved highlights and the note toolbar on the pages where you created them. Because you can annotate any site, it needs access to the pages you choose to use it on. It only renders and manages your own notes; it never reads or transmits page content beyond the text you explicitly highlight.
```

**scripting**
```
Injects the content script that renders and manages your highlights and notes on the current page (paint highlights, show the toolbar/editor).
```

**storage**
```
Stores your highlights, notes, colors/labels, and settings locally in the browser (chrome.storage.local). Nothing is sent anywhere.
```

**downloads**
```
Used by the optional "Sync for AI" action: on demand, Compy writes a JSON snapshot of your notes to Downloads/compy/compy-export.json so a local MCP bridge (compy-mcp) can let your own AI agent read them. It only writes this one file when you click Sync; it never reads your download history or downloads anything from the web.
```

**unlimitedStorage**
```
Compy lets users capture and annotate screenshots of web pages and save them to a local, on-device gallery. Screenshots are PNG images that quickly exceed Chrome's default 5 MB storage quota, so unlimitedStorage is required to store more than a handful of saved images. All screenshots and notes are kept locally in the browser (chrome.storage.local) — nothing is uploaded, transmitted, or shared. There is no server and no account.
```

**activeTab**
```
Reads the current tab's URL and title when you open the popup so notes are shown for the correct page.
```

**contextMenus**
```
Adds right-click menu items to highlight the selection or add a page note.
```

## Data usage disclosures (Privacy tab checkboxes)
- Does your extension collect or use user data? → It stores highlights/notes/settings **locally only**; nothing is transmitted off the device.
- Certify: **not** sold to third parties; **not** used for unrelated purposes; **not** used for creditworthiness/lending.
- Privacy policy URL → (paste your hosted PRIVACY.md URL)

## Assets checklist
- [x] Icon 128×128 (icons/icon128.png)
- [ ] Screenshots 1280×800 or 640×400 (1–5). Suggested: highlights on a page, popup, dashboard, export menu, labels modal.
- [ ] Small promo tile 440×280 (optional but recommended)
- [ ] Privacy policy hosted at a public URL
