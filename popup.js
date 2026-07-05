// ---------------------------------------------------------------------------
// Auto Closed panel

async function removeAutoClosedEntry(entryId) {
  const collections = await getCollections();
  const col = collections.find((c) => c.id === AUTO_CLOSED_ID);
  if (!col) return;
  col.tabs = col.tabs.filter((t) => t.id !== entryId);
  for (const f of col.folders) f.tabs = f.tabs.filter((t) => t.id !== entryId);
  col.folders = col.folders.filter((f) => f.tabs.length);
  col.updatedAt = now();
  await setCollections(collections);
}

async function renderAutoClosed() {
  const [collections, settings] = await Promise.all([getCollections(), getSettings()]);
  const col = collections.find((c) => c.id === AUTO_CLOSED_ID);
  const list = document.getElementById("autoclosed-list");
  list.textContent = "";

  const entries = col
    ? [
        ...col.tabs.map((t) => ({ entry: t, domain: hostnameOf(t.url) })),
        ...col.folders.flatMap((f) => f.tabs.map((t) => ({ entry: t, domain: f.name }))),
      ]
    : [];
  entries.sort((a, b) => (b.entry.addedAt || 0) - (a.entry.addedAt || 0));

  document.getElementById("autoclosed-count").textContent =
    entries.length === 1 ? "1 link" : `${entries.length} links`;

  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Nothing auto-closed yet.";
    list.appendChild(empty);
    return;
  }

  for (const { entry, domain } of entries.slice(0, 50)) {
    const li = document.createElement("li");

    const img = document.createElement("img");
    img.src = faviconUrl(entry.url, 16);
    img.alt = "";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = entry.title || domain;
    title.title =
      `${entry.url}\nClosed ${fmtDate(entry.addedAt)}` +
      (entry.lastOpenedAt ? `\nLast opened ${fmtDate(entry.lastOpenedAt)}` : "") +
      "\nClick to reopen";
    title.addEventListener("click", async () => {
      chrome.tabs.create({ url: entry.url, active: false });
      if (settings.restoreRemoves) {
        await removeAutoClosedEntry(entry.id);
      } else {
        await markTabsOpened(AUTO_CLOSED_ID, [entry.id]);
      }
      renderAutoClosed();
    });

    const time = document.createElement("span");
    time.className = "time";
    time.textContent = relTime(entry.lastOpenedAt || entry.addedAt);
    time.title = entry.lastOpenedAt
      ? `Last opened ${fmtDate(entry.lastOpenedAt)}`
      : `Closed ${fmtDate(entry.addedAt)}`;

    const dom = document.createElement("span");
    dom.className = "domain";
    dom.textContent = domain;

    const del = document.createElement("button");
    del.className = "del-btn";
    del.textContent = "🗑";
    del.title = "Remove from Auto Closed";
    del.addEventListener("click", async () => {
      await removeAutoClosedEntry(entry.id);
      renderAutoClosed();
    });

    li.append(img, title, time, dom, del);
    list.appendChild(li);
  }
}

// ---------------------------------------------------------------------------
// Opened tabs panel

