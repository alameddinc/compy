/* Compy — DOM highlight painter (global `WLNHighlight`).
   Wraps a Range across text-node boundaries in <mark class="wln-hl">. */
(function (global) {
  "use strict";

  function textNodesInRange(range) {
    const root = range.commonAncestorContainer;
    const rootEl = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.length) return NodeFilter.FILTER_REJECT;
        if (n.parentElement && n.parentElement.closest("[data-wln-ui]")) return NodeFilter.FILTER_REJECT;
        return range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const out = [];
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function paint(range, note) {
    if (!range || range.collapsed) return false;
    const color = (WLN.COLORS[note.color] || WLN.COLORS[WLN.DEFAULT_COLOR]);
    const nodes = textNodesInRange(range);
    if (!nodes.length) return false;
    let painted = 0;

    for (const node of nodes) {
      let s = 0, e = node.nodeValue.length;
      if (node === range.startContainer) s = range.startOffset;
      if (node === range.endContainer) e = range.endOffset;
      if (s >= e) continue;

      const sub = document.createRange();
      sub.setStart(node, s);
      sub.setEnd(node, e);

      const mark = document.createElement("mark");
      mark.className = "wln-hl";
      mark.dataset.wlnId = note.id;
      mark.style.backgroundColor = color.hl;
      mark.style.color = color.ink;
      if (note.note && note.note.trim()) mark.classList.add("wln-has-note");
      try {
        sub.surroundContents(mark);
        painted++;
      } catch {
        // Range spans element boundary inside this node's slice — skip safely.
      }
    }
    return painted > 0;
  }

  function isPainted(id) {
    return !!document.querySelector(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`);
  }

  function remove(id) {
    const marks = document.querySelectorAll(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`);
    marks.forEach((m) => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
    return marks.length > 0;
  }

  function recolor(id, colorKey) {
    const color = WLN.COLORS[colorKey] || WLN.COLORS[WLN.DEFAULT_COLOR];
    document.querySelectorAll(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`).forEach((m) => {
      m.style.backgroundColor = color.hl;
      m.style.color = color.ink;
    });
  }

  function setHasNote(id, has) {
    document.querySelectorAll(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`).forEach((m) => {
      m.classList.toggle("wln-has-note", !!has);
    });
  }

  function flash(id) {
    const marks = document.querySelectorAll(`mark.wln-hl[data-wln-id="${CSS.escape(id)}"]`);
    if (!marks.length) return false;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach((m) => {
      m.classList.remove("wln-flash");
      void m.offsetWidth;
      m.classList.add("wln-flash");
    });
    return true;
  }

  global.WLNHighlight = { paint, remove, recolor, setHasNote, isPainted, flash };
})(typeof window !== "undefined" ? window : globalThis);
