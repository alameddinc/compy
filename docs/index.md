---
title: "Compy — Privacy Policy"
---

<p align="center">
  <img src="logo.png" alt="Compy" width="96" height="96" />
</p>

# Compy — Privacy Policy

_Last updated: 2026-07-06_

Compy ("the extension") is a local-first highlighter and note-taking tool for the
web. This policy explains exactly what data Compy handles and where it goes.

## The short version

**Compy does not collect, transmit, sell, or share any of your data.** Everything
you create stays on your own device, inside your browser. There are no accounts, no
servers, no analytics, and no third-party services.

## What Compy stores

When you use Compy, the following is saved **locally** in your browser via
`chrome.storage.local`:

- **Highlights and notes** you create — the highlighted text, its surrounding
  context (used to re-locate it on revisit), your note comments, and colors/labels.
- **Page metadata** for notes you make — the page URL and title, so a note can be
  shown next to the page it belongs to and grouped in the dashboard.
- **Your settings** — renamed color labels, custom colors, the optional "AI context"
  text, and export history (version records used to compute what's new).

This data never leaves your device. It is not sent to us or to anyone else.

## What Compy does **not** do

- No data is transmitted to any server. Compy has no backend.
- No analytics, telemetry, tracking pixels, fingerprinting, or advertising.
- No selling or sharing of data with third parties.
- No reading or collecting of page content beyond the text you explicitly highlight
  or the URL/title of pages where you take a note.

## Permissions and why they're needed

- **`storage`** — to save your highlights, notes, and settings locally.
- **`scripting`** + **host access (`<all_urls>`)** — to display your highlights and
  the note toolbar on the pages where you created them. Compy runs only to render and
  manage your own notes; it does not read or exfiltrate page contents.
- **`activeTab`** — to know the current page when you open the popup.
- **`contextMenus`** — to offer "Highlight" / "Add note" in the right-click menu.

## Exports and backups

Any export (Markdown, CSV, encrypted CSV, or "Copy for AI") is **initiated by you**
and produced locally — copied to your clipboard or saved as a file you choose.

- **Encrypted CSV** backups are encrypted in your browser with AES-GCM (PBKDF2 key
  derivation) using a passphrase only you know. Compy cannot recover it.
- When you use **"Copy for AI"**, the generated text is placed on your clipboard.
  What you then do with it (e.g. paste it into an AI chat) is entirely your choice and
  outside Compy's control. Compy itself sends nothing.

## Data retention and deletion

Your data lives only in your browser. You can delete individual notes, bulk-delete,
or remove everything at any time. Uninstalling the extension removes all stored data.

## Children

Compy is a general-purpose productivity tool and is not directed at children.

## Changes to this policy

If this policy changes, the "Last updated" date above will change. Material changes
will be reflected in the extension's store listing.

## Contact

Questions about privacy? Contact the developer at **alameddinc@gmail.com**.
