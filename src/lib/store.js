/* Compy — shared storage layer (classic script, exposes global `WLN`).
   Single source of truth: chrome.storage.local key `wln_notes` (array). */
(function (global) {
  "use strict";

  const NOTES_KEY = "wln_notes";
  const SETTINGS_KEY = "wln_settings";
  const EXPORTS_KEY = "wln_exports";
  const SHOTS_KEY = "wln_shots";       // lightweight index (metadata only)
  const SHOT_DATA_PREFIX = "shot_";     // one key per image: shot_<id> -> dataURL

  // Built-in colors. `label` is the DEFAULT tag name; users can rename it and
  // add custom colors locally (see loadColors). COLORS is mutated in place at
  // load so every `WLN.COLORS[key]` lookup (content, popup, dashboard) sees the
  // merged set without any refactor.
  const BASE = {
    yellow: { label: "Yellow", hl: "#fde68a", ink: "#78350f", dot: "#f59e0b" },
    orange: { label: "Orange", hl: "#fed7aa", ink: "#7c2d12", dot: "#f97316" },
    red:    { label: "Red",    hl: "#fecaca", ink: "#7f1d1d", dot: "#ef4444" },
    green:  { label: "Green",  hl: "#bbf7d0", ink: "#14532d", dot: "#22c55e" },
    teal:   { label: "Teal",   hl: "#99f6e4", ink: "#134e4a", dot: "#14b8a6" },
    blue:   { label: "Blue",   hl: "#bfdbfe", ink: "#1e3a8a", dot: "#3b82f6" },
    purple: { label: "Purple", hl: "#e9d5ff", ink: "#581c87", dot: "#a855f7" },
    pink:   { label: "Pink",   hl: "#fbcfe8", ink: "#831843", dot: "#ec4899" },
    gray:   { label: "Gray",   hl: "#e5e7eb", ink: "#374151", dot: "#6b7280" }
  };
  const BUILTIN_KEYS = Object.keys(BASE);
  const MAX_CUSTOM = 4;
  const COLORS = {};
  for (const k of BUILTIN_KEYS) COLORS[k] = { ...BASE[k] };
  const DEFAULT_COLOR = "yellow";

  function hexToRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }
  function mix(a, b, t) {
    return "#" + a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, "0")).join("");
  }
  // Derive a highlight bg (light tint) + readable ink from a dot color.
  function deriveColor(dot, label) {
    const rgb = hexToRgb(dot);
    return { label: label || "Custom", dot, hl: mix(rgb, [255, 255, 255], 0.72), ink: mix(rgb, [0, 0, 0], 0.5), custom: true };
  }

  function uid() {
    // RFC4122-ish, crypto-backed
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
    return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10,16).join("")}`;
  }

  // Normalize a URL to a stable key: origin + path only.
  // Query (?...) and hash (#...) are dropped so SPA UI-state in the URL
  // (filters, tabs) doesn't split notes across separate keys.
  function urlKey(url) {
    try {
      const u = new URL(url);
      return u.origin + u.pathname;
    } catch {
      return (url || "").split("?")[0].split("#")[0];
    }
  }

  function originOf(url) {
    try { return new URL(url).origin; } catch { return ""; }
  }

  function get(key, fallback) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (r) => resolve(r[key] === undefined ? fallback : r[key]));
    });
  }
  function set(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }
  function del(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  const Store = {
    COLORS,
    DEFAULT_COLOR,
    uid,
    urlKey,
    originOf,

    // Normalize legacy records to the comments[] model (non-destructive on read).
    _normalize(n) {
      const type = n.type || (n.quote && n.quote.trim() ? "highlight" : "page");
      let comments = Array.isArray(n.comments) ? n.comments : [];
      if (!comments.length && n.note && n.note.trim()) {
        comments = [{ id: n.id + ":c0", text: n.note, at: n.createdAt || Date.now() }];
      }
      const note = comments[0] ? comments[0].text : "";
      // Recompute urlKey so legacy records (query-inclusive keys) re-key to
      // the current origin+path scheme — keeps grouping/export consistent.
      const key = n.url ? urlKey(n.url) : n.urlKey;
      return { ...n, type, comments, note, urlKey: key };
    },

    mkComment(text) {
      return { id: uid(), text: text || "", at: Date.now() };
    },

    async getAll() {
      const raw = await get(NOTES_KEY, []);
      return raw.map((n) => this._normalize(n));
    },

    async getForUrl(url) {
      const key = urlKey(url);
      const all = await this.getAll();
      // Re-normalize on read so records saved under the old query-inclusive
      // key still match (migration-safe).
      return all.filter((n) => urlKey(n.url) === key);
    },

    async add(note) {
      const all = await this.getAll();
      const now = Date.now();
      const rec = {
        id: uid(),
        type: note.quote ? "highlight" : "page",
        color: DEFAULT_COLOR,
        comments: [],
        note: "",
        tags: [],
        createdAt: now,
        updatedAt: now,
        ...note
      };
      if (!Array.isArray(rec.comments)) rec.comments = [];
      rec.note = rec.comments[0] ? rec.comments[0].text : "";
      rec.urlKey = urlKey(rec.url);
      rec.origin = originOf(rec.url);
      all.push(rec);
      await set({ [NOTES_KEY]: all });
      return rec;
    },

    // Create a page-level note (not tied to any highlight).
    async addPageNote(url, title, text) {
      return this.add({ type: "page", url, title, comments: text ? [this.mkComment(text)] : [] });
    },

    // Mutate a record's comment list, keeping `note` mirror + updatedAt in sync.
    async _commit(id, mutate) {
      const raw = await get(NOTES_KEY, []);
      const i = raw.findIndex((n) => n.id === id);
      if (i === -1) return null;
      const rec = this._normalize(raw[i]);
      mutate(rec);
      rec.note = rec.comments[0] ? rec.comments[0].text : "";
      rec.updatedAt = Date.now();
      raw[i] = rec;
      await set({ [NOTES_KEY]: raw });
      return rec;
    },

    async addComment(id, text) {
      return this._commit(id, (r) => r.comments.push(this.mkComment(text)));
    },
    async updateComment(id, commentId, text) {
      return this._commit(id, (r) => {
        const c = r.comments.find((x) => x.id === commentId);
        if (c) c.text = text; else r.comments.push({ id: commentId || uid(), text, at: Date.now() });
      });
    },
    async removeComment(id, commentId) {
      return this._commit(id, (r) => { r.comments = r.comments.filter((x) => x.id !== commentId); });
    },
    // Replace the whole comment list (used by the list editors), preserving
    // ids/timestamps by position where possible.
    async setComments(id, texts) {
      return this._commit(id, (r) => {
        const clean = texts.map((t) => (t || "").trim());
        r.comments = clean.map((t, i) => (r.comments[i] ? { ...r.comments[i], text: t } : this.mkComment(t)))
          .filter((c) => c.text);
      });
    },
    // Set the primary (first) comment — used by the quick in-page editor.
    async setPrimaryComment(id, text) {
      return this._commit(id, (r) => {
        if (r.comments[0]) r.comments[0].text = text;
        else r.comments.push(this.mkComment(text));
      });
    },

    async update(id, patch) {
      const all = await this.getAll();
      const i = all.findIndex((n) => n.id === id);
      if (i === -1) return null;
      all[i] = { ...all[i], ...patch, updatedAt: Date.now() };
      await set({ [NOTES_KEY]: all });
      return all[i];
    },

    async remove(id) {
      const all = await this.getAll();
      const next = all.filter((n) => n.id !== id);
      await set({ [NOTES_KEY]: next });
      return all.length !== next.length;
    },

    async removeMany(ids) {
      const s = new Set(ids);
      const all = await this.getAll();
      await set({ [NOTES_KEY]: all.filter((n) => !s.has(n.id)) });
    },

    async replaceAll(notes) {
      await set({ [NOTES_KEY]: notes });
    },

    async mergeImport(incoming) {
      // Merge by id; incoming wins if newer updatedAt.
      const all = await this.getAll();
      const byId = new Map(all.map((n) => [n.id, n]));
      let added = 0, updated = 0;
      for (const inc of incoming) {
        const cur = byId.get(inc.id);
        if (!cur) { byId.set(inc.id, inc); added++; }
        else if ((inc.updatedAt || 0) > (cur.updatedAt || 0)) { byId.set(inc.id, inc); updated++; }
      }
      await set({ [NOTES_KEY]: [...byId.values()] });
      return { added, updated };
    },

    async getSettings() {
      return await get(SETTINGS_KEY, { theme: "system", exportContext: "", colorLabels: {}, customColors: [] });
    },
    async setSettings(patch) {
      const cur = await this.getSettings();
      const next = { ...cur, ...patch };
      await set({ [SETTINGS_KEY]: next });
      return next;
    },

    /* ---------- colors as tags (label overrides + custom colors) ---------- */
    BUILTIN_KEYS, MAX_CUSTOM,
    // Rebuild the live COLORS map from settings. Call once per context before
    // rendering so custom colors + renamed labels are visible everywhere.
    async loadColors() {
      const s = await this.getSettings();
      const labels = s.colorLabels || {};
      for (const k of BUILTIN_KEYS) COLORS[k] = { ...BASE[k], label: labels[k] || BASE[k].label };
      for (const k of Object.keys(COLORS)) if (COLORS[k].custom) delete COLORS[k];
      for (const c of (s.customColors || [])) if (c && c.key) COLORS[c.key] = deriveColor(c.dot, c.label);
      return COLORS;
    },
    async setColorLabel(key, label) {
      const s = await this.getSettings();
      const custom = (s.customColors || []).slice();
      const ci = custom.findIndex((c) => c.key === key);
      if (ci !== -1) { custom[ci] = { ...custom[ci], label: label || custom[ci].label }; await this.setSettings({ customColors: custom }); }
      else {
        const colorLabels = { ...(s.colorLabels || {}) };
        if (label && label !== BASE[key]?.label) colorLabels[key] = label; else delete colorLabels[key];
        await this.setSettings({ colorLabels });
      }
      return this.loadColors();
    },
    async addCustomColor(dot, label) {
      const s = await this.getSettings();
      const custom = (s.customColors || []).slice();
      if (custom.length >= MAX_CUSTOM) return null;
      const key = "c" + uid().slice(0, 8);
      custom.push({ key, dot, label: label || "Custom" });
      await this.setSettings({ customColors: custom });
      await this.loadColors();
      return key;
    },
    async updateCustomColor(key, patch) {
      const s = await this.getSettings();
      const custom = (s.customColors || []).map((c) => c.key === key ? { ...c, ...patch } : c);
      await this.setSettings({ customColors: custom });
      return this.loadColors();
    },
    async removeCustomColor(key) {
      const s = await this.getSettings();
      const custom = (s.customColors || []).filter((c) => c.key !== key);
      await this.setSettings({ customColors: custom });
      return this.loadColors();
    },

    /* ---------- export versioning ----------
       Each export scope (a page, a site, or "everything") keeps an ordered
       list of versions. A version snapshots {noteId: updatedAt} of the whole
       scope, so the NEXT export can compute the delta (new/changed since).
       Past versions store their generated text so a delta is never lost. */
    async getExportLog() {
      return await get(EXPORTS_KEY, {});
    },
    lastExport(log, scopeKey) {
      const arr = log[scopeKey];
      return arr && arr.length ? arr[arr.length - 1] : null;
    },
    // Pure read: what the next export of `scopeNotes` under `scopeKey` looks like.
    async exportInfo(scopeKey, scopeNotes) {
      const log = await this.getExportLog();
      const last = this.lastExport(log, scopeKey);
      const snap = (last && last.snapshot) || {};
      const changed = scopeNotes.filter((n) => !(n.id in snap) || (n.updatedAt || 0) > (snap[n.id] || 0));
      const snapshot = {};
      for (const n of scopeNotes) snapshot[n.id] = n.updatedAt || 0;
      return {
        version: (last ? last.version : 0) + 1,
        sinceVersion: last ? last.version : 0,
        changed,
        snapshot,
        total: scopeNotes.length,
        history: log[scopeKey] || []
      };
    },
    // Commit a performed export (append a version). Keeps last 30 per scope.
    async commitExport(scopeKey, { version, mode, snapshot, text, count }) {
      const log = await this.getExportLog();
      const arr = log[scopeKey] || [];
      arr.push({ version, at: Date.now(), mode, count, snapshot, text, done: false });
      log[scopeKey] = arr.slice(-30);
      await set({ [EXPORTS_KEY]: log });
      return log[scopeKey];
    },
    // Bulk archive/unarchive by id (does NOT touch updatedAt, to keep deltas clean).
    async setArchived(ids, on) {
      const s = new Set(ids);
      const raw = await get(NOTES_KEY, []);
      let c = 0;
      for (const n of raw) if (s.has(n.id)) { n.archivedAt = on ? Date.now() : null; c++; }
      await set({ [NOTES_KEY]: raw });
      return c;
    },
    // Mark an export version "done": archive every note it covered, so they
    // leave the active board and future deltas.
    async markExportDone(scopeKey, version, done = true) {
      const log = await this.getExportLog();
      const arr = log[scopeKey] || [];
      const v = arr.find((x) => x.version === version);
      if (!v) return 0;
      const ids = Object.keys(v.snapshot || {});
      const c = await this.setArchived(ids, done);
      v.done = done; v.doneAt = done ? Date.now() : null;
      await set({ [EXPORTS_KEY]: log });
      return c;
    },

    /* ---------- saved screenshots (local gallery, never exported) ----------
       Images can be large, so each PNG lives under its own key (shot_<id>) and
       the index (SHOTS_KEY) holds only metadata — listing the gallery never
       deserializes the image blobs. */
    SHOTS_KEY,
    async getShots() {
      const idx = await get(SHOTS_KEY, []);
      return idx.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    },
    async getShotData(id) {
      return await get(SHOT_DATA_PREFIX + id, null);
    },
    async addShot({ dataUrl, url, title, w, h }) {
      const id = uid();
      await set({ [SHOT_DATA_PREFIX + id]: dataUrl });
      const meta = {
        id, url: url || "", urlKey: url ? urlKey(url) : "", origin: originOf(url || ""),
        title: title || "", w: w || 0, h: h || 0, createdAt: Date.now()
      };
      const idx = await get(SHOTS_KEY, []);
      idx.push(meta);
      await set({ [SHOTS_KEY]: idx });
      return meta;
    },
    async removeShot(id) {
      const idx = await get(SHOTS_KEY, []);
      await set({ [SHOTS_KEY]: idx.filter((s) => s.id !== id) });
      await del(SHOT_DATA_PREFIX + id);
    },

    onChanged(cb) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[NOTES_KEY]) {
          cb(changes[NOTES_KEY].newValue || []);
        }
      });
    },
    // Notify when the saved-screenshots index changes (dashboard live refresh).
    onShotsChanged(cb) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[SHOTS_KEY]) cb(changes[SHOTS_KEY].newValue || []);
      });
    }
  };

  global.WLN = Store;
})(typeof window !== "undefined" ? window : globalThis);
