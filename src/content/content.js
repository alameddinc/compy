/* Compy — content orchestrator: restore highlights, selection toolbar,
   inline note editor, orphan tracking, SPA-aware re-anchoring, messaging. */
(function () {
  "use strict";

  if (window.__wlnLoaded) return;
  window.__wlnLoaded = true;

  const state = {
    url: location.href,
    notes: [],                 // notes for current urlKey
    status: new Map(),         // id -> 'painted' | 'orphaned'
    suppress: false            // ignore self-inflicted mutations
  };

  const pageTitle = () => document.title || location.href;

  /* ---------- restore / orphan tracking ---------- */

  function withSuppression(fn) {
    state.suppress = true;
    try { fn(); } finally {
      setTimeout(() => { state.suppress = false; }, 0);
    }
  }

  function restoreAll() {
    withSuppression(() => {
      for (const note of state.notes) {
        if (!note.quote || note.type === "page") continue; // page notes aren't painted
        if (note.archivedAt) { WLNHighlight.remove(note.id); continue; } // done → unpaint (already suppressed)
        if (WLNHighlight.isPainted(note.id)) { state.status.set(note.id, "painted"); continue; }
        const range = WLNAnchor.findRange({
          quote: note.quote, prefix: note.prefix, suffix: note.suffix, textPos: note.textPos
        });
        if (range && WLNHighlight.paint(range, note)) {
          state.status.set(note.id, "painted");
          const m = document.querySelector(`mark.wln-hl[data-wln-id="${CSS.escape(note.id)}"]`);
          if (m && note.note) m.title = note.note;
        } else {
          state.status.set(note.id, "orphaned");
        }
      }
    });
    updateBadge();
  }

  async function loadForCurrentUrl() {
    state.url = location.href;
    state.notes = await WLN.getForUrl(state.url);
    state.status.clear();
    restoreAll();
  }

  function orphanCount() {
    let n = 0;
    state.status.forEach((v) => v === "orphaned" && n++);
    return n;
  }

  // True while this content script's extension context is still valid. After
  // the extension is reloaded/updated, stale scripts left in open tabs lose
  // `chrome.runtime` — touching it throws "Extension context invalidated".
  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch { return false; }
  }

  let dead = false;
  function cleanup() {
    if (dead) return;
    dead = true;
    try { observer.disconnect(); } catch {}
    document.removeEventListener("mouseup", onDocMouseUp, true);
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("scroll", onDocScroll, true);
    window.removeEventListener("resize", hideToolbar);
    clearTimeout(moTimer); clearTimeout(saveTimer);
    hideToolbar(); closeEditor();
  }

  function updateBadge() {
    if (!alive()) return cleanup();
    try {
      chrome.runtime.sendMessage({
        type: "WLN_BADGE",
        total: state.notes.filter((n) => !n.archivedAt).length,
        orphans: orphanCount()
      }).catch(() => {});
    } catch (e) {
      cleanup(); // context invalidated mid-call — go quiet
    }
  }

  /* ---------- selection toolbar ---------- */

  let toolbar, editor;

  function buildToolbar() {
    toolbar = document.createElement("div");
    toolbar.setAttribute("data-wln-ui", "");
    toolbar.className = "wln-toolbar";
    toolbar.style.display = "none";
    const colors = Object.keys(WLN.COLORS).map((key) => {
      const c = WLN.COLORS[key];
      return `<button class="wln-swatch" data-color="${key}" title="${c.label}" style="--sw:${c.dot}"></button>`;
    }).join("");
    toolbar.innerHTML = `
      <div class="wln-swatches">${colors}</div>
      <span class="wln-sep"></span>
      <button class="wln-tb-btn" data-act="note" title="Highlight + add note">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        Note
      </button>`;
    document.body.appendChild(toolbar);

    toolbar.addEventListener("mousedown", (e) => e.preventDefault()); // keep selection
    toolbar.addEventListener("click", (e) => {
      const sw = e.target.closest(".wln-swatch");
      const nb = e.target.closest('[data-act="note"]');
      if (sw) createFromSelection(sw.dataset.color, false);
      else if (nb) createFromSelection(WLN.DEFAULT_COLOR, true);
    });
  }

  function showToolbar(rect) {
    const pad = 8;
    toolbar.style.display = "flex";
    const tw = toolbar.offsetWidth, th = toolbar.offsetHeight;
    let top = window.scrollY + rect.top - th - pad;
    if (top < window.scrollY + 4) top = window.scrollY + rect.bottom + pad; // flip below
    let left = window.scrollX + rect.left + rect.width / 2 - tw / 2;
    left = Math.max(window.scrollX + 6, Math.min(left, window.scrollX + document.documentElement.clientWidth - tw - 6));
    toolbar.style.top = `${top}px`;
    toolbar.style.left = `${left}px`;
  }

  function hideToolbar() {
    if (toolbar) toolbar.style.display = "none";
  }

  function currentSelectionRange() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    if (!range.toString().trim()) return null;
    if (range.startContainer.parentElement && range.startContainer.parentElement.closest("[data-wln-ui]")) return null;
    return range;
  }

  function onSelectionSettled() {
    const range = currentSelectionRange();
    if (!range) { hideToolbar(); return; }
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height) showToolbar(rect);
  }

  /* ---------- create / edit notes ---------- */

  // Short CSS-ish path to the highlighted element (helps identify UI bits).
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return "";
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 4; depth++) {
      let sel = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(sel + "#" + node.id); break; }
      const cls = [...node.classList].filter((c) => !c.startsWith("wln-")).slice(0, 2);
      if (cls.length) sel += "." + cls.join(".");
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  // Nearest heading above the selection — the section it belongs to.
  function nearestSection(el) {
    if (!el) return "";
    const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
    let best = "";
    for (const h of heads) {
      if (h.closest("[data-wln-ui]")) continue;
      if (h.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = h.textContent.trim();
      else break;
    }
    return best.replace(/\s+/g, " ").slice(0, 90);
  }

  async function createFromSelection(color, openEditor) {
    if (!alive()) return cleanup();
    const range = currentSelectionRange();
    if (!range) return;
    const clone = range.cloneRange();
    const desc = WLNAnchor.describeRange(clone);
    if (!desc.quote || !desc.quote.trim()) return;

    const startEl = clone.startContainer.nodeType === 1 ? clone.startContainer : clone.startContainer.parentElement;

    const note = await WLN.add({
      url: location.href,
      title: pageTitle(),
      quote: desc.quote,
      prefix: desc.prefix,
      suffix: desc.suffix,
      textPos: desc.textPos,
      selector: cssPath(startEl),
      section: nearestSection(startEl),
      color
    });
    state.notes.push(note);

    withSuppression(() => WLNHighlight.paint(clone, note));
    state.status.set(note.id, "painted");
    window.getSelection().removeAllRanges();
    hideToolbar();
    updateBadge();
    if (openEditor) openEditorFor(note.id);
  }

  function noteById(id) { return state.notes.find((n) => n.id === id); }

  function buildEditor() {
    editor = document.createElement("div");
    editor.setAttribute("data-wln-ui", "");
    editor.className = "wln-editor";
    editor.style.display = "none";
    editor.innerHTML = `
      <div class="wln-ed-quote"></div>
      <textarea class="wln-ed-text" placeholder="Add a note…" rows="3"></textarea>
      <div class="wln-ed-row">
        <div class="wln-ed-colors"></div>
        <div class="wln-ed-actions">
          <button class="wln-ed-del" title="Delete highlight">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
          <button class="wln-ed-done">Done</button>
        </div>
      </div>`;
    document.body.appendChild(editor);
    editor.addEventListener("mousedown", (e) => e.stopPropagation());

    const colors = editor.querySelector(".wln-ed-colors");
    colors.innerHTML = Object.keys(WLN.COLORS).map((key) => {
      const c = WLN.COLORS[key];
      return `<button class="wln-swatch" data-color="${key}" title="${c.label}" style="--sw:${c.dot}"></button>`;
    }).join("");
  }

  let editingId = null;
  let saveTimer = null;

  function openEditorFor(id) {
    const note = noteById(id);
    if (!note) return;
    editingId = id;
    const isPage = note.type === "page" || !note.quote;
    const ta = editor.querySelector(".wln-ed-text");
    const q = editor.querySelector(".wln-ed-quote");
    const colorsRow = editor.querySelector(".wln-ed-colors");
    if (isPage) {
      q.textContent = "📄 Page note — not tied to any text";
      q.classList.add("wln-ed-pagelabel");
      colorsRow.style.display = "none";
    } else {
      q.textContent = note.quote;
      q.classList.remove("wln-ed-pagelabel");
      colorsRow.style.display = "";
    }
    ta.value = note.note || "";
    autoGrow(ta);

    editor.querySelectorAll(".wln-ed-colors .wln-swatch").forEach((b) =>
      b.classList.toggle("wln-active", b.dataset.color === note.color));

    editor.style.display = "block";
    const mark = document.querySelector(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`);
    if (mark) {
      positionEditor(mark.getBoundingClientRect());
    } else {
      // page note: center near the top of the viewport
      const ew = editor.offsetWidth;
      editor.style.top = `${window.scrollY + Math.min(120, window.innerHeight * 0.2)}px`;
      editor.style.left = `${window.scrollX + Math.max(6, (document.documentElement.clientWidth - ew) / 2)}px`;
    }
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  async function createPageNote() {
    if (!alive()) return cleanup();
    const note = await WLN.addPageNote(location.href, pageTitle(), "");
    state.notes.push(note);
    updateBadge();
    hideToolbar();
    openEditorFor(note.id);
  }

  function positionEditor(rect) {
    editor.style.display = "block";
    const ew = editor.offsetWidth, eh = editor.offsetHeight;
    let top = window.scrollY + rect.bottom + 8;
    if (rect.bottom + eh + 12 > window.innerHeight) top = window.scrollY + rect.top - eh - 8;
    let left = window.scrollX + rect.left;
    left = Math.max(window.scrollX + 6, Math.min(left, window.scrollX + document.documentElement.clientWidth - ew - 6));
    editor.style.top = `${Math.max(window.scrollY + 6, top)}px`;
    editor.style.left = `${left}px`;
  }

  function closeEditor() {
    if (editor) editor.style.display = "none";
    editingId = null;
  }

  // Grow the textarea to fit its content so it never scrolls internally
  // (an internal scroll used to fire scroll events that dismissed the editor).
  function autoGrow(ta) {
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 260) + "px";
  }

  function wireEditor() {
    const ta = editor.querySelector(".wln-ed-text");
    ta.addEventListener("input", () => {
      if (!editingId) return;
      autoGrow(ta);
      clearTimeout(saveTimer);
      const id = editingId, val = ta.value;
      saveTimer = setTimeout(async () => {
        if (!alive()) return cleanup();
        await WLN.setPrimaryComment(id, val);
        const n = noteById(id); if (n) n.note = val;
        WLNHighlight.setHasNote(id, !!val.trim());
        const m = document.querySelector(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`);
        if (m) m.title = val;
      }, 250);
    });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeEditor(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { closeEditor(); }
    });
    editor.querySelector(".wln-ed-done").addEventListener("click", closeEditor);
    editor.querySelector(".wln-ed-del").addEventListener("click", async () => {
      if (!editingId) return;
      await deleteNote(editingId);
      closeEditor();
    });
    editor.querySelector(".wln-ed-colors").addEventListener("click", async (e) => {
      const sw = e.target.closest(".wln-swatch");
      if (!sw || !editingId) return;
      const color = sw.dataset.color;
      await WLN.update(editingId, { color });
      const n = noteById(editingId); if (n) n.color = color;
      WLNHighlight.recolor(editingId, color);
      editor.querySelectorAll(".wln-ed-colors .wln-swatch").forEach((b) =>
        b.classList.toggle("wln-active", b.dataset.color === color));
    });
  }

  async function deleteNote(id) {
    await WLN.remove(id);
    withSuppression(() => WLNHighlight.remove(id));
    state.notes = state.notes.filter((n) => n.id !== id);
    state.status.delete(id);
    updateBadge();
  }

  /* ---------- global listeners ---------- */

  function onDocMouseUp(e) {
    if (e.target.closest && e.target.closest("[data-wln-ui]")) return;
    setTimeout(onSelectionSettled, 10);
  }

  // Keep the editor glued to its highlight while the page scrolls — never
  // close it (closing mid-typing was caused by focus/textarea scroll events).
  let scrollRaf = null;
  function onDocScroll(e) {
    if (!editingId) { hideToolbar(); return; }
    // Ignore scrolls originating inside our own UI (e.g. the textarea).
    if (e.target && e.target.nodeType === 1 && e.target.closest && e.target.closest("[data-wln-ui]")) return;
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (!editingId) return;
      const mark = document.querySelector(`mark.wln-hl[data-wln-id="${CSS.escape(editingId)}"]`);
      if (mark) positionEditor(mark.getBoundingClientRect());
    });
  }

  function onDocClick(e) {
    const mark = e.target.closest && e.target.closest("mark.wln-hl");
    if (mark) {
      e.preventDefault();
      e.stopPropagation();
      openEditorFor(mark.dataset.wlnId);
      return;
    }
    if (!e.target.closest("[data-wln-ui]")) { hideToolbar(); closeEditor(); }
  }

  /* ---------- mutation / SPA handling ---------- */

  let moTimer = null;
  const observer = new MutationObserver(() => {
    if (dead || state.suppress) return;
    clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      // Detect removed highlights (dynamic pages) -> orphan; retry unpainted.
      for (const note of state.notes) {
        if (state.status.get(note.id) === "painted" && !WLNHighlight.isPainted(note.id)) {
          state.status.set(note.id, "orphaned");
        }
      }
      restoreAll();
    }, 400);
  });

  function watchSpaNavigation() {
    const fire = () => {
      if (WLN.urlKey(location.href) === WLN.urlKey(state.url)) return;
      withSuppression(() => state.notes.forEach((n) => WLNHighlight.remove(n.id)));
      loadForCurrentUrl();
    };
    for (const m of ["pushState", "replaceState"]) {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); fire(); return r; };
    }
    window.addEventListener("popstate", fire);
  }

  /* ---------- messaging (popup / background) ---------- */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg.type) {
      case "WLN_GET_STATE": {
        sendResponse({
          url: location.href,
          title: pageTitle(),
          notes: state.notes.map((n) => ({ ...n, orphaned: state.status.get(n.id) === "orphaned" }))
        });
        return true;
      }
      case "WLN_SCROLL_TO": {
        const ok = WLNHighlight.flash(msg.id);
        sendResponse({ ok });
        return true;
      }
      case "WLN_DELETE": {
        deleteNote(msg.id).then(() => sendResponse({ ok: true }));
        return true;
      }
      case "WLN_OPEN_EDITOR": {
        openEditorFor(msg.id);
        sendResponse({ ok: true });
        return true;
      }
      case "WLN_HIGHLIGHT": {
        createFromSelection(msg.color || WLN.DEFAULT_COLOR, !!msg.withNote)
          .then(() => sendResponse({ ok: true }));
        return true;
      }
      case "WLN_ADD_PAGE_NOTE": {
        createPageNote().then(() => sendResponse({ ok: true }));
        return true;
      }
      case "WLN_REFRESH": {
        loadForCurrentUrl().then(() => sendResponse({ ok: true }));
        return true;
      }
      case "WLN_PRE_CAPTURE": {
        // Hide our own floating UI so it isn't captured, then reply once the
        // browser has painted the cleared frame (double rAF).
        hideToolbar();
        closeEditor();
        if (window.WLNAnnotate) WLNAnnotate.close();
        requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
        return true;
      }
      case "WLN_ANNOTATE": {
        if (window.WLNAnnotate) WLNAnnotate.open(msg.dataUrl);
        sendResponse({ ok: true });
        return true;
      }
    }
  });

  // React to storage edits from popup/dashboard (delete/update elsewhere).
  WLN.onChanged(async () => {
    // Don't react to storage echoes while the user is actively editing a note
    // (our own autosave writes fire onChanged; reacting would repaint under the
    // open editor and can dismiss it).
    if (editingId) return;
    const fresh = await WLN.getForUrl(location.href);
    const freshIds = new Set(fresh.map((n) => n.id));
    for (const old of state.notes) {
      if (!freshIds.has(old.id)) withSuppression(() => WLNHighlight.remove(old.id));
    }
    state.notes = fresh;
    restoreAll();
  });

  /* ---------- init ---------- */

  function init() {
    buildToolbar();
    buildEditor();
    wireEditor();
    document.addEventListener("mouseup", onDocMouseUp, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("scroll", onDocScroll, true);
    window.addEventListener("resize", hideToolbar);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    watchSpaNavigation();
    loadForCurrentUrl();
  }

  // Load merged colors (custom + renamed labels) before building UI.
  WLN.loadColors().finally(() => {
    if (document.body) init();
    else document.addEventListener("DOMContentLoaded", init);
  });
})();