async function render() {
  const [tabs, lockedTabs, settings, lockedSites, autoCloseList, sessionData] =
    await Promise.all([
      chrome.tabs.query({ currentWindow: true }),
      getLockedTabs(),
      getSettings(),
      getLockedSites(),
      getAutoCloseList(),
      chrome.storage.session.get("tabActivity"),
    ]);
  const tabActivity = sessionData.tabActivity || {};

  const list = document.getElementById("tab-list");
  list.textContent = "";
  document.getElementById("tabs-count").textContent =
    tabs.length === 1 ? "1 tab" : `${tabs.length} tabs`;

  for (const tab of tabs) {
    const li = document.createElement("li");
    const locked = !!lockedTabs[tab.id];
    if (locked) li.classList.add("locked");

    const img = document.createElement("img");
    img.src = faviconUrl(tab.url || "", 16);
    img.alt = "";

    const title = document.createElement("span");
    title.className = "title";
    title.textContent = siteName(tab);
    title.title = tab.url || "";

    const countdown = document.createElement("span");
    countdown.className = "countdown";
    const url = tab.url || "";
    const exempt =
      tab.active ||
      tab.pinned ||
      tab.audible ||
      !!lockedTabs[tab.id] ||
      isSiteLocked(url, lockedSites) ||
      !/^https?:/.test(url) ||
      (settings.autoCloseScope === "except" && isSiteLocked(url, autoCloseList)) ||
      (settings.autoCloseScope === "only" && !isSiteLocked(url, autoCloseList));
    if (settings.autoCloseEnabled) {
      if (exempt) {
        countdown.textContent = "∞";
        countdown.title = "Exempt from auto-close";
      } else {
        const last = tabActivity[tab.id] ?? Date.now();
        const remainMs = settings.autoCloseMinutes * 60000 - (Date.now() - last);
        const mins = Math.max(0, Math.ceil(remainMs / 60000));
        countdown.textContent = mins + "m";
        countdown.title = "Estimated minutes until auto-close";
      }
    }

    const addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    addBtn.textContent = "➕";
    addBtn.title = "Save this tab to a collection";
    addBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (li.querySelector("select")) return;
      const collections = await getCollections();
      const sel = document.createElement("select");

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Save to collection…";
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);

      for (const col of collections) {
        const opt = document.createElement("option");
        opt.value = col.id;
        opt.textContent = col.name;
        sel.appendChild(opt);
      }
      const newOpt = document.createElement("option");
      newOpt.value = "__new__";
      newOpt.textContent = "＋ New collection…";
      sel.appendChild(newOpt);

      const restore = () => {
        sel.remove();
        title.style.display = "";
      };
      sel.addEventListener("click", (ev) => ev.stopPropagation());
      sel.addEventListener("blur", () => setTimeout(restore, 100));
      sel.addEventListener("change", async () => {
        let choice = sel.value;
        let newName = null;
        if (choice === "__new__") {
          newName = prompt("New collection name:", "New collection");
          if (newName === null) return restore();
        }
        const col = await addTabToCollection(tab, choice, newName);
        restore();
        if (col) {
          addBtn.textContent = "✅";
          addBtn.title = `Saved to "${col.name}"`;
          setTimeout(() => {
            addBtn.textContent = "➕";
            addBtn.title = "Save this tab to a collection";
          }, 1500);
        }
      });

      title.style.display = "none";
      li.insertBefore(sel, addBtn);
      sel.focus();
    });

    const pinBtn = document.createElement("button");
    pinBtn.className = "pin-btn";
    const siteLocked = isSiteLocked(tab.url || "", lockedSites);
    pinBtn.textContent = "📌";
    pinBtn.classList.toggle("active", siteLocked);
    pinBtn.title = siteLocked
      ? "Site is always locked — click to remove"
      : "Always lock this site (survives browser restarts)";
    if (!/^https?:/.test(tab.url || "")) pinBtn.style.visibility = "hidden";
    pinBtn.addEventListener("click", async () => {
      const sites = await getLockedSites();
      if (isSiteLocked(tab.url, sites)) {
        await setLockedSites(sites.filter((p) => !isSiteLocked(tab.url, [p])));
      } else {
        const pattern = normalizeSitePattern(tab.url);
        if (pattern && !sites.includes(pattern)) sites.push(pattern);
        await setLockedSites(sites);
      }
      render();
    });

    const lockBtn = document.createElement("button");
    lockBtn.className = "lock-btn";
    lockBtn.textContent = locked ? "🔒" : "🔓";
    lockBtn.title = locked ? "Unlock (allow auto-close)" : "Lock (never auto-close)";
    lockBtn.addEventListener("click", async () => {
      const current = await getLockedTabs();
      if (current[tab.id]) delete current[tab.id];
      else current[tab.id] = true;
      await setLockedTabs(current);
      render();
    });

    li.append(img, title, countdown, addBtn, pinBtn, lockBtn);
    li.addEventListener("click", (e) => {
      if (e.target === lockBtn || e.target === addBtn || e.target === pinBtn) return;
      chrome.tabs.update(tab.id, { active: true });
    });
    list.appendChild(li);
  }

  const status = document.getElementById("autoclose-status");
  status.textContent = settings.autoCloseEnabled
    ? `Auto-close: on — tabs inactive for ${settings.autoCloseMinutes} min are saved to "Auto Closed" and closed.`
    : "Auto-close: off (enable it from the Dashboard).";

  // Duplicate tabs in this window (same URL, keep one per group).
  const byUrl = new Map();
  for (const tab of tabs) {
    if (!tab.url) continue;
    if (!byUrl.has(tab.url)) byUrl.set(tab.url, []);
    byUrl.get(tab.url).push(tab);
  }
  const extras = [];
  for (const group of byUrl.values()) {
    if (group.length < 2) continue;
    const keep = group.find((t) => t.active) || group[0];
    extras.push(...group.filter((t) => t !== keep));
  }
  const dupBtn = document.getElementById("close-duplicates");
  dupBtn.classList.toggle("hidden", extras.length === 0);
  if (extras.length) {
    dupBtn.textContent = `🧹 Close ${extras.length} duplicate tab${extras.length === 1 ? "" : "s"}`;
    dupBtn.onclick = async () => {
      await chrome.tabs.remove(extras.map((t) => t.id));
      render();
    };
  }
}

