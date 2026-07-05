// Service worker: tracks tab activity, auto-closes inactive tabs into the
// "Auto Closed" collection, and records opened/closed stats.

const AUTO_CLOSED_ID = "auto-closed";
const SWEEP_ALARM = "tabkeeper-sweep";

const DEFAULT_SETTINGS = {
  autoCloseEnabled: true,
  autoCloseMinutes: 20,
  minTabsPerWindow: 5,
  autoClosedCap: 200,
  idleSeconds: 30,
  badgeTimer: false,
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
// bare patterns match the hostname or any subdomain. Used for both locked
// sites and the auto-close scope list.
function matchesSitePatterns(url, patterns) {
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
  // Settings live in sync storage; migrate any pre-sync local settings once
  // (sync values win so another machine's preferences aren't clobbered).
  const [{ settings: localSettings }, { settings: syncSettings }, { stats }] =
    await Promise.all([
      chrome.storage.local.get("settings"),
      chrome.storage.sync.get("settings"),
      chrome.storage.local.get("stats"),
    ]);
  await chrome.storage.sync.set({
    settings: { ...DEFAULT_SETTINGS, ...localSettings, ...syncSettings },
  });
  if (localSettings) await chrome.storage.local.remove("settings");

  await chrome.storage.local.set({
    stats: stats || { opened: 0, closed: 0, autoClosed: 0, byDay: {} },
  });
  await ensureAutoClosedCollection();
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  await stampAllTabs();
  await applyIdleInterval();
  await retrack();
});

chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 1 });
  await stampAllTabs();
  await applyIdleInterval();
  await retrack();
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
  await retrack();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Navigation or media activity counts as "recently used".
  if (changeInfo.url || changeInfo.status === "complete" || changeInfo.audible) {
    await touchTabs([tabId]);
  }
  if (changeInfo.url && tab.active) await retrack();
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await closeSegment();
    await updateBadge(null);
    return;
  }
  const [active] = await chrome.tabs.query({ active: true, windowId });
  if (active) await touchTabs([active.id]);
  await retrack();
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
// Time tracking: accumulates focused-tab seconds per hostname per day.
// The open segment lives in storage.session; every relevant event (tab
// switch, focus change, navigation, idle) closes it out and starts a new
// one, and the 1-minute alarm flushes it so at most ~1 min can be lost.

async function applyIdleInterval() {
  const { settings } = await chrome.storage.sync.get("settings");
  const secs = Math.min(600, Math.max(15, (settings && settings.idleSeconds) || 30));
  chrome.idle.setDetectionInterval(secs);
}

async function activeTrackedHost() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !/^https?:/.test(tab.url || "")) return null;
    return new URL(tab.url).hostname;
  } catch {
    return null;
  }
}

async function closeSegment() {
  const { trackSeg } = await chrome.storage.session.get("trackSeg");
  if (!trackSeg) return;
  await chrome.storage.session.remove("trackSeg");
  const secs = Math.round((Date.now() - trackSeg.start) / 1000);
  if (!trackSeg.host || secs <= 0) return;
  const { timeSpent = {}, timeTrackingSince } =
    await chrome.storage.local.get(["timeSpent", "timeTrackingSince"]);
  const day = todayKey();
  timeSpent[day] = timeSpent[day] || {};
  timeSpent[day][trackSeg.host] = (timeSpent[day][trackSeg.host] || 0) + secs;
  const patch = { timeSpent };
  if (!timeTrackingSince) patch.timeTrackingSince = Date.now() - secs * 1000;
  await chrome.storage.local.set(patch);
}

// Closes the current segment and starts tracking whatever is focused now.
async function retrack() {
  await closeSegment();
  const host = await activeTrackedHost();
  if (host) await chrome.storage.session.set({ trackSeg: { host, start: Date.now() } });
  await updateBadge(host);
}

async function updateBadge(host) {
  const { settings } = await chrome.storage.sync.get("settings");
  if (!settings || !settings.badgeTimer) return chrome.action.setBadgeText({ text: "" });
  if (host === undefined) host = await activeTrackedHost();
  if (!host) return chrome.action.setBadgeText({ text: "" });
  const { timeSpent = {} } = await chrome.storage.local.get("timeSpent");
  const secs = (timeSpent[todayKey()] || {})[host] || 0;
  const mins = Math.round(secs / 60);
  const text = mins < 60 ? `${mins}m` : `${(mins / 60).toFixed(1)}h`;
  chrome.action.setBadgeText({ text });
}

