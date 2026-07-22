/* Compy — dashboard: browse, search, edit, and export all notes. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  let all = [];
  let shots = [];
  let exportContext = "";
  const state = { view: "active", site: "__all", color: null, q: "", sort: "updated", selectMode: false, selected: new Set() };

  function commentsOf(n) {
    if (Array.isArray(n.comments) && n.comments.length) return n.comments.map((c) => c.text).filter((t) => t && t.trim());
    return n.note && n.note.trim() ? [n.note] : [];
  }

  const ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 3-7.7L3 8"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.5V4h6v6.5l2 3.5H7z"/></svg>'
  };

  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const AV_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ef4444", "#14b8a6"];
  const isNbOrigin = (o) => typeof o === "string" && o.slice(0, 9) === "notebook:";
  function hostOf(url) {
    const nb = WLN.notebookRef && WLN.notebookRef(url);
    if (nb) return nb.name || "Notebook";
    try { return new URL(url).host; } catch { return "local"; }
  }
  function avatar(host, size) {
    let h = 0; for (let i = 0; i < host.length; i++) h = (h * 31 + host.charCodeAt(i)) >>> 0;
    const bg = AV_COLORS[h % AV_COLORS.length];
    const ch = (host.replace(/^www\./, "")[0] || "?").toUpperCase();
    return `<span class="av" style="display:grid;place-items:center;width:${size}px;height:${size}px;border-radius:5px;background:${bg};color:#fff;font-size:${Math.round(size * 0.58)}px;font-weight:700;flex:none;">${esc(ch)}</span>`;
  }
  function fmtDate(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  }

  /* ---------- data ---------- */
  async function load() {
    await WLN.loadColors();
    all = await WLN.getAll();
    shots = await WLN.getShots();
    exportContext = (await WLN.getSettings()).exportContext || "";
    renderAll();
  }
  const labelOf = (k) => (WLN.COLORS[k] || WLN.COLORS[WLN.DEFAULT_COLOR]).label;
  const colorLabelMap = () => { const m = {}; for (const k of Object.keys(WLN.COLORS)) m[k] = WLN.COLORS[k].label; return m; };

  const isArchived = (n) => !!n.archivedAt;
  // Notes in the current view (active vs archive), before site/color/search.
  function viewPool() {
    return all.filter((n) => state.view === "archive" ? isArchived(n) : !isArchived(n));
  }

  function filtered() {
    const q = state.q.toLowerCase();
    let out = viewPool().filter((n) => {
      if (state.site !== "__all" && (n.origin || WLN.originOf(n.url)) !== state.site) return false;
      if (state.color && n.color !== state.color) return false;
      if (q) {
        const hay = `${n.quote} ${n.note} ${n.title} ${n.url} ${labelOf(n.color)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const cmp = {
      updated: (a, b) => b.updatedAt - a.updatedAt,
      created: (a, b) => b.createdAt - a.createdAt,
      site: (a, b) => (a.origin || "").localeCompare(b.origin || "") || b.updatedAt - a.updatedAt
    }[state.sort];
    // Pinned notes float to the top, then the chosen sort applies.
    return out.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmp(a, b));
  }

  function siteGroups(notes) {
    const map = new Map();
    for (const n of notes) {
      const key = n.origin || hostOf(n.url);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    }
    return map;
  }

  /* ---------- sidebar ---------- */
  function renderSidebar() {
    const active = all.filter((n) => !isArchived(n));
    const archivedCount = all.length - active.length;
    const pool = viewPool(); // sites/colors/tags reflect the current view

    $("#statNotes").textContent = active.length;
    const activeSites = new Set(active.map((n) => n.origin || WLN.originOf(n.url)).filter((o) => o && !isNbOrigin(o)));
    $("#statSites").textContent = activeSites.size;
    $("#allCount").textContent = active.length;
    const archNav = $("#archiveNav");
    if (archNav) {
      archNav.hidden = archivedCount === 0;
      $("#archiveCount").textContent = archivedCount;
    }
    const shotsNav = $("#shotsNav");
    if (shotsNav) {
      shotsNav.hidden = shots.length === 0;
      $("#shotsCount").textContent = shots.length;
    }
    const viewOf = (b) => b.dataset.site === "__archive" ? "archive" : b.dataset.site === "__shots" ? "shots" : "active";
    $$(".nav-item").forEach((b) => {
      const v = viewOf(b);
      b.classList.toggle("active", v === state.view && (v !== "active" || state.site === "__all"));
    });

    const shotsView = state.view === "shots";
    // Labels don't apply to screenshots — hide that section in the gallery view.
    const labelSection = $("#colorFilter").closest(".side-section");
    if (labelSection) labelSection.hidden = shotsView;

    // colors-as-labels present in this view (each color is a tag)
    if (!shotsView) {
      const colorCounts = {};
      for (const n of pool) colorCounts[n.color] = (colorCounts[n.color] || 0) + 1;
      $("#colorFilter").innerHTML = Object.keys(WLN.COLORS)
        .filter((k) => colorCounts[k])
        .map((k) => `<button class="label-item ${state.color === k ? "on" : ""}" data-color="${k}">
          <span class="li-dot" style="background:${WLN.COLORS[k].dot}"></span>
          <span class="li-name">${esc(WLN.COLORS[k].label)}</span>
          <span class="li-count">${colorCounts[k]}</span></button>`).join("")
        || `<span style="font-size:11px;color:var(--text-3);padding:2px 4px;">No labels in view</span>`;
    }

    // origins present in this view (notes, or screenshot origins in gallery view)
    const origins = new Map();
    if (shotsView) {
      for (const s of shots) { const key = s.origin || WLN.originOf(s.url); origins.set(key, (origins.get(key) || 0) + 1); }
    } else {
      for (const n of pool) { const key = n.origin || WLN.originOf(n.url); origins.set(key, (origins.get(key) || 0) + 1); }
    }
    const entries = [...origins.entries()].filter(([o]) => o).sort((a, b) => b[1] - a[1]);
    const rowFor = ([origin, count]) => {
      const host = hostOf(origin);
      return `<div class="site-item ${state.site === origin ? "active" : ""}" data-site="${esc(origin)}">
        ${avatar(host, 16)}<span class="site-host">${esc(host)}</span><span class="site-count">${count}</span></div>`;
    };
    $("#siteList").innerHTML = entries.filter(([o]) => !isNbOrigin(o)).map(rowFor).join("")
      || `<div class="side-empty">No sites yet</div>`;

    // Notebooks: website-less containers. Hidden in the screenshots view.
    const nbSection = $("#notebooksSection");
    if (nbSection) {
      const nbEntries = shotsView ? [] : entries.filter(([o]) => isNbOrigin(o));
      nbSection.hidden = shotsView;
      $("#notebookList").innerHTML = nbEntries.map(rowFor).join("")
        || `<div class="side-empty">No notebooks yet — hit “＋ Add note”.</div>`;
    }
  }

  /* ---------- content ---------- */
  function renderContent() {
    const root = $("#content");
    if (state.view === "shots") return renderShots(root);
    const notes = filtered();
    if (!all.length) return root.innerHTML = emptyAll();

    const archiveView = state.view === "archive";
    const banner = archiveView
      ? `<div class="archive-banner"><span>Archived notes — done and out of the way. They're kept out of exports.</span>
         <button id="restoreAll" class="btn btn-ghost btn-sm">Restore all shown</button></div>`
      : "";
    if (!notes.length) return root.innerHTML = banner + emptyFiltered();

    root.classList.toggle("selmode", state.selectMode);
    if (archiveView) {
      root.innerHTML = banner + `<div class="grid">${notes.map(noteHTML).join("")}</div>`;
      wireNotes();
      const rb = $("#restoreAll");
      if (rb) rb.addEventListener("click", async () => {
        await WLN.setArchived(notes.map((n) => n.id), false);
        all = await WLN.getAll();
        toast(`Restored ${notes.length} note${notes.length === 1 ? "" : "s"}`);
        renderAll();
      });
      return;
    }
    if (state.sort === "site" && state.site === "__all") {
      const groups = siteGroups(notes);
      root.innerHTML = [...groups.entries()].map(([origin, ns]) => {
        const host = hostOf(origin);
        return `<div class="group">
          <div class="group-head">${avatar(host, 18)}<span class="group-title">${esc(host)}</span>
            <span class="group-count">${ns.length}</span>
            ${isNbOrigin(origin) ? "" : `<a class="group-link" href="${esc(ns[0].url)}" target="_blank" rel="noopener">Open ↗</a>`}</div>
          <div class="grid">${ns.map(noteHTML).join("")}</div></div>`;
      }).join("");
    } else {
      root.innerHTML = `<div class="grid">${notes.map(noteHTML).join("")}</div>`;
    }
    wireNotes();
  }

  function noteHTML(n) {
    const color = WLN.COLORS[n.color] || WLN.COLORS[WLN.DEFAULT_COLOR];
    const host = hostOf(n.url);
    const sel = state.selected.has(n.id);
    const isPage = n.type === "page" || !n.quote;
    const nb = WLN.notebookRef ? WLN.notebookRef(n.url) : null;
    const isNotebook = !!nb;
    const comments = commentsOf(n);
    const head = isPage
      ? `<div class="note-quote note-pagehead">${isNotebook
          ? `<span class="badge-page badge-nb">NOTEBOOK</span>${nb.path ? `<span class="nb-path">${esc(nb.path)}</span>` : ""}`
          : `<span class="badge-page">PAGE NOTE</span>`}</div>`
      : `<div class="note-quote">${esc(n.quote)}</div>`;
    const body = comments.length
      ? `<div class="note-comments">${comments.map((c, i) =>
          `<div class="note-comment">${comments.length > 1 ? `<span class="cnum">${i + 1}</span>` : ""}<span>${esc(c)}</span></div>`).join("")}</div>`
      : `<div class="note-body" data-role="empty"><span style="color:var(--text-3);font-style:italic;">No note added — click edit</span></div>`;
    return `<article class="note ${sel ? "sel" : ""} ${isPage ? "is-page" : ""}" data-id="${n.id}" style="--ql:${color.dot}">
      <div class="note-rail" style="background:${color.dot}"></div>
      <div class="note-in">
        <div class="note-top">
          <input type="checkbox" class="note-check" ${sel ? "checked" : ""} aria-label="Select note" />
          ${avatar(host, 15)}
          <span class="note-host" title="${esc(n.url)}">${esc(host)}</span>
          <span class="note-time">${fmtDate(n.updatedAt)}</span>
          ${n.pinned ? `<span class="note-pinned" title="Pinned">${ICON.pin}</span>` : ""}
        </div>
        ${head}
        <div class="note-body-wrap" data-role="body">${body}</div>
        <div class="note-tags"><span class="ntag" data-color="${n.color}" style="background:${color.hl};color:${color.ink}">${esc(labelOf(n.color))}</span></div>
        <div class="note-foot">
          <div class="note-colors">${(isPage && !isNotebook) ? "" : Object.keys(WLN.COLORS).map((k) =>
            `<button class="nc ${k === n.color ? "on" : ""}" data-color="${k}" title="${WLN.COLORS[k].label}" style="background:${WLN.COLORS[k].dot}"></button>`).join("")}</div>
          ${isPage ? "" : `<a class="act" href="${esc(n.url)}" target="_blank" rel="noopener" title="Open page" data-act="open">${ICON.open}</a>`}
          <button class="act ${n.pinned ? "pin-on" : ""}" data-act="pin" title="${n.pinned ? "Unpin" : "Pin to top"}">${ICON.pin}</button>
          <button class="act" data-act="edit" title="Edit notes">${ICON.edit}</button>
          <button class="act ${n.archivedAt ? "done-on" : "done-act"}" data-act="done" title="${n.archivedAt ? "Restore" : "Mark done"}">${n.archivedAt ? ICON.undo : ICON.check}</button>
          <button class="act danger" data-act="del" title="Delete">${ICON.trash}</button>
        </div>
      </div>
    </article>`;
  }

  function wireNotes() {
    $$(".note").forEach((el) => {
      const id = el.dataset.id;
      el.querySelector(".note-check")?.addEventListener("change", (e) => {
        e.target.checked ? state.selected.add(id) : state.selected.delete(id);
        el.classList.toggle("sel", e.target.checked);
        updateSelbar();
      });
      el.querySelector('[data-act="del"]').addEventListener("click", () => removeNote(id, el));
      el.querySelector('[data-act="pin"]').addEventListener("click", async () => {
        const n = all.find((x) => x.id === id); const on = !n.pinned;
        await WLN.setPinned([id], on);
        if (n) n.pinned = on;
        toast(on ? "Pinned to top" : "Unpinned");
        renderContent();
      });
      el.querySelector('[data-act="edit"]').addEventListener("click", () => editNote(id, el));
      el.querySelector('[data-act="done"]').addEventListener("click", async () => {
        const n = all.find((x) => x.id === id);
        const on = !n.archivedAt;
        await WLN.setArchived([id], on);
        all = await WLN.getAll();
        toast(on ? "Marked done — moved to Archive" : "Restored");
        renderAll();
      });
      el.querySelectorAll(".nc").forEach((b) => b.addEventListener("click", async () => {
        await WLN.update(id, { color: b.dataset.color });
        const n = all.find((x) => x.id === id); if (n) n.color = b.dataset.color;
        renderContent();
      }));
    });
  }

  function editNote(id, el) {
    const n = all.find((x) => x.id === id);
    const body = el.querySelector('[data-role="body"]');
    if (el.querySelector(".ne-text")) return;

    let texts = commentsOf(n);
    if (!texts.length) texts = [""];

    function rowsHTML() {
      return texts.map((t, i) => `
        <div class="ne-row" data-i="${i}">
          <textarea class="ne-text" placeholder="${i === 0 ? "Write a note…" : "Another note…"}">${esc(t)}</textarea>
          ${texts.length > 1 ? `<button class="ne-del act danger" data-i="${i}" title="Remove">${ICON.trash}</button>` : ""}
        </div>`).join("");
    }
    body.innerHTML = `<div class="ne-rows">${rowsHTML()}</div>
      <div class="ne-editbar">
        <button class="ne-add">+ Add another note</button>
        <div style="display:flex;gap:8px;">
          <button class="ne-cancel btn btn-ghost btn-sm">Cancel</button>
          <button class="ne-save btn btn-primary btn-sm">Save</button>
        </div>
      </div>`;

    const collect = () => [...body.querySelectorAll(".ne-text")].map((t) => t.value);
    const rerender = () => { body.querySelector(".ne-rows").innerHTML = rowsHTML(); wireRows(); };
    function wireRows() {
      body.querySelectorAll(".ne-del").forEach((b) => b.addEventListener("click", () => {
        texts = collect(); texts.splice(Number(b.dataset.i), 1); if (!texts.length) texts = [""]; rerender();
      }));
    }
    wireRows();
    const first = body.querySelector(".ne-text");
    first.focus(); first.setSelectionRange(first.value.length, first.value.length);

    body.querySelector(".ne-add").addEventListener("click", () => {
      texts = collect(); texts.push(""); rerender();
      const tas = body.querySelectorAll(".ne-text"); tas[tas.length - 1].focus();
    });
    const save = async () => {
      await WLN.setComments(id, collect());
      all = await WLN.getAll();
      renderContent();
    };
    body.querySelector(".ne-save").addEventListener("click", save);
    body.querySelector(".ne-cancel").addEventListener("click", renderContent);
    body.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save();
      if (e.key === "Escape") renderContent();
    });
  }

  async function removeNote(id, el) {
    el.style.opacity = "0.4"; el.style.pointerEvents = "none";
    await WLN.remove(id);
    all = all.filter((n) => n.id !== id);
    state.selected.delete(id);
    renderAll();
    toast("Note deleted");
  }

  /* ---------- selection ---------- */
  function setSelectMode(on) {
    state.selectMode = on;
    if (!on) state.selected.clear();
    $("#selbar").hidden = !on;
    $("#selectBtn").classList.toggle("btn-primary", on);
    renderContent();
    updateSelbar();
  }
  function updateSelbar() {
    const c = state.selected.size;
    $("#selCount").textContent = `${c} selected`;
    const vis = filtered();
    $("#selAll").checked = c > 0 && vis.every((n) => state.selected.has(n.id));
  }
  function targetNotes() {
    if (state.selectMode && state.selected.size) return all.filter((n) => state.selected.has(n.id));
    return filtered();
  }

  /* ---------- export / import ---------- */
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  // Versioning is DOMAIN-based: each origin has its own version counter.
  const originOf = (n) => n.origin || WLN.originOf(n.url);
  function groupByOrigin(notes) {
    const m = new Map();
    for (const n of notes) { const o = originOf(n); if (!m.has(o)) m.set(o, []); m.get(o).push(n); }
    return m;
  }
  // Which origins the current view/selection touches (for history).
  function scopeOrigins() {
    const notes = targetNotes().filter((n) => !isArchived(n));
    return [...groupByOrigin(notes).keys()];
  }

  // Domain-versioned "Copy for AI": each site advances its own version,
  // and the clipboard gets one task list with per-site version headers.
  async function doAiExport(mode) {
    const notes = targetNotes().filter((n) => !isArchived(n));
    if (!notes.length) return toast("No notes to export");
    const delta = mode === "delta";
    const domains = [], commits = [];
    for (const [origin, ns] of groupByOrigin(notes)) {
      const info = await WLN.exportInfo(origin, ns);
      const chosen = delta ? info.changed : ns;
      if (!chosen.length) continue;
      domains.push({ host: hostOf(origin) || origin, url: ns[0].url, version: info.version, sinceVersion: info.sinceVersion, mode: delta ? "delta" : "full", notes: chosen });
      commits.push({ origin, version: info.version, snapshot: info.snapshot, count: chosen.length });
    }
    if (!domains.length) return toast(delta ? "Nothing new since last export" : "Nothing to export");
    const md = WLNExport.toMarkdownVersioned(domains, { title: "Compy — task list", context: exportContext, at: Date.now(), mode: delta ? "delta" : "full", colorLabels: colorLabelMap() });
    try { await navigator.clipboard.writeText(md); }
    catch { return toast("Clipboard blocked"); }
    for (const c of commits) await WLN.commitExport(c.origin, { version: c.version, mode: delta ? "delta" : "full", snapshot: c.snapshot, text: md, count: c.count });
    const total = domains.reduce((s, d) => s + d.notes.length, 0);
    toast(`Copied ${total} task${total === 1 ? "" : "s"} · ${domains.map((d) => "v" + d.version + " " + d.host).join(", ")}`);
  }

  async function doExport(kind) {
    if (kind === "history") return openHistory();
    if (kind === "ai") return doAiExport("delta");
    if (kind === "ai-all") return doAiExport("full");
    const notes = targetNotes();
    if (!notes.length) return toast("No notes to export");
    if (kind === "md") return download(`webnotes-${stamp()}.md`, WLNExport.toMarkdown(notes, { context: exportContext, colorLabels: colorLabelMap() }), "text/markdown");
    if (kind === "csv") return download(`webnotes-${stamp()}.csv`, WLNExport.toCSV(notes), "text/csv");
    if (kind === "csvenc") {
      const pass = await askModal("Encrypt backup", "Choose a passphrase. You'll need it to restore this file — it cannot be recovered.");
      if (!pass) return;
      const enc = await WLNCrypto.encrypt(WLNExport.toCSV(notes), pass);
      download(`webnotes-${stamp()}.wlnenc.txt`, enc, "text/plain");
      toast("Encrypted backup saved");
    }
  }

  /* ---------- export history ---------- */
  function timeAgoShort(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); return `${d}d ago`;
  }

  // Live hint in the export menu: how many tasks are new across the view's domains.
  async function refreshExportHints() {
    const notes = targetNotes().filter((n) => !isArchived(n));
    let deltaCount = 0, hasHistory = false;
    for (const [origin, ns] of groupByOrigin(notes)) {
      const info = await WLN.exportInfo(origin, ns);
      deltaCount += info.changed.length;
      if (info.history && info.history.length) hasHistory = true;
    }
    const dh = $("#aiDeltaHint"), hh = $("#histHint");
    if (dh) dh.textContent = deltaCount ? `· ${deltaCount} new` : "· nothing new";
    if (hh) hh.textContent = hasHistory ? "Re-copy or preview any past version" : "No versions yet";
  }

  /* ---------- manage colors / labels ---------- */
  async function openColorsModal() {
    const s = await WLN.getSettings();
    const custom = new Set((s.customColors || []).map((c) => c.key));
    const list = $("#colorsList");
    list.innerHTML = Object.keys(WLN.COLORS).map((k) => {
      const c = WLN.COLORS[k];
      const isCustom = custom.has(k);
      return `<div class="cl-row" data-key="${k}">
        ${isCustom
          ? `<input type="color" class="cl-swatch" value="${c.dot}" data-key="${k}" title="Pick color" />`
          : `<span class="cl-dot" style="background:${c.dot}"></span>`}
        <input class="cl-name" data-key="${k}" value="${esc(c.label)}" maxlength="24" />
        ${isCustom ? `<button class="cl-del" data-key="${k}" title="Remove">✕</button>` : `<span class="cl-badge">built-in</span>`}
      </div>`;
    }).join("");

    list.querySelectorAll(".cl-name").forEach((inp) => inp.addEventListener("change", async () => {
      await WLN.setColorLabel(inp.dataset.key, inp.value.trim());
      renderAll();
    }));
    list.querySelectorAll(".cl-swatch").forEach((inp) => inp.addEventListener("change", async () => {
      await WLN.updateCustomColor(inp.dataset.key, { dot: inp.value });
      renderAll();
    }));
    list.querySelectorAll(".cl-del").forEach((b) => b.addEventListener("click", async () => {
      await WLN.removeCustomColor(b.dataset.key);
      renderAll(); openColorsModal();
    }));

    const addBtn = $("#addColorBtn");
    const atMax = (s.customColors || []).length >= WLN.MAX_CUSTOM;
    addBtn.disabled = atMax;
    addBtn.textContent = atMax ? `Max ${WLN.MAX_CUSTOM} custom colors` : "＋ Add custom color";
    $("#colorsModal").hidden = false;
  }

  async function openHistory() {
    const log = await WLN.getExportLog();
    const inView = scopeOrigins();
    const keys = inView.length ? inView : Object.keys(log);
    // Group versions by site; newest first within each site.
    const sites = [];
    for (const origin of keys) {
      const vers = (log[origin] || []).slice().sort((a, b) => b.version - a.version);
      if (vers.length) sites.push({ origin, host: hostOf(origin) || origin, vers });
    }
    sites.sort((a, b) => (b.vers[0].at) - (a.vers[0].at));

    const total = sites.reduce((s, x) => s + x.vers.length, 0);
    $("#histScope").textContent = total
      ? `Every time you Copy for AI, Compy saves that exact text as a version. Nothing is lost — re-copy or preview any of them below.`
      : `No versions yet. Hit “Copy for AI” and your first version (v1) shows up here.`;

    // Flat index so buttons can address a single version.
    const flat = [];
    const list = $("#histList");
    list.innerHTML = sites.map((site) => {
      const rows = site.vers.map((v) => {
        const idx = flat.push({ ...v, host: site.host }) - 1;
        const isLatest = v.version === site.vers[0].version;
        const scope = v.mode === "delta" ? "only new since last time" : "everything";
        return `
        <div class="hist-row" data-i="${idx}">
          <div class="hist-meta">
            <span class="hist-ver">v${v.version}</span>
            ${isLatest ? `<span class="hist-latest">latest</span>` : ""}
            <span class="hist-count">${v.count} task${v.count === 1 ? "" : "s"}</span>
            <span class="hist-scope">${scope}</span>
            <span class="hist-time">${timeAgoShort(v.at)}</span>
          </div>
          <div class="hist-acts">
            <button class="btn btn-ghost btn-sm hist-prev" data-i="${idx}">Preview</button>
            <button class="btn btn-primary btn-sm hist-copy" data-i="${idx}">Copy</button>
          </div>
        </div>
        <pre class="hist-preview" data-i="${idx}" hidden></pre>`;
      }).join("");
      return `<div class="hist-site"><span class="hist-site-name">${esc(site.host)}</span><span class="hist-site-sub">${site.vers.length} version${site.vers.length === 1 ? "" : "s"}</span></div>${rows}`;
    }).join("") || `<p class="modal-msg" style="margin:0;">Nothing here yet.</p>`;

    list.querySelectorAll(".hist-copy").forEach((b) => b.addEventListener("click", async () => {
      const v = flat[Number(b.dataset.i)];
      if (!v) return;
      try { await navigator.clipboard.writeText(v.text || ""); }
      catch { return toast("Clipboard blocked"); }
      toast(`Re-copied ${v.host} v${v.version}`);
    }));
    list.querySelectorAll(".hist-prev").forEach((b) => b.addEventListener("click", () => {
      const pre = list.querySelector(`.hist-preview[data-i="${b.dataset.i}"]`);
      if (!pre) return;
      const showing = !pre.hidden;
      pre.hidden = showing;
      if (!showing) pre.textContent = flat[Number(b.dataset.i)].text || "(empty)";
      b.textContent = showing ? "Preview" : "Hide";
    }));
    $("#histModal").hidden = false;
  }

  async function doImport(file) {
    let text = await file.text();
    if (WLNCrypto.isEncrypted(text)) {
      const pass = await askModal("Decrypt backup", "This backup is encrypted. Enter its passphrase.");
      if (!pass) return;
      try { text = await WLNCrypto.decrypt(text, pass); }
      catch (e) { return toast(e.message || "Decrypt failed"); }
    }
    let incoming;
    try { incoming = WLNExport.parseCSV(text); }
    catch { return toast("Could not read file"); }
    if (!incoming.length) return toast("No notes found in file");

    // normalize imported rows to full note records
    incoming = incoming.map((r) => ({
      id: r.id || WLN.uid(),
      url: r.url, urlKey: WLN.urlKey(r.url), origin: WLN.originOf(r.url),
      title: r.title, color: r.color, quote: r.quote, note: r.note,
      prefix: r.prefix, suffix: r.suffix, tags: r.tags || [],
      createdAt: r.createdAt, updatedAt: r.updatedAt
    }));
    const res = await WLN.mergeImport(incoming);
    await load();
    toast(`Imported ${res.added} new, updated ${res.updated}`);
  }

  /* ---------- add manual note (notebook or site) ---------- */
  let addColor = WLN.DEFAULT_COLOR;
  function renderAddColors() {
    $("#addColors").innerHTML = Object.keys(WLN.COLORS).map((k) =>
      `<button type="button" class="add-swatch ${k === addColor ? "on" : ""}" data-color="${k}" title="${esc(WLN.COLORS[k].label)}" style="background:${WLN.COLORS[k].dot}"></button>`).join("");
  }
  function openAddModal(prefill) {
    addColor = WLN.DEFAULT_COLOR;
    const origins = new Set(all.filter((n) => !isArchived(n)).map((n) => n.origin || WLN.originOf(n.url)).filter(Boolean));
    const nbNames = [...origins].filter(isNbOrigin).map((o) => WLN.notebookRef(o).name);
    const siteHosts = [...origins].filter((o) => !isNbOrigin(o)).map((o) => hostOf(o));
    $("#nbSuggest").innerHTML = [...new Set([...nbNames, ...siteHosts])].map((v) => `<option value="${esc(v)}"></option>`).join("");
    $("#addTarget").value = prefill || "";
    $("#addPath").value = ""; $("#addText").value = ""; $("#addPin").checked = false;
    renderAddColors();
    $("#addModal").hidden = false;
    setTimeout(() => (prefill ? $("#addText") : $("#addTarget")).focus(), 30);
  }
  // Decide whether the user typed a website or a notebook name, and build the url.
  function resolveTarget(target, path) {
    target = (target || "").trim(); path = (path || "").trim();
    if (!target) return null;
    const looksUrl = /^https?:\/\//i.test(target) || /^[\w-]+(\.[\w-]+)+(\/|$|:)/i.test(target);
    if (looksUrl) {
      const base = /^https?:\/\//i.test(target) ? target : "https://" + target;
      try {
        const u = new URL(base);
        if (path) u.pathname = ("/" + u.pathname.replace(/^\/+|\/+$/g, "") + "/" + path.replace(/^\/+/, "")).replace(/\/{2,}/g, "/");
        return { url: u.toString(), title: "", kind: "site" };
      } catch { /* fall through to notebook */ }
    }
    const url = WLN.makeNotebookUrl(target, path);
    const ref = WLN.notebookRef(url);
    return { url, title: ref.path || ref.name, kind: "notebook" };
  }
  async function saveAddNote() {
    const t = resolveTarget($("#addTarget").value, $("#addPath").value);
    if (!t) { $("#addTarget").focus(); return toast("Enter a notebook name or website"); }
    const text = $("#addText").value.trim();
    const rec = await WLN.add({ type: "page", url: t.url, title: t.title, color: addColor, comments: text ? [WLN.mkComment(text)] : [] });
    if ($("#addPin").checked) await WLN.setPinned([rec.id], true);
    all = await WLN.getAll();
    // Surface the new note: switch to its container so the user sees it land.
    state.view = "active"; state.color = null;
    state.site = rec.origin || WLN.originOf(rec.url);
    $("#addModal").hidden = true;
    renderAll();
    toast(t.kind === "notebook" ? "Added to notebook" : "Note added");
  }

  /* ---------- modal ---------- */
  let modalResolver = null;
  function askModal(title, msg) {
    return new Promise((resolve) => {
      modalResolver = resolve;
      $("#modalTitle").textContent = title;
      $("#modalMsg").textContent = msg;
      const inp = $("#modalInput"); inp.value = "";
      $("#modal").hidden = false;
      setTimeout(() => inp.focus(), 30);
    });
  }
  function closeModal(val) {
    $("#modal").hidden = true;
    if (modalResolver) { modalResolver(val); modalResolver = null; }
  }

  /* ---------- toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  /* ---------- empty states ---------- */
  function emptyAll() {
    return `<div class="empty-big">
      <div class="eb-ico"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>
      <h2>No notes yet</h2>
      <p>Head to any website, select some text, and highlight it or attach a note. Everything you capture shows up here.</p>
      <div class="kbds">
        <span class="kchip"><kbd>Alt</kbd><kbd>⇧</kbd><kbd>H</kbd> Highlight</span>
        <span class="kchip"><kbd>Alt</kbd><kbd>⇧</kbd><kbd>N</kbd> Highlight + note</span>
        <span class="kchip"><kbd>Alt</kbd><kbd>⇧</kbd><kbd>P</kbd> Open popup</span>
      </div>
    </div>`;
  }
  function emptyFiltered() {
    return `<div class="empty-big"><h2>Nothing here</h2><p>No notes match your current filters. Try clearing the search or picking a different site.</p></div>`;
  }

  /* ---------- screenshots gallery ---------- */
  const ICON_DL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>';

  async function renderShots(root) {
    if (!shots.length) return root.innerHTML = emptyShots();
    root.classList.remove("selmode");
    const list = state.site === "__all"
      ? shots
      : shots.filter((s) => (s.origin || WLN.originOf(s.url)) === state.site);
    if (!list.length) return root.innerHTML = `<div class="empty-big"><h2>No screenshots here</h2><p>No saved screenshots for this site. Pick a different site or clear the filter.</p></div>`;
    root.innerHTML = `<div class="archive-banner"><span>Saved screenshots — a private gallery on your device, kept out of AI exports.</span></div>
      <div class="shot-grid" id="shotGrid"></div>`;
    const grid = root.querySelector("#shotGrid");
    // Image blobs live in their own keys; load them lazily after the frame.
    const cards = await Promise.all(list.map(async (s) => shotCard(s, await WLN.getShotData(s.id))));
    if (state.view !== "shots") return; // view switched while loading
    grid.innerHTML = cards.join("");
    wireShots(grid);
  }

  function shotCard(s, dataUrl) {
    const host = hostOf(s.url || s.origin || "");
    const title = s.title || host;
    const src = dataUrl || "";
    return `<figure class="shot-card" data-id="${s.id}">
      <button class="shot-thumb" data-shot-act="view" title="View full size">
        <img src="${src}" alt="${esc(title)}" loading="lazy" />
      </button>
      <figcaption class="shot-cap">
        <div class="shot-title">${avatar(host, 16)}<span>${esc(title)}</span></div>
        <div class="shot-sub">${esc(host)} · ${fmtDate(s.createdAt)}</div>
        <div class="shot-acts">
          <button class="act" data-shot-act="download" title="Download PNG">${ICON_DL}</button>
          <button class="act" data-shot-act="delete" title="Delete">${ICON.trash}</button>
        </div>
      </figcaption>
    </figure>`;
  }

  function openLightbox(src) {
    const box = document.createElement("div");
    box.className = "shot-lightbox";
    box.innerHTML = `<img src="${src}" alt="" /><button class="lb-close" aria-label="Close">✕</button>`;
    const close = () => { box.remove(); document.removeEventListener("keydown", onEsc, true); };
    const onEsc = (e) => { if (e.key === "Escape") close(); };
    box.addEventListener("click", close);
    document.addEventListener("keydown", onEsc, true);
    document.body.appendChild(box);
  }

  function wireShots(grid) {
    grid.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-shot-act]"); if (!btn) return;
      e.preventDefault();
      const card = btn.closest(".shot-card"); const id = card.dataset.id;
      if (btn.dataset.shotAct === "view") {
        openLightbox(card.querySelector("img").getAttribute("src"));
        return;
      }
      if (btn.dataset.shotAct === "download") {
        const src = card.querySelector("img").getAttribute("src");
        const a = document.createElement("a");
        a.href = src; a.download = `compy-${id.slice(0, 8)}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      } else if (btn.dataset.shotAct === "delete") {
        await WLN.removeShot(id);
        shots = shots.filter((s) => s.id !== id);
        renderAll(); toast("Screenshot deleted");
      }
    });
  }

  function emptyShots() {
    return `<div class="empty-big">
      <div class="eb-ico"><svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.7-1l.6-1a2 2 0 0 1 1.7-1h3.6a2 2 0 0 1 1.7 1l.6 1a2 2 0 0 0 1.7 1H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg></div>
      <h2>No screenshots yet</h2>
      <p>Press <kbd>Alt</kbd>+<kbd>⇧</kbd>+<kbd>S</kbd> on any page (or the popup 📷), annotate, then <b>Save</b>. Saved shots land here — private, never exported.</p>
    </div>`;
  }

  /* ---------- render ---------- */
  function renderAll() { renderSidebar(); renderContent(); updateSelbar(); }

  /* ---------- events ---------- */
  function bind() {
    $("#search").addEventListener("input", (e) => { state.q = e.target.value; renderContent(); });
    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderContent(); });

    document.querySelector(".side-nav").addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item"); if (!item) return;
      // Switching view resets the in-view filters.
      state.view = item.dataset.site === "__archive" ? "archive"
        : item.dataset.site === "__shots" ? "shots" : "active";
      state.site = "__all"; state.color = null;
      renderAll();
    });
    $("#colorFilter").addEventListener("click", (e) => {
      const d = e.target.closest(".label-item"); if (!d) return;
      state.color = state.color === d.dataset.color ? null : d.dataset.color;
      renderAll();
    });
    const siteClick = (e) => {
      const s = e.target.closest(".site-item"); if (!s) return;
      state.site = state.site === s.dataset.site ? "__all" : s.dataset.site;
      renderAll();
    };
    $("#siteList").addEventListener("click", siteClick);
    $("#notebookList").addEventListener("click", siteClick);

    // add manual note (notebook or site)
    const addModal = $("#addModal");
    const nbNameOfSelected = () => (isNbOrigin(state.site) ? WLN.notebookRef(state.site).name : "");
    $("#addNoteBtn").addEventListener("click", () => openAddModal(nbNameOfSelected()));
    $("#addNoteHead").addEventListener("click", () => openAddModal(nbNameOfSelected()));
    $("#addCancel").addEventListener("click", () => (addModal.hidden = true));
    $("#addSave").addEventListener("click", saveAddNote);
    addModal.addEventListener("click", (e) => { if (e.target.id === "addModal") addModal.hidden = true; });
    $("#addColors").addEventListener("click", (e) => {
      const b = e.target.closest(".add-swatch"); if (!b) return;
      addColor = b.dataset.color; renderAddColors();
    });
    addModal.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveAddNote();
      if (e.key === "Escape") addModal.hidden = true;
    });

    $("#selectBtn").addEventListener("click", () => setSelectMode(!state.selectMode));
    $("#selCancel").addEventListener("click", () => setSelectMode(false));
    $("#selAll").addEventListener("change", (e) => {
      const vis = filtered();
      if (e.target.checked) vis.forEach((n) => state.selected.add(n.id));
      else state.selected.clear();
      renderContent(); updateSelbar();
    });
    $("#selDelete").addEventListener("click", async () => {
      const ids = [...state.selected];
      if (!ids.length) return;
      await WLN.removeMany(ids);
      all = all.filter((n) => !state.selected.has(n.id));
      state.selected.clear();
      renderAll(); toast(`Deleted ${ids.length} note(s)`);
    });
    $("#selDone").addEventListener("click", async () => {
      const ids = [...state.selected];
      if (!ids.length) return toast("Select some notes first");
      const on = state.view !== "archive";
      await WLN.setArchived(ids, on);
      all = await WLN.getAll();
      state.selected.clear(); setSelectMode(false);
      toast(on ? `Marked ${ids.length} done` : `Restored ${ids.length}`);
      renderAll();
    });
    $$("[data-selexp]").forEach((b) => b.addEventListener("click", () => doExport(b.dataset.selexp)));

    // export: primary "Copy for AI" (delta) + caret menu
    const menu = $("#exportMenu");
    $("#copyAiBtn").addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = true; doAiExport("delta"); });
    $("#exportBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      if (!menu.hidden) await refreshExportHints();
    });
    document.addEventListener("click", () => (menu.hidden = true));
    menu.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-exp]"); if (!opt) return;
      menu.hidden = true; doExport(opt.dataset.exp);
    });

    // export history modal
    const histModal = $("#histModal");
    $("#histClose").addEventListener("click", () => (histModal.hidden = true));
    histModal.addEventListener("click", (e) => { if (e.target.id === "histModal") histModal.hidden = true; });

    // manage colors / labels modal
    const colorsModal = $("#colorsModal");
    $("#manageColors").addEventListener("click", () => openColorsModal());
    $("#colorsClose").addEventListener("click", () => (colorsModal.hidden = true));
    colorsModal.addEventListener("click", (e) => { if (e.target.id === "colorsModal") colorsModal.hidden = true; });
    $("#addColorBtn").addEventListener("click", async () => {
      const palette = ["#8b5cf6", "#0ea5e9", "#f43f5e", "#84cc16", "#d946ef", "#f59e0b"];
      const used = new Set(Object.values(WLN.COLORS).map((c) => c.dot));
      const dot = palette.find((p) => !used.has(p)) || "#8b5cf6";
      const key = await WLN.addCustomColor(dot, "Custom");
      if (!key) return toast(`Max ${WLN.MAX_CUSTOM} custom colors`);
      renderAll(); openColorsModal();
    });

    // import
    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const f = e.target.files[0]; if (f) doImport(f); e.target.value = "";
    });

    // AI context modal
    const ctxModal = $("#ctxModal");
    $("#ctxBtn").addEventListener("click", () => { $("#ctxInput").value = exportContext; ctxModal.hidden = false; setTimeout(() => $("#ctxInput").focus(), 30); });
    $("#ctxCancel").addEventListener("click", () => (ctxModal.hidden = true));
    $("#ctxSave").addEventListener("click", async () => {
      exportContext = $("#ctxInput").value;
      await WLN.setSettings({ exportContext });
      ctxModal.hidden = true;
      toast("AI context saved");
    });
    ctxModal.addEventListener("click", (e) => { if (e.target.id === "ctxModal") ctxModal.hidden = true; });

    // modal
    $("#modalOk").addEventListener("click", () => closeModal($("#modalInput").value));
    $("#modalCancel").addEventListener("click", () => closeModal(null));
    $("#modalInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") closeModal($("#modalInput").value);
      if (e.key === "Escape") closeModal(null);
    });
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(null); });

    // keyboard: / focuses search
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault(); $("#search").focus();
      }
    });

    WLN.onChanged((notes) => { all = notes; renderAll(); });
    // Live-refresh the gallery when a shot is saved/deleted from any context.
    WLN.onShotsChanged(async () => {
      shots = await WLN.getShots();
      renderSidebar();
      if (state.view === "shots") renderContent();
    });
  }

  bind();
  load();
})();