document.getElementById("open-dashboard").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

document.getElementById("save-window").addEventListener("click", async () => {
  const name = prompt(
    "Collection name:",
    "Session " + new Date().toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  );
  if (name === null) return;

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const collection = makeCollection(name.trim() || "Untitled collection");
  collection.tabs = tabs
    .filter((t) => /^https?:/.test(t.url || ""))
    .map(makeTabEntry);

  const collections = await getCollections();
  collections.push(collection);
  await setCollections(collections);

  const btn = document.getElementById("save-window");
  btn.textContent = `✅ Saved ${collection.tabs.length} tabs to "${collection.name}"`;
  setTimeout(() => (btn.textContent = "💾 Save window to collection"), 2000);
});

// ---------------------------------------------------------------------------
// Time panel: donut chart + per-site list for today / daily average / all-time

const SLICE_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#84cc16", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef", "#ec4899", "#f43f5e",
];
const OTHERS_COLOR = "#9ca3af";
const MAX_SLICES = 12;

let timePeriod = "today";
let timeSelected = 0;
let expandedHost = null; // hostname, "__overall__", or null

function pad2(n) {
  return String(n).padStart(2, "0");
}

function fmtDuration(secs, withDays) {
  const s = Math.floor(secs % 60);
  const m = Math.floor((secs / 60) % 60);
  if (withDays) {
    const h = Math.floor((secs / 3600) % 24);
    const d = Math.floor(secs / 86400);
    return `${pad2(d)}d ${h}h ${pad2(m)}m ${pad2(s)}s`;
  }
  const h = Math.floor(secs / 3600);
  return `${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

// Contiguous ISO day keys from fromKey to toKey inclusive (capped at 365).
function dayRange(fromKey, toKey) {
  const out = [];
  let t = new Date(fromKey + "T12:00:00");
  const end = new Date(toKey + "T12:00:00");
  while (t <= end && out.length < 366) {
    out.push(t.toISOString().slice(0, 10));
    t = new Date(t.getTime() + 86400000);
  }
  return out.slice(-365);
}

// Small per-day bar timeline with the date range labelled underneath.
function timelineChart(series, days) {
  const W = 360, H = 56;
  const max = Math.max(1, ...days.map((d) => series[d] || 0));
  const bw = W / days.length;
  let rects = "";
  days.forEach((d, i) => {
    const v = series[d] || 0;
    if (!v) return;
    const h = Math.max(1, (v / max) * (H - 2));
    rects += `<rect x="${(i * bw).toFixed(2)}" y="${(H - h).toFixed(2)}" width="${Math.max(0.5, bw - 0.6).toFixed(2)}" height="${h.toFixed(2)}"/>`;
  });
  return (
    `<svg viewBox="0 0 ${W} ${H}" class="mini-chart">${rects}</svg>` +
    `<div class="chart-dates"><span>${days[0]}</span><span>${days[days.length - 1]}</span></div>`
  );
}

// Weekday (Mo–Su) totals histogram.
function weekdayChart(series) {
  const sums = [0, 0, 0, 0, 0, 0, 0];
  for (const [day, secs] of Object.entries(series)) {
    const wd = (new Date(day + "T12:00:00").getDay() + 6) % 7; // 0 = Monday
    sums[wd] += secs;
  }
  const labels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const W = 360, H = 60, chartH = 44;
  const max = Math.max(1, ...sums);
  const bw = W / 7;
  let parts = "";
  sums.forEach((v, i) => {
    const h = Math.max(v ? 2 : 0, (v / max) * chartH);
    parts +=
      `<rect x="${(i * bw + 2).toFixed(1)}" y="${(chartH - h).toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}"/>` +
      `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H - 3}" text-anchor="middle">${labels[i]}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="mini-chart weekday">${parts}</svg>`;
}

