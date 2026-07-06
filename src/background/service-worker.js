/* Compy — background service worker (module).
   Commands, context menus, per-tab badge. */

const DASHBOARD_URL = chrome.runtime.getURL("dashboard/dashboard.html");
const CONTENT_FILES = ["lib/store.js", "content/anchor.js", "content/highlighter.js", "content/content.js"];

function openDashboard() {
  chrome.tabs.create({ url: DASHBOARD_URL });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function sendToTab(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// Inject the content script on demand (fixes tabs opened before install /
// pages that loaded before the extension was ready). Safe to call repeatedly:
// the content script guards against double-init.
async function ensureInjected(tabId, url) {
  if (!tabId) return false;
  if (url && !/^https?:/.test(url)) return false; // skip chrome://, file://, etc.
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content/content.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- install: context menus + inject into already-open tabs ---- */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "wln-highlight", title: "Highlight selection", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "wln-highlight-note", title: "Highlight + add note", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "wln-page-note", title: "Add a page note (no highlight)", contexts: ["page", "all"] });
    chrome.contextMenus.create({ id: "wln-sep", type: "separator", contexts: ["all"] });
    chrome.contextMenus.create({ id: "wln-dashboard", title: "Open Compy dashboard", contexts: ["all"] });
  });
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
    for (const t of tabs) ensureInjected(t.id, t.url);
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "wln-dashboard") return openDashboard();
  if (!tab || !tab.id) return;
  await ensureInjected(tab.id, tab.url);
  if (info.menuItemId === "wln-highlight") sendToTab(tab.id, { type: "WLN_HIGHLIGHT", withNote: false });
  if (info.menuItemId === "wln-highlight-note") sendToTab(tab.id, { type: "WLN_HIGHLIGHT", withNote: true });
  if (info.menuItemId === "wln-page-note") sendToTab(tab.id, { type: "WLN_ADD_PAGE_NOTE" });
});

/* ---- keyboard commands ---- */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-dashboard") return openDashboard();
  const tab = await activeTab();
  if (!tab || !tab.id) return;
  await ensureInjected(tab.id, tab.url);
  if (command === "highlight-selection") sendToTab(tab.id, { type: "WLN_HIGHLIGHT", withNote: false });
  if (command === "highlight-with-note") sendToTab(tab.id, { type: "WLN_HIGHLIGHT", withNote: true });
  if (command === "add-page-note") sendToTab(tab.id, { type: "WLN_ADD_PAGE_NOTE" });
});

/* ---- per-tab badge (orphans in red, else total count) ---- */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "WLN_BADGE" && sender.tab && sender.tab.id != null) {
    const tabId = sender.tab.id;
    const orphans = msg.orphans || 0;
    const total = msg.total || 0;
    if (orphans > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#ef4444" });
      chrome.action.setBadgeText({ tabId, text: String(orphans) });
    } else if (total > 0) {
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#6d28d9" });
      chrome.action.setBadgeText({ tabId, text: String(total) });
    } else {
      chrome.action.setBadgeText({ tabId, text: "" });
    }
  }
  if (msg.type === "WLN_OPEN_DASHBOARD") openDashboard();
  if (msg.type === "WLN_ENSURE") {
    ensureInjected(msg.tabId, msg.url).then((ok) => sendResponse({ ok }));
    return true; // async response
  }
});
