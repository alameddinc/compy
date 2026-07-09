/* Compy — screenshot annotator (classic script, exposes global `WLNAnnotate`).
   Given a captured PNG data URL, opens a fullscreen overlay where the user can
   draw boxes / arrows / text on the shot and download (or copy) the result.
   Draws on a canvas at the image's NATURAL resolution so the exported PNG is
   crisp on retina displays; pointer coords are mapped display -> natural. */
(function (global) {
  "use strict";

  const PALETTE = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#6d28d9", "#111827", "#ffffff"];
  const Z = 2147483600;

  let host = null; // active overlay root (only one at a time)

  function el(tag, attrs, style) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (style) Object.assign(n.style, style);
    return n;
  }

  function icon(path, w) {
    return `<svg viewBox="0 0 24 24" width="${w || 16}" height="${w || 16}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function stamp() {
    const d = new Date();
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function open(dataUrl) {
    if (host) close();
    const img = new Image();
    img.onload = () => build(img);
    img.onerror = () => { img.src && console.warn("Compy: screenshot failed to load"); };
    img.src = dataUrl;
  }

  function close() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (!host) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  }

  // ---- state (module-scoped, single overlay) ----
  let ctx, canvas, image, shapes, tool, color, lineW, dragging, start, hint, textInput;

  function build(img) {
    image = img;
    shapes = [];
    tool = "box";
    color = PALETTE[0];
    dragging = false;
    start = null;

    host = el("div", { "data-wln-ui": "", role: "dialog", "aria-label": "Annotate screenshot" }, {
      position: "fixed", inset: "0", zIndex: String(Z),
      background: "rgba(12,10,20,.82)", backdropFilter: "blur(2px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      font: "13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
    });

    host.appendChild(buildToolbar());

    const stage = el("div", null, {
      flex: "1", width: "100%", display: "grid", placeItems: "center",
      overflow: "hidden", padding: "12px 16px 20px", minHeight: "0"
    });

    canvas = el("canvas", null, {
      maxWidth: "100%", maxHeight: "100%", cursor: "crosshair",
      borderRadius: "10px", boxShadow: "0 24px 70px rgba(0,0,0,.5)",
      background: "#fff", touchAction: "none"
    });
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx = canvas.getContext("2d");
    lineW = Math.max(3, Math.round(img.naturalWidth / 480));

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    stage.appendChild(canvas);
    host.appendChild(stage);
    (document.body || document.documentElement).appendChild(host);
    document.addEventListener("keydown", onKey, true);
    redraw();
  }

  function buildToolbar() {
    const bar = el("div", { "data-wln-ui": "" }, {
      display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
      justifyContent: "center", margin: "14px 0 2px", padding: "8px 10px",
      background: "#fff", color: "#16181d", borderRadius: "14px",
      boxShadow: "0 12px 34px rgba(0,0,0,.4)"
    });

    const tools = [
      ["box", "Box", icon('<rect x="4" y="5" width="16" height="14" rx="2"/>')],
      ["arrow", "Arrow", icon('<path d="M5 19 19 5"/><path d="M11 5h8v8"/>')],
      ["text", "Text", icon('<path d="M5 6h14M12 6v13M9 19h6"/>')]
    ];
    const toolBtns = {};
    for (const [key, label, svg] of tools) {
      const b = mkBtn(svg + `<span style="margin-left:5px">${label}</span>`, () => setTool(key, toolBtns));
      Object.assign(b.style, { padding: "7px 11px" });
      toolBtns[key] = b;
      bar.appendChild(b);
    }
    setTool("box", toolBtns);

    bar.appendChild(sep());

    for (const c of PALETTE) {
      const sw = el("button", { "aria-label": "color", title: c }, {
        width: "22px", height: "22px", borderRadius: "50%", cursor: "pointer",
        background: c, border: c === "#ffffff" ? "1px solid #d1d5db" : "1px solid rgba(0,0,0,.12)",
        outline: "2px solid transparent", padding: "0"
      });
      sw.addEventListener("click", () => {
        color = c;
        [...bar.querySelectorAll("[data-sw]")].forEach((x) => (x.style.outlineColor = "transparent"));
        sw.style.outlineColor = "#6d28d9";
      });
      sw.setAttribute("data-sw", "");
      if (c === color) sw.style.outlineColor = "#6d28d9";
      bar.appendChild(sw);
    }

    bar.appendChild(sep());
    bar.appendChild(mkBtn(icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>') + '<span style="margin-left:5px">Undo</span>', undo));
    const dl = mkBtn(icon('<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/>') + '<span style="margin-left:5px">Download</span>', download);
    Object.assign(dl.style, { background: "#6d28d9", color: "#fff", border: "1px solid #6d28d9" });
    bar.appendChild(dl);
    bar.appendChild(mkBtn(icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>') + '<span style="margin-left:5px">Copy</span>', copy));
    bar.appendChild(sep());
    bar.appendChild(mkBtn(icon('<path d="M6 6l12 12M18 6 6 18"/>'), close));

    hint = el("span", null, { marginLeft: "4px", color: "#9aa0ab", fontSize: "12px", fontWeight: "600" });
    bar.appendChild(hint);
    return bar;
  }

  function mkBtn(html, onClick) {
    const b = el("button", { type: "button" }, {
      display: "inline-flex", alignItems: "center", cursor: "pointer",
      padding: "7px 10px", border: "1px solid #e5e7eb", borderRadius: "9px",
      background: "#fff", color: "#16181d", font: "600 13px/1 inherit", whiteSpace: "nowrap"
    });
    b.innerHTML = html;
    b.addEventListener("click", onClick);
    return b;
  }

  function sep() {
    return el("span", null, { width: "1px", height: "22px", background: "#e5e7eb", margin: "0 2px" });
  }

  function setTool(t, btns) {
    tool = t;
    for (const k in btns) {
      const on = k === t;
      btns[k].style.background = on ? "#f3eefe" : "#fff";
      btns[k].style.borderColor = on ? "#c4b5fd" : "#e5e7eb";
      btns[k].style.color = on ? "#6d28d9" : "#16181d";
    }
    if (hint) hint.textContent = t === "text" ? "Click to place text" : "Drag to draw";
    if (canvas) canvas.style.cursor = t === "text" ? "text" : "crosshair";
  }

  // pointer (client) -> canvas natural coords
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
  }

  function onDown(e) {
    if (textInput) return; // finish current text first
    e.preventDefault();
    const p = toCanvas(e);
    if (tool === "text") return placeText(p, e);
    dragging = true;
    start = p;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!dragging) return;
    const p = toCanvas(e);
    redraw({ tool, color, x1: start.x, y1: start.y, x2: p.x, y2: p.y });
  }

  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    const p = toCanvas(e);
    const dx = Math.abs(p.x - start.x), dy = Math.abs(p.y - start.y);
    if (dx > 4 || dy > 4) shapes.push({ tool, color, x1: start.x, y1: start.y, x2: p.x, y2: p.y });
    start = null;
    redraw();
  }

  function placeText(p, e) {
    const r = canvas.getBoundingClientRect();
    const fontPx = Math.round(lineW * 7);
    textInput = el("input", { type: "text", placeholder: "Type…" }, {
      position: "fixed", left: e.clientX + "px", top: (e.clientY - fontPx * 0.5 * (r.height / canvas.height)) + "px",
      zIndex: String(Z + 1), font: `700 ${Math.max(14, fontPx * (r.height / canvas.height))}px -apple-system,sans-serif`,
      color, background: "rgba(255,255,255,.9)", border: "1px dashed #6d28d9",
      borderRadius: "4px", padding: "2px 6px", minWidth: "120px", outline: "none"
    });
    const commit = () => {
      if (!textInput) return; // guard re-entrancy: removeChild below fires blur -> commit again
      const node = textInput;
      textInput = null;
      const v = node.value.trim();
      if (v) shapes.push({ tool: "text", color, x1: p.x, y1: p.y, text: v, font: fontPx });
      if (node.parentNode) node.parentNode.removeChild(node);
      redraw();
    };
    textInput.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") commit();
      else if (ev.key === "Escape") { textInput.value = ""; commit(); }
    });
    textInput.addEventListener("blur", commit);
    host.appendChild(textInput);
    textInput.focus();
  }

  function undo() {
    shapes.pop();
    redraw();
  }

  function drawShape(s) {
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = lineW;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    if (s.tool === "box") {
      ctx.strokeRect(Math.min(s.x1, s.x2), Math.min(s.y1, s.y2), Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1));
    } else if (s.tool === "arrow") {
      const head = lineW * 5;
      const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x2, s.y2);
      ctx.lineTo(s.x2 - head * Math.cos(ang - Math.PI / 6), s.y2 - head * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(s.x2 - head * Math.cos(ang + Math.PI / 6), s.y2 - head * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    } else if (s.tool === "text") {
      const fp = s.font || Math.round(lineW * 7);
      ctx.font = `700 ${fp}px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`;
      ctx.textBaseline = "middle";
      // subtle outline for legibility on any background
      ctx.lineWidth = Math.max(2, fp / 8);
      ctx.strokeStyle = s.color === "#ffffff" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.85)";
      ctx.strokeText(s.text, s.x1, s.y1);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x1, s.y1);
    }
  }

  function redraw(preview) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(s);
    if (preview) drawShape(preview);
  }

  function toBlob() {
    return new Promise((res) => canvas.toBlob(res, "image/png"));
  }

  async function download() {
    const blob = await toBlob();
    const a = el("a", { download: `compy-${stamp()}.png` });
    a.href = URL.createObjectURL(blob);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    flash("Downloaded ✓");
  }

  async function copy() {
    try {
      const blob = await toBlob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Copied ✓");
    } catch (e) {
      flash("Copy blocked — use Download");
    }
  }

  function flash(text) {
    if (!hint) return;
    const prev = hint.textContent;
    hint.textContent = text;
    hint.style.color = "#16a34a";
    setTimeout(() => { if (hint) { hint.textContent = prev; hint.style.color = "#9aa0ab"; } }, 1600);
  }

  global.WLNAnnotate = { open, close };
})(typeof window !== "undefined" ? window : globalThis);
