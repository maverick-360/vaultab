// Shared helpers used by the popup and dashboard pages.

const AUTO_CLOSED_ID = "auto-closed";

const DEFAULT_SETTINGS = {
  autoCloseEnabled: true,
  autoCloseMinutes: 20,
  minTabsPerWindow: 5,
  autoClosedCap: 200,
  theme: "light",
};

const THEMES = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "ocean", label: "Ocean" },
];

function uid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function now() {
  return Date.now();
}

function faviconUrl(pageUrl, size = 16) {
  const url = new URL(chrome.runtime.getURL("/_favicon/"));
  url.searchParams.set("pageUrl", pageUrl);
  url.searchParams.set("size", String(size));
  return url.toString();
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// "Site name" shown for a saved link: prefer the page title, fall back to hostname.
function siteName(tab) {
  return (tab.title && tab.title.trim()) || hostnameOf(tab.url);
}

function fmtDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeTabEntry(tab) {
  return {
    id: uid(),
    title: (tab.title && tab.title.trim()) || hostnameOf(tab.url || ""),
    url: tab.url || "",
    addedAt: now(),
  };
}

function makeFolder(name) {
  const ts = now();
  return { id: uid(), name, createdAt: ts, updatedAt: ts, tabs: [] };
}

function makeCollection(name) {
  const ts = now();
  return { id: uid(), name, createdAt: ts, updatedAt: ts, folders: [], tabs: [] };
}

async function getCollections() {
  const { collections = [] } = await chrome.storage.local.get("collections");
  return collections;
}

async function setCollections(collections) {
  await chrome.storage.local.set({ collections });
}

async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getStats() {
  const { stats } = await chrome.storage.local.get("stats");
  return stats || { opened: 0, closed: 0, autoClosed: 0, byDay: {} };
}

async function getLockedSites() {
  const { lockedSites = [] } = await chrome.storage.local.get("lockedSites");
  return lockedSites;
}

async function setLockedSites(lockedSites) {
  await chrome.storage.local.set({ lockedSites });
}

// Turns user input (hostname or full URL) into a stored site pattern.
function normalizeSitePattern(input) {
  let p = String(input || "").trim().toLowerCase();
  if (!p) return "";
  if (p.includes("://")) {
    try {
      p = new URL(p).hostname;
    } catch {
      return "";
    }
  }
  return p.replace(/^www\./, "");
}

// A pattern with "/" matches anywhere in the URL; otherwise it matches the
// hostname exactly or any of its subdomains.
function isSiteLocked(url, patterns) {
  if (!patterns || !patterns.length) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const bare = host.replace(/^www\./, "");
  const lower = String(url).toLowerCase();
  return patterns.some((p) =>
    p.includes("/")
      ? lower.includes(p)
      : bare === p || bare.endsWith("." + p) || host === p
  );
}

async function getLockedTabs() {
  const { lockedTabs = {} } = await chrome.storage.session.get("lockedTabs");
  return lockedTabs;
}

async function setLockedTabs(lockedTabs) {
  await chrome.storage.session.set({ lockedTabs });
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function applyTheme() {
  const { theme } = await getSettings();
  document.body.dataset.theme = theme || "light";
}

// Adds a single browser tab to a collection ("__new__" creates one first).
async function addTabToCollection(tab, collectionId, newName) {
  const collections = await getCollections();
  let col;
  if (collectionId === "__new__") {
    col = makeCollection((newName || "").trim() || "New collection");
    collections.push(col);
  } else {
    col = collections.find((c) => c.id === collectionId);
  }
  if (!col) return null;
  col.tabs.push(makeTabEntry(tab));
  col.updatedAt = now();
  await setCollections(collections);
  return col;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
