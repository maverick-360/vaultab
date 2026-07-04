// Service worker: tracks tab activity, auto-closes inactive tabs into the
// "Auto Closed" collection, and records opened/closed stats.

const AUTO_CLOSED_ID = "auto-closed";
const SWEEP_ALARM = "tabkeeper-sweep";

const DEFAULT_SETTINGS = {
  autoCloseEnabled: true,
  autoCloseMinutes: 20,
  minTabsPerWindow: 5,
  autoClosedCap: 200,
};

function uid() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Mirrors isSiteLocked in common.js: "/" patterns match anywhere in the URL,
// bare patterns match the hostname or any subdomain.
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

// ---------------------------------------------------------------------------
// Setup

chrome.runtime.onInstalled.addListener(async () => {
  const { settings, stats } = await chrome.storage.local.get(["settings", "stats"]);
  await chrome.storage.local.set({
    settings: { ...DEFAULT_SETTINGS, ...settings },
    stats: stats || { opened: 0, closed: 0, autoClosed: 0, byDay: {} },
  });
  await ensureAutoClosedCollection();
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  await stampAllTabs();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  await stampAllTabs();
});

async function ensureAutoClosedCollection() {
  const { collections = [] } = await chrome.storage.local.get("collections");
  if (!collections.some((c) => c.id === AUTO_CLOSED_ID)) {
    const ts = Date.now();
    collections.unshift({
      id: AUTO_CLOSED_ID,
      name: "Auto Closed",
      createdAt: ts,
      updatedAt: ts,
      folders: [],
      tabs: [],
    });
    await chrome.storage.local.set({ collections });
  }
}

// ---------------------------------------------------------------------------
// Activity tracking (chrome.storage.session: cleared on browser restart,
// which matches the lifetime of tab ids)

async function touchTabs(tabIds) {
  if (!tabIds.length) return;
  const { tabActivity = {} } = await chrome.storage.session.get("tabActivity");
  const ts = Date.now();
  for (const id of tabIds) tabActivity[id] = ts;
  await chrome.storage.session.set({ tabActivity });
}

async function stampAllTabs() {
  const tabs = await chrome.tabs.query({});
  await touchTabs(tabs.map((t) => t.id));
}

async function bumpStat(key, amount = 1) {
  const { stats } = await chrome.storage.local.get("stats");
  const s = stats || { opened: 0, closed: 0, autoClosed: 0, byDay: {} };
  s[key] = (s[key] || 0) + amount;
  const day = todayKey();
  s.byDay[day] = s.byDay[day] || { opened: 0, closed: 0, autoClosed: 0 };
  s.byDay[day][key] = (s.byDay[day][key] || 0) + amount;
  await chrome.storage.local.set({ stats: s });
}

chrome.tabs.onCreated.addListener(async (tab) => {
  await touchTabs([tab.id]);
  await bumpStat("opened");
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await touchTabs([tabId]);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Navigation or media activity counts as "recently used".
  if (changeInfo.url || changeInfo.status === "complete" || changeInfo.audible) {
    await touchTabs([tabId]);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  const [active] = await chrome.tabs.query({ active: true, windowId });
  if (active) await touchTabs([active.id]);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await bumpStat("closed");
  const { tabActivity = {}, lockedTabs = {} } =
    await chrome.storage.session.get(["tabActivity", "lockedTabs"]);
  delete tabActivity[tabId];
  delete lockedTabs[tabId];
  await chrome.storage.session.set({ tabActivity, lockedTabs });
});

// ---------------------------------------------------------------------------
// Auto-close sweep

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SWEEP_ALARM) await sweep();
});

async function sweep() {
  const { settings, lockedSites = [] } =
    await chrome.storage.local.get(["settings", "lockedSites"]);
  const cfg = { ...DEFAULT_SETTINGS, ...settings };
  if (!cfg.autoCloseEnabled) return;

  const [tabs, sessionData] = await Promise.all([
    chrome.tabs.query({}),
    chrome.storage.session.get(["tabActivity", "lockedTabs"]),
  ]);
  const tabActivity = sessionData.tabActivity || {};
  const lockedTabs = sessionData.lockedTabs || {};

  const tabsPerWindow = {};
  for (const t of tabs) {
    tabsPerWindow[t.windowId] = (tabsPerWindow[t.windowId] || 0) + 1;
  }

  const cutoff = Date.now() - cfg.autoCloseMinutes * 60 * 1000;
  const neverSeen = [];
  const candidates = [];

  for (const tab of tabs) {
    if (tab.active || tab.pinned || tab.audible) continue;
    if (lockedTabs[tab.id]) continue;
    if (!/^https?:/.test(tab.url || "")) continue; // leave chrome:// & extension pages alone
    if (isSiteLocked(tab.url, lockedSites)) continue;
    const last = tabActivity[tab.id];
    if (last === undefined) {
      neverSeen.push(tab.id); // start its clock now
      continue;
    }
    if (last < cutoff) candidates.push(tab);
  }

  await touchTabs(neverSeen);

  // Oldest first, and never shrink a window below minTabsPerWindow.
  candidates.sort((a, b) => (tabActivity[a.id] || 0) - (tabActivity[b.id] || 0));
  const toClose = [];
  for (const tab of candidates) {
    if (tabsPerWindow[tab.windowId] <= cfg.minTabsPerWindow) continue;
    tabsPerWindow[tab.windowId]--;
    toClose.push(tab);
  }
  if (!toClose.length) return;

  await saveToAutoClosed(toClose, cfg.autoClosedCap);
  await bumpStat("autoClosed", toClose.length);
  await chrome.tabs.remove(toClose.map((t) => t.id));
}

async function saveToAutoClosed(tabs, cap) {
  const { collections = [] } = await chrome.storage.local.get("collections");
  let col = collections.find((c) => c.id === AUTO_CLOSED_ID);
  if (!col) {
    const ts = Date.now();
    col = { id: AUTO_CLOSED_ID, name: "Auto Closed", createdAt: ts, updatedAt: ts, folders: [], tabs: [] };
    collections.unshift(col);
  }
  const entries = tabs.map((tab) => ({
    id: uid(),
    title: (tab.title && tab.title.trim()) || hostnameOf(tab.url || ""),
    url: tab.url || "",
    addedAt: Date.now(),
  }));
  col.tabs.unshift(...entries);
  if (col.tabs.length > cap) col.tabs.length = cap;
  col.updatedAt = Date.now();
  await chrome.storage.local.set({ collections });
}
