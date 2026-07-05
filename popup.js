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

// Live-refresh the Auto Closed panel if the sweep closes tabs while open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.collections) renderAutoClosed();
});

setActivePanel(localStorage.getItem("activePanel") || "panel-autoclosed");
applyTheme();
render();
renderAutoClosed();
