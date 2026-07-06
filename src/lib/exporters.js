/* Compy — export/import serializers (classic script, exposes `WLNExport`).
   Formats: CSV (round-trip backup) and Markdown (human / AI-agent handoff). */
(function (global) {
  "use strict";

  const CSV_COLUMNS = [
    "id", "type", "url", "title", "color", "quote", "note", "comments",
    "section", "selector", "prefix", "suffix", "tags", "createdAt", "updatedAt"
  ];

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(notes) {
    const lines = [CSV_COLUMNS.join(",")];
    for (const n of notes) {
      lines.push(CSV_COLUMNS.map((c) => {
        if (c === "tags") return csvEscape((n.tags || []).join("|"));
        if (c === "comments") return csvEscape(JSON.stringify(n.comments || []));
        if (c === "type") return csvEscape(n.type || (n.quote ? "highlight" : "page"));
        return csvEscape(n[c]);
      }).join(","));
    }
    return lines.join("\r\n");
  }

  // Minimal RFC-4180 CSV parser (handles quotes, commas, newlines).
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", i = 0, inQ = false;
    text = text.replace(/^﻿/, ""); // strip BOM
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ",") { row.push(field); field = ""; i++; continue; }
      if (c === "\r") { i++; continue; }
      if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
      field += c; i++;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const header = rows[0];
    const idx = {};
    header.forEach((h, k) => (idx[h.trim()] = k));
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      if (cells.length === 1 && cells[0] === "") continue;
      const get = (c) => (idx[c] != null ? cells[idx[c]] : "");
      let comments = [];
      const rawComments = get("comments");
      if (rawComments) { try { comments = JSON.parse(rawComments); } catch { comments = []; } }
      if (!Array.isArray(comments)) comments = [];
      if (!comments.length && get("note")) comments = [{ id: (get("id") || "") + ":c0", text: get("note"), at: Number(get("createdAt")) || Date.now() }];
      const rec = {
        id: get("id") || undefined,
        type: get("type") || (get("quote") ? "highlight" : "page"),
        url: get("url"),
        title: get("title"),
        color: get("color") || "yellow",
        quote: get("quote"),
        note: comments[0] ? comments[0].text : get("note"),
        comments,
        section: get("section"),
        selector: get("selector"),
        prefix: get("prefix"),
        suffix: get("suffix"),
        tags: (get("tags") || "").split("|").filter(Boolean),
        createdAt: Number(get("createdAt")) || Date.now(),
        updatedAt: Number(get("updatedAt")) || Date.now()
      };
      if (!rec.quote && !comments.length) continue;
      out.push(rec);
    }
    return out;
  }

  function pathOf(url) {
    try { const u = new URL(url); return (u.pathname || "/") + (u.search || ""); }
    catch { return url || ""; }
  }

  function commentTexts(n) {
    if (Array.isArray(n.comments) && n.comments.length) return n.comments.map((c) => (c.text || "").trim()).filter(Boolean);
    return (n.note || "").trim() ? [n.note.trim()] : [];
  }

  function fmtDate(ts) {
    try { return new Date(ts).toISOString().slice(0, 16).replace("T", " "); }
    catch { return ""; }
  }

  function groupByPage(notes) {
    const groups = new Map();
    for (const n of notes) {
      const key = n.urlKey || n.url || "(no url)";
      if (!groups.has(key)) groups.set(key, { title: n.title, url: n.url, page: [], highlights: [] });
      const g = groups.get(key);
      (n.type === "page" || !n.quote) ? g.page.push(n) : g.highlights.push(n);
    }
    return groups;
  }

  function pushTask(out, n, colorLabels) {
    const comments = commentTexts(n);
    const label = colorLabels && n.color ? colorLabels[n.color] : "";
    const tagStr = label ? ` #${label.toLowerCase().replace(/\s+/g, "-")}` : "";
    out.push(`- [ ] ${comments[0] || "_(highlight only — no note)_"}${tagStr}`);
    for (let i = 1; i < comments.length; i++) out.push(`  - also: ${comments[i]}`);
    const loc = [];
    if (n.section) loc.push(`section “${n.section}”`);
    if (n.selector) loc.push(`\`${n.selector}\``);
    if (loc.length) out.push(`  - where: ${loc.join(" · ")}`);
    if (n.quote) {
      const q = n.quote.trim().replace(/\s+/g, " ");
      out.push(`  - highlighted: “${q.length > 300 ? q.slice(0, 300) + "…" : q}”`);
    }
  }

  function pushPageGroup(out, g, h, colorLabels) {
    const path = pathOf(g.url);
    const head = g.title ? `${g.title} · ${path}` : g.url;
    out.push(`${h} ${head}`);
    if (g.url) out.push(`<${g.url}>`);
    out.push("");
    const pageComments = g.page.flatMap(commentTexts);
    if (pageComments.length) {
      out.push("**Page notes:**");
      for (const t of pageComments) out.push(`- ${t}`);
      out.push("");
    }
    for (const n of g.highlights) pushTask(out, n, colorLabels);
    out.push("");
  }

  function pushContext(out, ctx) {
    ctx = (ctx || "").trim();
    if (!ctx) return;
    out.push("> **Context for the reader:**");
    for (const line of ctx.split("\n")) out.push(`> ${line}`);
    out.push("");
  }

  // Flat markdown (used for .md file downloads — no version header).
  function toMarkdown(notes, opts = {}) {
    const title = opts.title || "Compy export";
    const groups = groupByPage(notes);
    const out = [`# ${title}`, "", `_${notes.length} note${notes.length === 1 ? "" : "s"} · ${groups.size} page${groups.size === 1 ? "" : "s"} · ${fmtDate(opts.at || Date.now())}._`, ""];
    pushContext(out, opts.context);
    for (const g of groups.values()) pushPageGroup(out, g, "##", opts.colorLabels);
    return out.join("\n");
  }

  // Domain-versioned markdown for AI handoff. `domains` = [{host, url,
  // version, sinceVersion, mode, notes}]. Each domain is its own section with
  // its own version, so pasting into a chat reads as a per-site task list.
  function toMarkdownVersioned(domains, opts = {}) {
    const title = opts.title || "Compy — task list";
    const totalTasks = domains.reduce((s, d) => s + d.notes.length, 0);
    const vsum = domains.map((d) => `${d.host} v${d.version}`).join(" · ");
    const out = [
      `# ${title}`, "",
      `_${totalTasks} task${totalTasks === 1 ? "" : "s"} · ${domains.length} site${domains.length === 1 ? "" : "s"} · ${vsum} · ${fmtDate(opts.at || Date.now())}._`, ""
    ];
    pushContext(out, opts.context);
    for (const d of domains) {
      const vlabel = (d.mode === "delta" && d.sinceVersion)
        ? `v${d.version} · ${d.notes.length} new since v${d.sinceVersion}`
        : `v${d.version} · ${d.notes.length} task${d.notes.length === 1 ? "" : "s"}`;
      out.push(`## ${d.host} — ${vlabel}`, "");
      const groups = groupByPage(d.notes);
      for (const g of groups.values()) pushPageGroup(out, g, "###", opts.colorLabels);
    }
    return out.join("\n");
  }

  global.WLNExport = { CSV_COLUMNS, toCSV, parseCSV, toMarkdown, toMarkdownVersioned };
})(typeof window !== "undefined" ? window : globalThis);
