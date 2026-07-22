# Changelog

All notable changes to Compy. Dates are release-ready, not necessarily store-approval dates.

## 1.3.0

**New — Notebooks & manual notes**
- **＋ Add note** (dashboard header, or the ＋ next to Notebooks): jot a note without
  visiting a page. Drop it into a **Notebook** (a website-less container) or attach it
  to a **site** — with an optional **sub-category / path** (`papers/ml`, `settings/billing`).
- **Notebooks** get their own sidebar section, separate from Sites. Each notebook is
  just a virtual site, so it flows through the same **filter, search, versioning and
  Copy-for-AI** pipeline you already use — notebook notes export right alongside web notes.
- **Pin to top**: pin any note (📌 on the card or in the add dialog). Pinned notes sort
  first. Pinning never counts as an edit, so it stays out of the export delta.
- Manual/notebook notes can carry a **label/color** (set it in the add dialog or from the
  card swatches).

## 1.2.1

**Fixed**
- Editing a note in the dashboard and hitting **Save** did nothing (a leftover
  reference threw `tagInput is not defined` and aborted the save). Edits now save.

**Improved — versioning is easier to understand**
- Plain wording everywhere: "delta / full" → **"Only new & changed"** and
  **"Everything"**, with one-line explanations of what each does.
- **Version history** (was "Export history"): grouped by site, newest first, with a
  **latest** badge so you can see which version is current.
- **Preview** any past version inline — see the exact text that was copied to your AI,
  so you always know what you sent.
- **Copy** re-copies any past version to the clipboard in one click.

**Docs**
- Store listing shortcut list corrected (removed the retired `Alt+Shift+N`, added the
  screenshot shortcut `Alt+Shift+S`).

## 1.2.0

- Internal groundwork for an AI bridge (later parked); the shipped AI handoff stays
  **Copy for AI** (clipboard). No user-facing change vs 1.1.1.

## 1.1.1

- Purpose-driven default color labels + a hover label chip on swatches.
- First-run **welcome / how-it-works** page and a refreshed description.
- Restored `Alt+Shift+M` (page note); default shortcuts settled on **H / M / D / S**.
- Silenced "Extension context invalidated" noise from stale content scripts after reload.

## 1.1.0

- **Screenshot & annotate**: capture the visible page, draw boxes / arrows / text,
  then download the PNG, copy it, or **Save** it to a local gallery.
- **Screenshots gallery** in the dashboard with site-based filtering — private,
  never included in AI exports.
- `Alt+Shift+S` shortcut for screenshot & annotate.
- `unlimitedStorage` permission so saved screenshots aren't capped by the default quota.

## 1.0.1

- In-page note editor no longer closes while you're typing.

## 1.0.0

- Initial Compy release: highlight & note anywhere, persistent text-anchored
  highlights, popup + dashboard, colors-as-labels, domain-versioned **Copy for AI**,
  Markdown / CSV / encrypted-CSV export, import. 100% local.