// Expanded stats block for one host (or overall when host is null).
function buildDetail({ series, host, daysTotal, allDays, sortedToday, sortedAll, todayMap }) {
  const visitedDays = Object.keys(series).filter((d) => series[d] > 0).sort();
  const allTime = Object.values(series).reduce((n, s) => n + s, 0);
  const today = series[todayKey()] || 0;
  let mostActive = null, mostInactive = null;
  for (const d of visitedDays) {
    if (!mostActive || series[d] > series[mostActive]) mostActive = d;
    if (!mostInactive || series[d] < series[mostInactive]) mostInactive = d;
  }

  const li = document.createElement("li");
  li.className = "detail";

  const stats = [];
  if (host) {
    const rankToday = sortedToday.indexOf(host);
    const rankAll = sortedAll.indexOf(host);
    stats.push(
      ["Visited", `${visitedDays.length} days out of ${daysTotal}`],
      ["Rank today", `${rankToday === -1 ? "–" : rankToday + 1} / ${sortedToday.length}`],
      ["Rank all-time", `${rankAll === -1 ? "–" : rankAll + 1} / ${sortedAll.length}`],
      ["First visit", visitedDays[0] || "–"],
      ["Last visit", visitedDays[visitedDays.length - 1] || "–"]
    );
  } else {
    stats.push(
      ["First day", visitedDays[0] || "–"],
      ["Last day", visitedDays[visitedDays.length - 1] || "–"],
      ["Active days", String(visitedDays.length)],
      ["Days in total", String(daysTotal)]
    );
  }
  stats.push(
    ["Most inactive day", mostInactive ? `${mostInactive} · ${fmtDuration(series[mostInactive])}` : "–"],
    ["Most active day", mostActive ? `${mostActive} · ${fmtDuration(series[mostActive])}` : "–"],
    ["Today", fmtDuration(today)],
    ["All-time", fmtDuration(allTime, true)],
    ["Daily average", fmtDuration(allTime / daysTotal)],
    ["Pure average", fmtDuration(visitedDays.length ? allTime / visitedDays.length : 0)]
  );

  const grid = document.createElement("div");
  grid.className = "grid";
  for (const [lbl, val] of stats) {
    const item = document.createElement("div");
    item.className = "stat";
    item.innerHTML = `<div class="lbl">${escapeHtml(lbl)}</div><div class="val">${escapeHtml(val)}</div>`;
    grid.appendChild(item);
  }
  if (host) {
    const open = document.createElement("div");
    open.className = "stat";
    open.innerHTML = `<div class="lbl">Open</div>`;
    const a = document.createElement("a");
    a.href = "https://" + host;
    a.textContent = host;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: "https://" + host, active: false });
    });
    open.appendChild(a);
    grid.insertBefore(open, grid.children[1]);
  }
  li.appendChild(grid);

  const charts = document.createElement("div");
  charts.className = "charts";
  charts.innerHTML = timelineChart(series, allDays) + weekdayChart(series);
  li.appendChild(charts);
  return li;
}

