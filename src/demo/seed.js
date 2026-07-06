/* Compy — demo data seeder (dev / store-screenshot tool, not shipped UI).
   Populates chrome.storage.local with realistic notes:
   - Highlights + page notes on the bundled demo page (they re-anchor & paint).
   - Extra cross-site notes so the dashboard looks full and multi-site. */
(function () {
  "use strict";

  const DEMO_URL = chrome.runtime.getURL("demo/demo.html");
  const DEMO_TITLE = "Notes that travel with the web — Fieldbook";
  const H = 3600e3, D = 86400e3, M = 60e3;
  const now = Date.now();

  // Build a normalized record. Highlights carry a quote that exists verbatim
  // on the demo page, so findRange() re-anchors with an empty context.
  function rec({ url, title, quote, color, texts, section, selector, ago }) {
    const at = now - (ago || 0);
    const comments = (texts || []).map((t, i) => ({ id: WLN.uid(), text: t, at: at + i * 1000 }));
    return {
      id: WLN.uid(),
      type: quote ? "highlight" : "page",
      url, urlKey: WLN.urlKey(url), origin: WLN.originOf(url),
      title,
      quote: quote || "",
      prefix: "", suffix: "", textPos: 0,
      selector: selector || "", section: section || "",
      color: color || "yellow",
      comments,
      note: comments[0] ? comments[0].text : "",
      tags: [],
      createdAt: at, updatedAt: at
    };
  }

  const DATA = [
    /* ---- on the demo page (these paint when you open it) ---- */
    rec({ url: DEMO_URL, title: DEMO_TITLE, color: "yellow", ago: 2 * H,
      section: "Introduction", selector: "article > p:nth-of-type(2)",
      quote: "Highlight anything on the page and a note travels with it.",
      texts: ["Perfect hero tagline — use this on the landing page."] }),

    rec({ url: DEMO_URL, title: DEMO_TITLE, color: "green", ago: 5 * H,
      section: "Your data stays yours", selector: "article > p:nth-of-type(3)",
      quote: "Notes stay on your device — nothing is uploaded to a server.",
      texts: ["Lead with privacy in the Chrome Web Store description."] }),

    rec({ url: DEMO_URL, title: DEMO_TITLE, color: "blue", ago: 1 * D,
      section: "Your data stays yours", selector: "div.callout > p",
      quote: "Every highlight can hold multiple comments, like a thread.",
      texts: ["Show the comment thread in screenshot #2.", "Maybe animate adding a second note."] }),

    rec({ url: DEMO_URL, title: DEMO_TITLE, color: "purple", ago: 1 * D + 3 * H,
      section: "Built for handing off to an AI", selector: "article > p:nth-of-type(5)",
      quote: "Export your notes as a Markdown task list for your AI",
      texts: ["This is the killer feature — put it above the fold.", "Record a 20-second demo clip."] }),

    rec({ url: DEMO_URL, title: DEMO_TITLE, color: "pink", ago: 3 * D,
      section: "Fast enough to stay out of your way", selector: "article > p:last-of-type",
      quote: "highlight, note, move on" }),

    /* ---- page notes on the demo page (no highlight) ---- */
    rec({ url: DEMO_URL, title: DEMO_TITLE, ago: 30 * M,
      texts: ["Overall this page reads well — ship it."] }),
    rec({ url: DEMO_URL, title: DEMO_TITLE, ago: 18 * M,
      texts: ["TODO: add a pricing section below the fold before launch."] }),

    /* ---- cross-site notes (dashboard richness; won't paint anywhere) ---- */
    rec({ url: "https://github.com/vercel/next.js/issues/58123", color: "green", ago: 6 * H,
      title: "Hydration mismatch on /settings · Issue #58123 · vercel/next.js",
      quote: "Hydration mismatch on the settings route",
      texts: ["Reproduce with dark mode enabled.", "Likely the theme provider on first paint."] }),

    rec({ url: "https://stripe.com/docs/api/idempotent_requests", color: "blue", ago: 1 * D,
      title: "Idempotent requests | Stripe API Reference",
      quote: "Idempotency keys prevent duplicate charges",
      texts: ["Wire this into the checkout retry path."] }),

    rec({ url: "https://tailwindcss.com/docs/functions-and-directives", color: "yellow", ago: 2 * D,
      title: "Functions & Directives - Tailwind CSS",
      quote: "Use @apply sparingly in component classes",
      texts: ["Refactor the button styles to plain utilities."] }),

    rec({ url: "https://linear.app/acme/team/ENG/active", ago: 2 * D + 4 * H,
      title: "Active · ENG · Linear",
      texts: ["Move the billing epic to next cycle."] }),

    rec({ url: "https://www.notion.so/acme/Q3-Launch-Plan-9f2c", color: "purple", ago: 4 * D,
      title: "Q3 Launch Plan",
      quote: "Draft the Q3 launch announcement",
      texts: ["Due Friday — loop in marketing."] })
  ];

  const $ = (s) => document.querySelector(s);

  async function refreshCount() {
    const all = await WLN.getAll();
    $("#count").textContent = all.length;
  }

  async function seed() {
    await WLN.replaceAll(DATA);
    flash(`Loaded ${DATA.length} demo notes.`);
    refreshCount();
  }

  async function clearAll() {
    if (!confirm("Delete ALL Compy notes from this browser? This cannot be undone.")) return;
    await WLN.replaceAll([]);
    flash("Cleared all notes.");
    refreshCount();
  }

  function flash(msg) {
    const el = $("#status");
    el.textContent = msg;
    el.style.opacity = "1";
    setTimeout(() => { el.style.opacity = "0.55"; }, 1800);
  }

  $("#seed").addEventListener("click", seed);
  $("#clear").addEventListener("click", clearAll);
  $("#openDemo").addEventListener("click", () => chrome.tabs.create({ url: DEMO_URL }));
  $("#openDash").addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") }));

  refreshCount();
})();
