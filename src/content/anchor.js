/* Compy — text anchoring engine (global `WLNAnchor`).
   Robust re-anchoring across reloads / dynamic DOM using a TextQuote model:
   { quote, prefix, suffix, textPos }. */
(function (global) {
  "use strict";

  const CTX = 64; // chars of context captured on each side

  function isSkippable(node) {
    const p = node.parentElement;
    if (!p) return true;
    if (p.closest("[data-wln-ui]")) return true; // our own overlay/toolbar
    const tag = p.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return true;
    return false;
  }

  // Build a flat text index of the document body's text nodes.
  function buildIndex(root) {
    root = root || document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.length) return NodeFilter.FILTER_REJECT;
        if (isSkippable(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let text = "";
    let n;
    while ((n = walker.nextNode())) {
      nodes.push({ node: n, start: text.length });
      text += n.nodeValue;
    }
    return { text, nodes };
  }

  // Map a global char offset -> { node, offset } using binary search.
  function locate(index, globalOffset) {
    const { nodes } = index;
    let lo = 0, hi = nodes.length - 1, res = nodes.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (nodes[mid].start <= globalOffset) { res = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    const entry = nodes[res];
    return { node: entry.node, offset: Math.min(globalOffset - entry.start, entry.node.nodeValue.length) };
  }

  // Resolve a range boundary to a global offset within the index.
  function boundaryOffset(index, container, offset) {
    if (container.nodeType === Node.TEXT_NODE) {
      const e = index.nodes.find((x) => x.node === container);
      if (e) return e.start + offset;
      // Text node not indexed (skipped) — fall back to element mapping.
      container = container.parentElement;
      offset = 0;
    }
    // Element container: offset is a child index. Find first indexed text at/after it.
    const child = container.childNodes[offset];
    if (child) {
      const e = index.nodes.find((x) => x.node === child || (x.node.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_PRECEDING) === 0 && x.node.parentElement && child.contains && child.contains(x.node));
      if (e) return e.start;
      // find first indexed node that is after `child` in document order
      for (const nx of index.nodes) {
        if (child.compareDocumentPosition(nx.node) & Node.DOCUMENT_POSITION_FOLLOWING) return nx.start;
        if (nx.node === child) return nx.start;
      }
    }
    return index.text.length;
  }

  function describeRange(range) {
    const index = buildIndex(document.body);
    let start = boundaryOffset(index, range.startContainer, range.startOffset);
    let end = boundaryOffset(index, range.endContainer, range.endOffset);
    if (end < start) [start, end] = [end, start];
    const quote = index.text.slice(start, end);
    const prefix = index.text.slice(Math.max(0, start - CTX), start);
    const suffix = index.text.slice(end, end + CTX);
    return { quote, prefix, suffix, textPos: start };
  }

  // Score a candidate occurrence by how well surrounding context matches.
  function scoreAt(text, at, desc) {
    let score = 0;
    const before = text.slice(Math.max(0, at - desc.prefix.length), at);
    const after = text.slice(at + desc.quote.length, at + desc.quote.length + desc.suffix.length);
    // Suffix-common-length from start, prefix-common-length from end.
    let i = 0;
    while (i < after.length && i < desc.suffix.length && after[i] === desc.suffix[i]) i++;
    score += i;
    let j = 0;
    while (j < before.length && j < desc.prefix.length &&
           before[before.length - 1 - j] === desc.prefix[desc.prefix.length - 1 - j]) j++;
    score += j;
    return score;
  }

  // Find the best matching Range in the current DOM, or null if orphaned.
  function findRange(desc) {
    if (!desc || !desc.quote) return null;
    const index = buildIndex(document.body);
    const text = index.text;
    const q = desc.quote;
    if (!q) return null;

    // Collect all occurrences of the exact quote.
    const hits = [];
    let from = 0, at;
    while ((at = text.indexOf(q, from)) !== -1) {
      hits.push(at);
      from = at + 1;
      if (hits.length > 500) break;
    }
    if (!hits.length) return null;

    let best = hits[0], bestScore = -1;
    for (const h of hits) {
      let s = scoreAt(text, h, desc);
      // Tiebreak: proximity to original textPos.
      const prox = 1 / (1 + Math.abs(h - (desc.textPos || 0)) / 500);
      s = s + prox;
      if (s > bestScore) { bestScore = s; best = h; }
    }

    const startLoc = locate(index, best);
    const endLoc = locate(index, best + q.length);
    try {
      const range = document.createRange();
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);
      return range;
    } catch {
      return null;
    }
  }

  global.WLNAnchor = { describeRange, findRange, buildIndex };
})(typeof window !== "undefined" ? window : globalThis);