// Arc along a circle from angle a0 to a1 (degrees, 0 = 12 o'clock).
function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

async function renderTimePanel() {
  const [{ timeSpent = {}, timeTrackingSince }, settings] = await Promise.all([
    chrome.storage.local.get(["timeSpent", "timeTrackingSince"]),
    getSettings(),
  ]);

  document.querySelectorAll(".period-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.period === timePeriod);
  });

  // All-time aggregates (used for details regardless of the period shown).
  const allTotals = {};
  for (const day of Object.keys(timeSpent)) {
    for (const [host, secs] of Object.entries(timeSpent[day])) {
      allTotals[host] = (allTotals[host] || 0) + secs;
    }
  }
  const todayMap = timeSpent[todayKey()] || {};
  const sortedAll = Object.keys(allTotals).sort((a, b) => allTotals[b] - allTotals[a]);
  const sortedToday = Object.keys(todayMap).sort((a, b) => todayMap[b] - todayMap[a]);

  // Aggregate seconds per host for the selected period.
  const totals = timePeriod === "today" ? { ...todayMap } : { ...allTotals };

  const since = timeTrackingSince || Date.now();
  const days = Math.max(1, Math.floor((Date.now() - since) / 86400000) + 1);
  const sinceStr = new Date(since).toISOString().slice(0, 10);

  const note = document.getElementById("time-note");
  note.textContent =
    timePeriod === "today"
      ? `Data for ${todayKey()}`
      : timePeriod === "avg"
      ? `Daily averages since ${sinceStr} (${days} day${days === 1 ? "" : "s"})`
      : `Aggregate data since ${sinceStr} (${days} day${days === 1 ? "" : "s"})`;

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const grandTotal = sorted.reduce((n, [, s]) => n + s, 0);

  const svg = document.getElementById("donut");
  const list = document.getElementById("time-list");
  svg.textContent = "";
  list.textContent = "";

  if (!grandTotal) {
    document.getElementById("donut-pct").textContent = "—";
    document.getElementById("donut-site").textContent = "no data yet";
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "Time on http(s) sites will appear here as you browse.";
    list.appendChild(empty);
    return;
  }

  // Top hosts get their own slice; the rest are grouped as "others".
  const slices = sorted.slice(0, MAX_SLICES).map(([host, secs], i) => ({
    host,
    secs,
    color: SLICE_COLORS[i % SLICE_COLORS.length],
  }));
  const rest = sorted.slice(MAX_SLICES);
  if (rest.length) {
    slices.push({
      host: `others (${rest.length} sites)`,
      secs: rest.reduce((n, [, s]) => n + s, 0),
      color: OTHERS_COLOR,
    });
  }
  if (timeSelected >= slices.length) timeSelected = 0;

  const setCenter = () => {
    const s = slices[timeSelected];
    document.getElementById("donut-pct").textContent =
      ((s.secs / grandTotal) * 100).toFixed(2) + " %";
    document.getElementById("donut-site").textContent = s.host;
  };

  // Donut slices
  const gap = Math.max(0, Math.min(10, settings.chartGap ?? 4));
  let angle = 0;
  slices.forEach((s, i) => {
    const span = (s.secs / grandTotal) * 360;
    const draw = Math.max(0.5, Math.min(359.9, span - gap));
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", arcPath(100, 100, 80, angle, angle + draw));
    path.setAttribute("stroke", s.color);
    path.setAttribute("stroke-width", i === timeSelected ? "30" : "24");
    path.setAttribute("fill", "none");
    path.addEventListener("click", () => {
      timeSelected = i;
      renderTimePanel();
    });
    svg.appendChild(path);
    angle += span;
  });
  setCenter();

  // Context shared by the expandable detail blocks.
  const firstDataDay = Object.keys(timeSpent).sort()[0] || sinceStr;
  const allDays = dayRange(firstDataDay < sinceStr ? firstDataDay : sinceStr, todayKey());
  const hostSeries = (host) => {
    const series = {};
    for (const day of Object.keys(timeSpent)) {
      if (timeSpent[day][host]) series[day] = timeSpent[day][host];
    }
    return series;
  };
  const dayTotals = {};
  for (const day of Object.keys(timeSpent)) {
    dayTotals[day] = Object.values(timeSpent[day]).reduce((n, s) => n + s, 0);
  }
  const detailCtx = { daysTotal: days, allDays, sortedToday, sortedAll, todayMap };
  const isRealHost = (s) => s.color !== OTHERS_COLOR;

  // Per-site list (click a row for detailed stats)
  slices.forEach((s, i) => {
    const li = document.createElement("li");
    if (i === timeSelected) li.classList.add("selected");

    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.background = s.color;

    const host = document.createElement("span");
    host.className = "host";
    host.textContent = s.host;
    host.title = isRealHost(s) ? `${s.host} — click for detailed stats` : s.host;

    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = ((s.secs / grandTotal) * 100).toFixed(2) + " %";

    const dur = document.createElement("span");
    dur.className = "dur";
    const secs = timePeriod === "avg" ? s.secs / days : s.secs;
    dur.textContent = fmtDuration(secs, timePeriod === "all");

    li.append(swatch, host, pct, dur);
    li.addEventListener("click", () => {
      timeSelected = i;
      if (isRealHost(s)) {
        expandedHost = expandedHost === s.host ? null : s.host;
      }
      renderTimePanel();
    });
    list.appendChild(li);

    if (isRealHost(s) && expandedHost === s.host) {
      list.appendChild(buildDetail({ series: hostSeries(s.host), host: s.host, ...detailCtx }));
    }
  });

  // Total row
  const totalLi = document.createElement("li");
  totalLi.className = "total";
  const totalSecs = timePeriod === "avg" ? grandTotal / days : grandTotal;
  totalLi.innerHTML =
    `<span class="host">Total</span><span class="pct">100.00 %</span>` +
    `<span class="dur">${fmtDuration(totalSecs, timePeriod === "all")}</span>`;
  list.appendChild(totalLi);

  // Overall stats (all sites combined)
  const overallLi = document.createElement("li");
  overallLi.className = "overall-toggle";
  overallLi.textContent =
    (expandedHost === "__overall__" ? "▾" : "▸") + " 📊 Overall stats";
  overallLi.addEventListener("click", () => {
    expandedHost = expandedHost === "__overall__" ? null : "__overall__";
    renderTimePanel();
  });
  list.appendChild(overallLi);
  if (expandedHost === "__overall__") {
    list.appendChild(buildDetail({ series: dayTotals, host: null, ...detailCtx }));
  }
}

document.querySelectorAll(".period-btn").forEach((b) => {
  b.addEventListener("click", () => {
    timePeriod = b.dataset.period;
    timeSelected = 0;
    renderTimePanel();
  });
});

// ---------------------------------------------------------------------------
// Panel switching (one panel visible at a time; last choice remembered)

function setActivePanel(panelId) {
  document.querySelectorAll(".panel").forEach((p) => {
    p.classList.toggle("hidden", p.id !== panelId);
  });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === panelId);
  });
  localStorage.setItem("activePanel", panelId);
}

document.querySelectorAll(".tab-btn").forEach((b) => {
  b.addEventListener("click", () => setActivePanel(b.dataset.panel));
});

// Live-refresh panels when the background worker writes new data.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.collections) renderAutoClosed();
  if (changes.timeSpent) renderTimePanel();
});

setActivePanel(localStorage.getItem("activePanel") || "panel-autoclosed");
applyTheme();
render();
renderAutoClosed();
renderTimePanel();
