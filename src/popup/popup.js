/* Compy — popup: notes for the current page, incl. orphaned highlights. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const listEl = $("#list");
  let tab = null;
  let pageUrl = "";      // resolved current-page URL (tab or content script)
  let pageKey = "";      // urlKey(pageUrl)
  let notes = [];        // on THIS page: {...note, orphaned}
  let siteNotes = [];    // same origin, other pages
  let hasContent = false;
  let filter = "";

  const ICON = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    ghost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01M15 10h.01M4 20V10a8 8 0 0 1 16 0v10l-3-2-2 2-3-2-3 2-2-2Z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>'
  };

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function sendTab(msg) {
    return new Promise((resolve) => {
      if (!tab) return resolve(null);
      chrome.tabs.sendMessage(tab.id, msg, (r) => { void chrome.runtime.lastError; resolve(r); });
    });
  }

  function ensureInjected() {
    return new Promise((resolve) => {
      if (!tab) return resolve();
      chrome.runtime.sendMessage({ type: "WLN_ENSURE", tabId: tab.id, url: tab.url }, () => {
        void chrome.runtime.lastError; resolve();
      });
    });
  }

  async function load() {
    await WLN.loadColors();
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await ensureInjected();
    const state = await sendTab({ type: "WLN_GET_STATE" });
    const live = state && Array.isArray(state.notes) ? state.notes : null;
    hasContent = !!live;

    // Resolve the current page URL from the most reliable source available:
    // the content script knows its own location; otherwise the tab.
    pageUrl = (state && state.url) || tab?.url || "";
    pageKey = WLN.urlKey(pageUrl);
    const origin = WLN.originOf(pageUrl);

    $("#pageTitle").textContent = (state && state.title) || tab?.title || "This page";
    try { $("#pageHost").textContent = new URL(pageUrl).host; } catch { $("#pageHost").textContent = ""; }

    const all = (await WLN.getAll()).filter((n) => !n.archivedAt); // hide archived
    const byUpdated = (a, b) => b.updatedAt - a.updatedAt;

    // On THIS page: prefer live notes (orphan-aware); else match from storage.
    if (live && live.length) {
      notes = live.filter((n) => !n.archivedAt);
    } else {
      notes = all.filter((n) => WLN.urlKey(n.url) === pageKey).map((n) => ({ ...n, orphaned: false }));
    }
    const onIds = new Set(notes.map((n) => n.id));

    // Same site, other pages — so nothing is ever hidden just because the
    // exact URL differs (query params, SPA routes, re-anchor misses).
    siteNotes = origin
      ? all.filter((n) => !onIds.has(n.id) && (n.origin || WLN.originOf(n.url)) === origin && WLN.urlKey(n.url) !== pageKey)
      : [];

    notes.sort(byUpdated);
    siteNotes.sort(byUpdated);
    render();
  }

  const hostOf = (u) => { try { return new URL(u).host; } catch { return ""; } };

  function counts() {
    const orphans = notes.filter((n) => n.orphaned).length;
    const el = $("#counts");
    el.innerHTML = "";
    if (notes.length) el.insertAdjacentHTML("beforeend", `<span class="pill">${notes.length} note${notes.length > 1 ? "s" : ""}</span>`);
    if (orphans) el.insertAdjacentHTML("beforeend", `<span class="pill warn" title="Highlights not currently visible on the page">${ICON.ghost} ${orphans} lost</span>`);
  }

  function matches(n) {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (n.quote || "").toLowerCase().includes(q)
      || commentsOf(n).join(" ").toLowerCase().includes(q)
      || (n.title || "").toLowerCase().includes(q);
  }

  function divider(label, count) {
    const d = document.createElement("div");
    d.className = "list-divider";
    d.innerHTML = `<span>${esc(label)}</span><span class="ld-count">${count}</span>`;
    return d;
  }

  function render() {
    counts();
    $("#searchWrap").hidden = (notes.length + siteNotes.length) < 4;

    const onShown = notes.filter(matches);
    const siteShown = siteNotes.filter(matches);

    if (!notes.length && !siteNotes.length) return renderEmpty();

    listEl.innerHTML = "";
    if (onShown.length) {
      for (const n of onShown) listEl.appendChild(card(n));
    } else if (notes.length === 0 && siteShown.length && !filter) {
      listEl.appendChild(divider("Nothing highlighted on this page yet", ""));
    }
    if (siteShown.length) {
      listEl.appendChild(divider("Elsewhere on this site", siteShown.length));
      for (const n of siteShown) listEl.appendChild(card(n, true));
    }
    if (!onShown.length && !siteShown.length) {
      listEl.innerHTML = `<div class="empty"><p>No notes match “${esc(filter)}”.</p></div>`;
    }
  }

  function renderEmpty() {
    listEl.innerHTML = `
      <div class="empty">
        <div class="empty-ico">
          <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </div>
        <h3>No notes on this page yet</h3>
        <p>Select any text, then pick a color or add a note.</p>
        <div class="hintrow">
          <span class="hint"><kbd>Alt</kbd><kbd>⇧</kbd><kbd>H</kbd> highlight the selection</span>
          <span class="hint"><kbd>Alt</kbd><kbd>⇧</kbd><kbd>N</kbd> highlight and add a note</span>
        </div>
      </div>`;
  }

  function commentsOf(n) {
    if (Array.isArray(n.comments) && n.comments.length) return n.comments.map((c) => c.text).filter((t) => t && t.trim());
    return n.note && n.note.trim() ? [n.note] : [];
  }

  function card(n, external) {
    const color = WLN.COLORS[n.color] || WLN.COLORS[WLN.DEFAULT_COLOR];
    const isPage = n.type === "page" || !n.quote;
    const comments = commentsOf(n);
    const el = document.createElement("div");
    el.className = external ? "card card-ext" : "card";
    el.dataset.id = n.id;
    const head = isPage
      ? `<div class="card-quote"><span class="tag-page">PAGE NOTE</span></div>`
      : `<div class="card-quote">${esc(n.quote)}</div>`;
    const body = comments.length
      ? comments.map((c, i) => `<div class="card-note">${i > 0 ? '<span class="cnum">' + (i + 1) + '</span>' : ""}${esc(c)}</div>`).join("")
      : `<div class="card-note" style="font-style:italic;color:var(--text-3)">No note yet — click to add</div>`;
    const where = external
      ? `<span class="card-time card-where" title="${esc(n.url)}">${ICON.ext} ${esc(n.title || hostOf(n.url))}</span>`
      : "";
    const tagRow = `<div class="card-tags"><span class="ntag" style="background:${color.hl};color:${color.ink}">${esc(color.label)}</span></div>`;
    el.innerHTML = `
      <div class="card-rail" style="background:${color.dot}"></div>
      <div class="card-body">
        ${head}
        ${body}
        ${tagRow}
        <div class="card-meta">
          ${where}
          ${n.orphaned ? `<span class="tag-orphan">${ICON.ghost} not on page</span>` : ""}
          ${comments.length > 1 ? `<span class="card-time">${comments.length} notes</span>` : ""}
          <span class="card-time">${timeAgo(n.updatedAt)}</span>
        </div>
      </div>
      <div class="card-actions">
        ${external
          ? `<button class="mini" data-act="open" title="Open this page" aria-label="Open">${ICON.ext}</button>`
          : `<button class="mini" data-act="edit" title="Edit notes" aria-label="Edit">${ICON.edit}</button>`}
        <button class="mini danger" data-act="del" title="Delete" aria-label="Delete">${ICON.trash}</button>
      </div>`;

    el.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "del") return del(n.id, el);
      if (external || act === "open") {
        // Off-page note: navigate to its page (highlight re-anchors there).
        chrome.tabs.create({ url: n.url });
        window.close();
        return;
      }
      if (act === "edit") return toggleInline(n, el);
      if (!isPage && !n.orphaned && hasContent) {
        const r = await sendTab({ type: "WLN_SCROLL_TO", id: n.id });
        if (r && r.ok) window.close();
        else toggleInline(n, el);
      } else {
        toggleInline(n, el);
      }
    });
    return el;
  }

  function toggleInline(n, el, autoAdd) {
    const existing = el.querySelector(".inline-edit");
    if (existing) { existing.remove(); return; }
    document.querySelectorAll(".inline-edit").forEach((x) => x.remove());
    const isPage = n.type === "page" || !n.quote;

    const box = document.createElement("div");
    box.className = "inline-edit";
    box.style.cssText = "grid-column:1 / -1; margin-top:8px;";
    const taStyle = "width:100%;resize:vertical;border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:13px;background:var(--surface-2);color:var(--text);outline:none;";

    let texts = commentsOf(n);
    if (!texts.length) texts = [""];

    function rowsHTML() {
      return texts.map((t, i) => `
        <div class="ie-row" data-i="${i}" style="display:flex;gap:6px;align-items:flex-start;margin-bottom:6px;">
          <textarea class="ie-text" rows="2" placeholder="${i === 0 ? "Write a note…" : "Another note…"}" style="${taStyle}">${esc(t)}</textarea>
          ${texts.length > 1 ? `<button class="mini danger ie-del" data-i="${i}" title="Remove" style="flex:none;">${ICON.trash}</button>` : ""}
        </div>`).join("");
    }
    box.innerHTML = `
      <div class="ie-rows">${rowsHTML()}</div>
      <button class="ie-add" style="font-size:12px;color:var(--primary);font-weight:600;padding:2px 0;margin-bottom:8px;">+ Add another note</button>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div class="ie-colors" style="display:flex;gap:6px;">${isPage ? "" : Object.keys(WLN.COLORS).map((k) => `<button class="ie-sw" data-color="${k}" title="${WLN.COLORS[k].label}" style="width:20px;height:20px;border-radius:50%;background:${WLN.COLORS[k].dot};border:2px solid ${k === n.color ? "var(--text)" : "transparent"};"></button>`).join("")}</div>
        <button class="btn btn-primary btn-sm ie-save">Save</button>
      </div>`;
    box.addEventListener("click", (e) => e.stopPropagation());
    el.appendChild(box);

    const collect = () => [...box.querySelectorAll(".ie-text")].map((t) => t.value);
    const rerender = () => { box.querySelector(".ie-rows").innerHTML = rowsHTML(); wireRows(); };
    function wireRows() {
      box.querySelectorAll(".ie-del").forEach((b) => b.addEventListener("click", () => {
        texts = collect(); texts.splice(Number(b.dataset.i), 1); if (!texts.length) texts = [""]; rerender();
      }));
    }
    wireRows();
    const firstTa = box.querySelector(".ie-text");
    firstTa.focus(); firstTa.setSelectionRange(firstTa.value.length, firstTa.value.length);

    box.querySelector(".ie-add").addEventListener("click", () => {
      texts = collect(); texts.push(""); rerender();
      const tas = box.querySelectorAll(".ie-text"); tas[tas.length - 1].focus();
    });

    if (!isPage) box.querySelector(".ie-colors").addEventListener("click", async (e) => {
      const sw = e.target.closest(".ie-sw"); if (!sw) return;
      n.color = sw.dataset.color;
      await WLN.update(n.id, { color: n.color });
      box.querySelectorAll(".ie-sw").forEach((b) => b.style.borderColor = b.dataset.color === n.color ? "var(--text)" : "transparent");
      const rail = el.querySelector(".card-rail"); if (rail) rail.style.background = WLN.COLORS[n.color].dot;
    });
    const save = async () => {
      await WLN.setComments(n.id, collect());
      await reloadState();
    };
    box.querySelector(".ie-save").addEventListener("click", save);
    box.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save(); });
    if (autoAdd) firstTa.focus();
  }

  async function del(id, el) {
    el.style.opacity = "0.4";
    const onThisPage = notes.some((n) => n.id === id);
    // Content script can only remove notes on its own page; site notes and the
    // extension-page fallback go straight to storage.
    if (hasContent && onThisPage) await sendTab({ type: "WLN_DELETE", id });
    else await WLN.remove(id);
    notes = notes.filter((n) => n.id !== id);
    siteNotes = siteNotes.filter((n) => n.id !== id);
    render();
  }

  // Re-read notes from storage, preserving orphan flags (edits don't change anchoring).
  async function reloadState() {
    const orphanMap = new Map(notes.map((n) => [n.id, n.orphaned]));
    const all = await WLN.getAll();
    const origin = WLN.originOf(pageUrl);
    notes = all.filter((n) => WLN.urlKey(n.url) === pageKey).map((n) => ({ ...n, orphaned: orphanMap.get(n.id) || false }));
    const onIds = new Set(notes.map((n) => n.id));
    siteNotes = origin
      ? all.filter((n) => !onIds.has(n.id) && (n.origin || WLN.originOf(n.url)) === origin && WLN.urlKey(n.url) !== pageKey)
      : [];
    notes.sort((a, b) => b.updatedAt - a.updatedAt);
    siteNotes.sort((a, b) => b.updatedAt - a.updatedAt);
    render();
  }

  $("#openDash").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "WLN_OPEN_DASHBOARD" });
    window.close();
  });
  $("#addPageNote").addEventListener("click", async () => {
    if (!pageUrl) return;
    const rec = await WLN.addPageNote(pageUrl, $("#pageTitle").textContent || "This page", "");
    await reloadState();
    const el = listEl.querySelector(`.card[data-id="${rec.id}"]`);
    if (el) toggleInline({ ...rec, orphaned: false }, el, true);
  });
  $("#shot").addEventListener("click", () => {
    // Background captures the visible tab then opens the annotator on the page.
    // Popup must close so it isn't the focused surface when the overlay appears.
    chrome.runtime.sendMessage({ type: "WLN_SCREENSHOT" });
    window.close();
  });
  $("#search").addEventListener("input", (e) => { filter = e.target.value; render(); });

  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove("show"); setTimeout(() => (el.hidden = true), 200); }, 2400);
  }

  // Quick "Copy for AI" — this SITE's new & changed tasks (domain-versioned).
  $("#copyAi").addEventListener("click", async () => {
    const domainNotes = notes.concat(siteNotes);
    if (!domainNotes.length) return toast("No notes on this site");
    const origin = WLN.originOf(pageUrl);
    const info = await WLN.exportInfo(origin, domainNotes);
    if (!info.changed.length) return toast(`Nothing new since v${info.sinceVersion || 0}`);
    const ctx = (await WLN.getSettings()).exportContext || "";
    const md = WLNExport.toMarkdownVersioned(
      [{ host: hostOf(pageUrl) || origin, url: pageUrl, version: info.version, sinceVersion: info.sinceVersion, mode: "delta", notes: info.changed }],
      { title: "Compy — task list", context: ctx, at: Date.now(), mode: "delta" }
    );
    try { await navigator.clipboard.writeText(md); }
    catch { return toast("Clipboard blocked — open the dashboard to export"); }
    await WLN.commitExport(origin, { version: info.version, mode: "delta", snapshot: info.snapshot, text: md, count: info.changed.length });
    toast(`Copied v${info.version} · ${info.changed.length} new since v${info.sinceVersion || 0}`);
  });

  load();
})();