chrome.idle.onStateChanged.addListener(async (state) => {
  if (state === "active") {
    await retrack();
  } else {
    await closeSegment();
    await updateBadge(null);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.settings) {
    applyIdleInterval();
    updateBadge();
  }
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts

const QUICK_SAVED_ID = "quick-saved";

function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  setTimeout(() => updateBadge(), 1500); // restore the time badge if enabled
}

async function quickSave(tab) {
  const { collections = [] } = await chrome.storage.local.get("collections");
  let col = collections.find((c) => c.id === QUICK_SAVED_ID);
  if (!col) {
    const ts = Date.now();
    col = {
      id: QUICK_SAVED_ID,
      name: "Quick saved",
      createdAt: ts,
      updatedAt: ts,
      folders: [],
      tabs: [],
    };
    collections.unshift(col);
  }
  col.tabs.unshift({
    id: uid(),
    title: (tab.title && tab.title.trim()) || hostnameOf(tab.url || ""),
    url: tab.url || "",
    addedAt: Date.now(),
  });
  col.updatedAt = Date.now();
  await chrome.storage.local.set({ collections });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-dashboard") {
    await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab) return;

  if (command === "save-current-tab") {
    if (!/^https?:/.test(tab.url || "")) return flashBadge("✕");
    await quickSave(tab);
    flashBadge("✓");
  } else if (command === "lock-current-tab") {
    const { lockedTabs = {} } = await chrome.storage.session.get("lockedTabs");
    if (lockedTabs[tab.id]) delete lockedTabs[tab.id];
    else lockedTabs[tab.id] = true;
    await chrome.storage.session.set({ lockedTabs });
    flashBadge(lockedTabs[tab.id] ? "L" : "U");
  }
});

// ---------------------------------------------------------------------------
// Auto-close sweep

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SWEEP_ALARM) {
    await retrack(); // flush the open time-tracking segment
    await sweep();
  }
});

async function sweep() {
  const [{ settings }, { lockedSites = [], autoCloseList = [] }] = await Promise.all([
    chrome.storage.sync.get("settings"),
    chrome.storage.local.get(["lockedSites", "autoCloseList"]),
  ]);
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
    if (matchesSitePatterns(tab.url, lockedSites)) continue;
    if (cfg.autoCloseScope === "except" && matchesSitePatterns(tab.url, autoCloseList)) continue;
    if (cfg.autoCloseScope === "only" && !matchesSitePatterns(tab.url, autoCloseList)) continue;
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
  await bumpAutoClosedSites(toClose);
  await chrome.tabs.remove(toClose.map((t) => t.id));
}

// Per-hostname auto-close counts; unlike the Auto Closed collection these
// are never capped, so the "most auto-closed sites" ranking stays accurate.
async function bumpAutoClosedSites(tabs) {
  const { stats } = await chrome.storage.local.get("stats");
  const s = stats || { opened: 0, closed: 0, autoClosed: 0, byDay: {} };
  s.autoClosedSites = s.autoClosedSites || {};
  for (const tab of tabs) {
    const host = hostnameOf(tab.url || "");
    if (host) s.autoClosedSites[host] = (s.autoClosedSites[host] || 0) + 1;
  }
  await chrome.storage.local.set({ stats: s });
}

function domainOf(url) {
  return (hostnameOf(url || "") || "").replace(/^www\./, "") || "other";
}

// Enforces the cap across the whole collection (folders + root), dropping
// the oldest links first and removing folders that end up empty.
function capAutoClosed(col, cap) {
  const all = [...col.tabs, ...col.folders.flatMap((f) => f.tabs)];
  if (all.length <= cap) return;
  all.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  const keep = new Set(all.slice(0, cap).map((t) => t.id));
  col.tabs = col.tabs.filter((t) => keep.has(t.id));
  for (const f of col.folders) f.tabs = f.tabs.filter((t) => keep.has(t.id));
  col.folders = col.folders.filter((f) => f.tabs.length);
}

// Auto-closed tabs are grouped into per-domain folders ("similar tabs")
// inside the Auto Closed collection, newest first.
async function saveToAutoClosed(tabs, cap) {
  const { collections = [] } = await chrome.storage.local.get("collections");
  let col = collections.find((c) => c.id === AUTO_CLOSED_ID);
  if (!col) {
    const ts = Date.now();
    col = { id: AUTO_CLOSED_ID, name: "Auto Closed", createdAt: ts, updatedAt: ts, folders: [], tabs: [] };
    collections.unshift(col);
  }
  const ts = Date.now();
  for (const tab of tabs) {
    const domain = domainOf(tab.url);
    let folder = col.folders.find((f) => f.name === domain);
    if (!folder) {
      folder = { id: uid(), name: domain, createdAt: ts, updatedAt: ts, tabs: [] };
      col.folders.push(folder);
    }
    // Same URL closed again: replace the old entry instead of duplicating.
    const dup = folder.tabs.findIndex((t) => t.url === tab.url);
    if (dup !== -1) folder.tabs.splice(dup, 1);
    folder.tabs.unshift({
      id: uid(),
      title: (tab.title && tab.title.trim()) || hostnameOf(tab.url || ""),
      url: tab.url || "",
      addedAt: ts,
    });
    folder.updatedAt = ts;
  }
  capAutoClosed(col, cap);
  col.updatedAt = ts;
  await chrome.storage.local.set({ collections });
}
