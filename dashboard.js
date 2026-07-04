// Dashboard: collections, folders, search, stats, settings.

let state = {
  view: "collection", // "collection" | "stats" | "settings" | "search"
  selectedCollectionId: null,
  query: "",
  showHiddenCollections: false,
  showHiddenFolders: false,
};

const $content = document.getElementById("content");
const $collectionList = document.getElementById("collection-list");
const $searchInput = document.getElementById("search-input");

// ---------------------------------------------------------------------------
// Mutation helpers — every write bumps updatedAt on the touched collection.

async function mutateCollections(fn) {
  const collections = await getCollections();
  const touched = fn(collections); // returns collection(s) that changed, or nothing
  const ts = now();
  for (const col of [].concat(touched || [])) {
    if (col) col.updatedAt = ts;
  }
  await setCollections(collections);
  await renderAll();
}

function findCollection(collections, id) {
  return collections.find((c) => c.id === id);
}

function collectionTabCount(col) {
  return col.tabs.length + col.folders.reduce((n, f) => n + f.tabs.length, 0);
}

// ---------------------------------------------------------------------------
// Sidebar

async function renderSidebar() {
  const collections = await getCollections();
  $collectionList.textContent = "";

  const addItem = (col, dimmed) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    if (state.view === "collection" && state.selectedCollectionId === col.id) {
      btn.classList.add("active");
    }
    if (dimmed) btn.classList.add("hidden-dim");
    btn.textContent = col.name;
    const count = document.createElement("span");
    count.className = "count";
    count.textContent = collectionTabCount(col);
    btn.appendChild(count);
    btn.addEventListener("click", () => {
      state.view = "collection";
      state.selectedCollectionId = col.id;
      state.query = "";
      $searchInput.value = "";
      renderAll();
    });

    li.draggable = true;
    li.addEventListener("dragstart", (e) => {
      colDrag = col.id;
      e.dataTransfer.effectAllowed = "move";
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      colDrag = null;
      li.classList.remove("dragging");
      clearDropMarkers();
    });
    li.addEventListener("dragover", (e) => {
      if (!colDrag || colDrag === col.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      clearDropMarkers();
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? "drop-before" : "drop-into");
    });
    li.addEventListener("dragleave", () => {
      li.classList.remove("drop-before", "drop-into");
    });
    li.addEventListener("drop", (e) => {
      if (!colDrag || colDrag === col.id) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      const dragged = colDrag;
      colDrag = null;
      clearDropMarkers();
      mutateCollections((cs) => {
        const fromIdx = cs.findIndex((c) => c.id === dragged);
        if (fromIdx === -1) return;
        const [moved] = cs.splice(fromIdx, 1);
        let toIdx = cs.findIndex((c) => c.id === col.id);
        if (!before) toIdx++;
        cs.splice(toIdx, 0, moved);
        // reordering is not a content change: no updatedAt bump
      });
    });

    li.appendChild(btn);
    $collectionList.appendChild(li);
  };

  const hiddenCols = collections.filter((c) => c.hidden);
  for (const col of collections) {
    if (!col.hidden) addItem(col, false);
  }

  if (hiddenCols.length) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "hidden-toggle";
    btn.textContent =
      (state.showHiddenCollections ? "▾" : "▸") + ` Hidden (${hiddenCols.length})`;
    btn.addEventListener("click", () => {
      state.showHiddenCollections = !state.showHiddenCollections;
      renderSidebar();
    });
    li.appendChild(btn);
    $collectionList.appendChild(li);
    if (state.showHiddenCollections) {
      for (const col of hiddenCols) addItem(col, true);
    }
  }

  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", state.view === b.dataset.view);
  });
}

// ---------------------------------------------------------------------------
// Inline rename widget

function makeEditableName(el, currentName, onSave) {
  const edit = () => {
    const input = document.createElement("input");
    input.className = "rename-input";
    input.value = currentName;
    el.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const name = input.value.trim();
      onSave(name || currentName);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") renderAll();
    });
    input.addEventListener("blur", commit);
  };
  const pencil = document.createElement("button");
  pencil.className = "ghost";
  pencil.title = "Rename";
  pencil.textContent = "✏️";
  pencil.addEventListener("click", edit);
  return pencil;
}

// ---------------------------------------------------------------------------
// Drag and drop

let tabDrag = null; // { colId, folderId|null, tabId }
let colDrag = null; // collection id

function clearDropMarkers() {
  document.querySelectorAll(".drop-before, .drop-into").forEach((el) => {
    el.classList.remove("drop-before", "drop-into");
  });
}

// Where a drop at height `y` lands among a card's rows.
function rowInsertIndex(card, y) {
  const rows = [...card.querySelectorAll(".tab-row")];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].getBoundingClientRect();
    if (y < r.top + r.height / 2) return { index: i, row: rows[i] };
  }
  return { index: rows.length, row: null };
}

function moveTabTo(colId, tabId, fromFolderId, toFolderId, toIndex) {
  mutateCollections((cs) => {
    const c = findCollection(cs, colId);
    if (!c) return;
    const listOf = (fid) =>
      fid ? (c.folders.find((f) => f.id === fid) || {}).tabs : c.tabs;
    const src = listOf(fromFolderId);
    const dst = listOf(toFolderId);
    if (!src || !dst) return c;
    const idx = src.findIndex((t) => t.id === tabId);
    if (idx === -1) return c;
    let insert = Math.min(toIndex ?? dst.length, dst.length);
    if (src === dst && idx < insert) insert--;
    const [moved] = src.splice(idx, 1);
    dst.splice(insert, 0, moved);
    return c;
  });
}

// Lets a folder card (or the root card, folderId = null) accept link drops.
function attachTabDropZone(card, colId, folderId) {
  card.addEventListener("dragover", (e) => {
    if (!tabDrag || tabDrag.colId !== colId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropMarkers();
    const { row } = rowInsertIndex(card, e.clientY);
    if (row) row.classList.add("drop-before");
    else card.classList.add("drop-into");
  });
  card.addEventListener("dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) clearDropMarkers();
  });
  card.addEventListener("drop", (e) => {
    if (!tabDrag || tabDrag.colId !== colId) return;
    e.preventDefault();
    const { index } = rowInsertIndex(card, e.clientY);
    const drag = tabDrag;
    tabDrag = null;
    clearDropMarkers();
    moveTabTo(drag.colId, drag.tabId, drag.folderId, folderId, index);
  });
}

// ---------------------------------------------------------------------------
// Tab row

function renderTabRow(col, folder, tab, draggable = true) {
  const row = document.createElement("div");
  row.className = "tab-row";

  const img = document.createElement("img");
  img.src = faviconUrl(tab.url, 16);
  img.alt = "";

  const link = document.createElement("a");
  link.href = tab.url;
  link.textContent = tab.title || hostnameOf(tab.url);
  link.title = tab.url;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: tab.url, active: false });
  });

  const host = document.createElement("span");
  host.className = "host";
  host.textContent = hostnameOf(tab.url);

  if (draggable) {
    row.draggable = true;
    row.addEventListener("dragstart", (e) => {
      tabDrag = { colId: col.id, folderId: folder ? folder.id : null, tabId: tab.id };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tab.url);
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", () => {
      tabDrag = null;
      row.classList.remove("dragging");
      clearDropMarkers();
    });
  }

  const del = document.createElement("button");
  del.className = "ghost danger";
  del.title = "Remove link";
  del.textContent = "🗑";
  del.addEventListener("click", () => {
    mutateCollections((collections) => {
      const c = findCollection(collections, col.id);
      const source = folder ? c.folders.find((f) => f.id === folder.id).tabs : c.tabs;
      const idx = source.findIndex((t) => t.id === tab.id);
      if (idx !== -1) source.splice(idx, 1);
      return c;
    });
  });

  row.append(img, link, host, del);
  return row;
}

// ---------------------------------------------------------------------------
// Collection view

async function renderCollectionView() {
  const collections = await getCollections();
  const col =
    findCollection(collections, state.selectedCollectionId) || collections[0];
  if (!col) {
    $content.innerHTML =
      '<div class="empty">No collections yet. Click ＋ in the sidebar, or use the popup to save the current window.</div>';
    return;
  }
  state.selectedCollectionId = col.id;

  $content.textContent = "";

  // Header
  const header = document.createElement("div");
  header.className = "view-header";

  const left = document.createElement("div");
  const h2 = document.createElement("h2");
  const nameSpan = document.createElement("span");
  nameSpan.textContent = col.name;
  h2.append(nameSpan);
  h2.appendChild(
    makeEditableName(nameSpan, col.name, (name) =>
      mutateCollections((cs) => {
        const c = findCollection(cs, col.id);
        c.name = name;
        return c;
      })
    )
  );
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `Created ${fmtDate(col.createdAt)} · Updated ${fmtDate(col.updatedAt)} · ${collectionTabCount(col)} links`;
  left.append(h2, meta);

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";

  const addFolderBtn = document.createElement("button");
  addFolderBtn.textContent = "＋ New folder";
  addFolderBtn.addEventListener("click", () => {
    const name = prompt("Folder name:", "New folder");
    if (name === null) return;
    mutateCollections((cs) => {
      const c = findCollection(cs, col.id);
      c.folders.push(makeFolder(name.trim() || "New folder"));
      return c;
    });
  });

  const addTabsBtn = document.createElement("button");
  addTabsBtn.textContent = "＋ Add current window's tabs";
  addTabsBtn.addEventListener("click", async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const entries = tabs.filter((t) => /^https?:/.test(t.url || "")).map(makeTabEntry);
    mutateCollections((cs) => {
      const c = findCollection(cs, col.id);
      c.tabs.push(...entries);
      return c;
    });
  });

  const restoreBtn = document.createElement("button");
  restoreBtn.className = "primary";
  restoreBtn.textContent = "↗ Open all";
  restoreBtn.addEventListener("click", () => {
    const urls = [...col.tabs, ...col.folders.flatMap((f) => f.tabs)].map((t) => t.url);
    if (urls.length > 15 && !confirm(`Open ${urls.length} tabs?`)) return;
    for (const url of urls) chrome.tabs.create({ url, active: false });
  });

  const hideBtn = document.createElement("button");
  hideBtn.textContent = col.hidden ? "👁 Unhide" : "🙈 Hide";
  hideBtn.title = col.hidden
    ? "Show this collection in the sidebar and search results"
    : "Hide this collection from the sidebar and search results";
  hideBtn.addEventListener("click", () => {
    mutateCollections((cs) => {
      const c = findCollection(cs, col.id);
      c.hidden = !c.hidden;
      return c;
    });
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "danger";
  deleteBtn.textContent = "Delete collection";
  deleteBtn.addEventListener("click", () => {
    if (!confirm(`Delete collection "${col.name}" and all its links?`)) return;
    mutateCollections((cs) => {
      const idx = cs.findIndex((c) => c.id === col.id);
      if (idx !== -1) cs.splice(idx, 1);
      state.selectedCollectionId = null;
    });
  });

  toolbar.append(addFolderBtn, addTabsBtn, restoreBtn, hideBtn, deleteBtn);
  header.append(left, toolbar);
  $content.appendChild(header);

  // Folders
  const hiddenFolderCount = col.folders.filter((f) => f.hidden).length;
  for (const folder of col.folders) {
    if (folder.hidden && !state.showHiddenFolders) continue;
    const card = document.createElement("div");
    card.className = "card";
    if (folder.hidden) card.classList.add("hidden-dim");

    const head = document.createElement("div");
    head.className = "card-header";
    const fname = document.createElement("span");
    fname.textContent = "📁 " + folder.name;
    head.appendChild(fname);
    head.appendChild(
      makeEditableName(fname, folder.name, (name) =>
        mutateCollections((cs) => {
          const c = findCollection(cs, col.id);
          const f = c.folders.find((f) => f.id === folder.id);
          f.name = name;
          f.updatedAt = now();
          return c;
        })
      )
    );

    const spacer = document.createElement("span");
    spacer.className = "spacer";

    const openAll = document.createElement("button");
    openAll.className = "ghost";
    openAll.title = "Open all links in this folder";
    openAll.textContent = "↗";
    openAll.addEventListener("click", () => {
      for (const t of folder.tabs) chrome.tabs.create({ url: t.url, active: false });
    });

    const hideFolder = document.createElement("button");
    hideFolder.className = "ghost";
    hideFolder.textContent = folder.hidden ? "👁" : "🙈";
    hideFolder.title = folder.hidden
      ? "Unhide this folder"
      : "Hide this folder from the collection view and search results";
    hideFolder.addEventListener("click", () => {
      mutateCollections((cs) => {
        const c = findCollection(cs, col.id);
        const f = c.folders.find((f) => f.id === folder.id);
        f.hidden = !f.hidden;
        f.updatedAt = now();
        return c;
      });
    });

    const delFolder = document.createElement("button");
    delFolder.className = "ghost danger";
    delFolder.title = "Delete folder (links move out of the folder)";
    delFolder.textContent = "🗑";
    delFolder.addEventListener("click", () => {
      if (folder.tabs.length &&
          !confirm(`Delete folder "${folder.name}"? Its ${folder.tabs.length} links move to the collection root.`)) {
        return;
      }
      mutateCollections((cs) => {
        const c = findCollection(cs, col.id);
        const idx = c.folders.findIndex((f) => f.id === folder.id);
        if (idx !== -1) {
          c.tabs.push(...c.folders[idx].tabs);
          c.folders.splice(idx, 1);
        }
        return c;
      });
    });

    head.append(spacer, openAll, hideFolder, delFolder);
    card.appendChild(head);

    if (!folder.tabs.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Empty folder — drag links here.";
      card.appendChild(empty);
    }
    for (const tab of folder.tabs) card.appendChild(renderTabRow(col, folder, tab));
    attachTabDropZone(card, col.id, folder.id);
    $content.appendChild(card);
  }

  if (hiddenFolderCount) {
    const toggle = document.createElement("button");
    toggle.className = "hidden-folders-toggle";
    toggle.textContent = state.showHiddenFolders
      ? `Hide ${hiddenFolderCount} hidden folder${hiddenFolderCount === 1 ? "" : "s"}`
      : `Show ${hiddenFolderCount} hidden folder${hiddenFolderCount === 1 ? "" : "s"}`;
    toggle.addEventListener("click", () => {
      state.showHiddenFolders = !state.showHiddenFolders;
      renderAll();
    });
    $content.appendChild(toggle);
  }

  // Ungrouped tabs
  const rootCard = document.createElement("div");
  rootCard.className = "card";
  const rootHead = document.createElement("div");
  rootHead.className = "card-header";
  rootHead.textContent = col.folders.length ? "Links (no folder)" : "Links";
  rootCard.appendChild(rootHead);
  if (!col.tabs.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No links here yet.";
    rootCard.appendChild(empty);
  }
  for (const tab of col.tabs) rootCard.appendChild(renderTabRow(col, null, tab));
  attachTabDropZone(rootCard, col.id, null);
  $content.appendChild(rootCard);
}

// ---------------------------------------------------------------------------
// Search view

function highlight(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  return (
    escapeHtml(text.slice(0, idx)) +
    "<mark>" + escapeHtml(text.slice(idx, idx + query.length)) + "</mark>" +
    escapeHtml(text.slice(idx + query.length))
  );
}

async function renderSearchView() {
  const q = state.query.trim().toLowerCase();
  const collections = await getCollections();
  $content.textContent = "";

  const results = []; // { col, folder|null, tab, reason }
  for (const col of collections) {
    if (col.hidden) continue;
    const colMatch = col.name.toLowerCase().includes(q);
    const scan = (folder, tabs) => {
      const folderMatch = folder && folder.name.toLowerCase().includes(q);
      for (const tab of tabs) {
        const nameMatch = (tab.title || "").toLowerCase().includes(q);
        const urlMatch = (tab.url || "").toLowerCase().includes(q);
        if (nameMatch || urlMatch || folderMatch || colMatch) {
          results.push({ col, folder, tab });
        }
      }
    };
    scan(null, col.tabs);
    for (const folder of col.folders) {
      if (folder.hidden) continue;
      scan(folder, folder.tabs);
    }
  }

  const h2 = document.createElement("h2");
  h2.textContent = `Search: "${state.query}" — ${results.length} result${results.length === 1 ? "" : "s"}`;
  h2.style.marginBottom = "14px";
  $content.appendChild(h2);

  if (!results.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Nothing matched a site name, URL, folder name, or collection name.";
    $content.appendChild(empty);
    return;
  }

  const card = document.createElement("div");
  card.className = "card";
  for (const { col, folder, tab } of results) {
    const row = renderTabRow(col, folder, tab, false);
    const context = document.createElement("span");
    context.className = "result-context clickable";
    context.title = "Go to collection";
    context.innerHTML =
      "in " + highlight(col.name, q) +
      (folder ? " / 📁 " + highlight(folder.name, q) : "");
    context.addEventListener("click", () => {
      state.view = "collection";
      state.selectedCollectionId = col.id;
      state.query = "";
      $searchInput.value = "";
      renderAll();
    });
    row.insertBefore(context, row.querySelector("button.ghost.danger"));
    // Re-render title/host with highlight
    const link = row.querySelector("a");
    link.innerHTML = highlight(tab.title || hostnameOf(tab.url), q);
    const host = row.querySelector(".host");
    host.innerHTML = highlight(hostnameOf(tab.url), q);
    card.appendChild(row);
  }
  $content.appendChild(card);
}

// ---------------------------------------------------------------------------
// Stats view

async function renderStatsView() {
  const stats = await getStats();
  const today = stats.byDay[todayKey()] || { opened: 0, closed: 0, autoClosed: 0 };
  $content.textContent = "";

  const h2 = document.createElement("h2");
  h2.textContent = "Tab stats";
  h2.style.marginBottom = "14px";
  $content.appendChild(h2);

  const grid = document.createElement("div");
  grid.className = "stat-grid";
  const cards = [
    { num: stats.opened, label: "Tabs opened (all time)" },
    { num: stats.closed, label: "Tabs closed (all time)" },
    { num: stats.autoClosed, label: "Auto-closed (all time)" },
    { num: today.opened, label: "Opened today" },
    { num: today.closed, label: "Closed today" },
    { num: today.autoClosed, label: "Auto-closed today" },
  ];
  for (const c of cards) {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.innerHTML = `<div class="num">${c.num || 0}</div><div class="label">${escapeHtml(c.label)}</div>`;
    grid.appendChild(el);
  }
  $content.appendChild(grid);

  // Last 14 days table
  const days = Object.keys(stats.byDay).sort().reverse().slice(0, 14);
  if (days.length) {
    const table = document.createElement("table");
    table.className = "stats-table";
    table.innerHTML =
      "<thead><tr><th>Day</th><th>Opened</th><th>Closed</th><th>Auto-closed</th></tr></thead>";
    const tbody = document.createElement("tbody");
    for (const day of days) {
      const d = stats.byDay[day];
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(day)}</td><td>${d.opened || 0}</td><td>${d.closed || 0}</td><td>${d.autoClosed || 0}</td>`;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    $content.appendChild(table);
  }
}

// ---------------------------------------------------------------------------
// Settings view

async function renderSettingsView() {
  const settings = await getSettings();
  $content.textContent = "";

  const h2 = document.createElement("h2");
  h2.textContent = "Settings";
  h2.style.marginBottom = "14px";
  $content.appendChild(h2);

  const card = document.createElement("div");
  card.className = "card";
  card.style.padding = "6px 18px";

  const save = async (patch) => {
    const current = await getSettings();
    await chrome.storage.local.set({ settings: { ...current, ...patch } });
  };

  const row1 = document.createElement("div");
  row1.className = "settings-row";
  row1.innerHTML = `<label for="s-enabled">Auto-close inactive tabs<div class="meta">Closed tabs are saved to the "Auto Closed" collection. Pinned, audible, active and locked tabs are never closed.</div></label>`;
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.id = "s-enabled";
  enabled.checked = settings.autoCloseEnabled;
  enabled.addEventListener("change", () => save({ autoCloseEnabled: enabled.checked }));
  row1.appendChild(enabled);

  const row2 = document.createElement("div");
  row2.className = "settings-row";
  row2.innerHTML = `<label for="s-minutes">Close tabs inactive for (minutes)</label>`;
  const minutes = document.createElement("input");
  minutes.type = "number";
  minutes.id = "s-minutes";
  minutes.min = "1";
  minutes.value = settings.autoCloseMinutes;
  minutes.addEventListener("change", () =>
    save({ autoCloseMinutes: Math.max(1, Number(minutes.value) || 20) })
  );
  row2.appendChild(minutes);

  const row3 = document.createElement("div");
  row3.className = "settings-row";
  row3.innerHTML = `<label for="s-min-tabs">Never shrink a window below (tabs)</label>`;
  const minTabs = document.createElement("input");
  minTabs.type = "number";
  minTabs.id = "s-min-tabs";
  minTabs.min = "0";
  minTabs.value = settings.minTabsPerWindow;
  minTabs.addEventListener("change", () =>
    save({ minTabsPerWindow: Math.max(0, Number(minTabs.value) || 0) })
  );
  row3.appendChild(minTabs);

  const row4 = document.createElement("div");
  row4.className = "settings-row";
  row4.innerHTML = `<label for="s-cap">Keep at most this many links in "Auto Closed"</label>`;
  const cap = document.createElement("input");
  cap.type = "number";
  cap.id = "s-cap";
  cap.min = "10";
  cap.value = settings.autoClosedCap;
  cap.addEventListener("change", () =>
    save({ autoClosedCap: Math.max(10, Number(cap.value) || 200) })
  );
  row4.appendChild(cap);

  const row5 = document.createElement("div");
  row5.className = "settings-row";
  row5.innerHTML = `<label for="s-theme">Theme</label>`;
  const theme = document.createElement("select");
  theme.id = "s-theme";
  for (const t of THEMES) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    opt.selected = settings.theme === t.id;
    theme.appendChild(opt);
  }
  theme.addEventListener("change", async () => {
    await save({ theme: theme.value });
    await applyTheme();
  });
  row5.appendChild(theme);

  card.append(row1, row2, row3, row4, row5);
  $content.appendChild(card);

  renderImportExport();
}

// ---------------------------------------------------------------------------
// Import / export

function sanitizeImportedTabs(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .filter((t) => t && typeof t.url === "string" && t.url)
    .map((t) => ({
      id: uid(),
      title: String(t.title || hostnameOf(t.url)),
      url: t.url,
      addedAt: Number(t.addedAt) || now(),
    }));
}

// Accepts a TabKeeper export ({ collections: [...] }) or a bare array of
// collections. Ids are regenerated to avoid collisions with existing data.
function sanitizeImported(data) {
  const list = Array.isArray(data)
    ? data
    : data && Array.isArray(data.collections)
    ? data.collections
    : null;
  if (!list) {
    throw new Error('Expected { "collections": [...] } or an array of collections.');
  }
  const ts = now();
  return list.map((c) => ({
    id: uid(),
    name: String((c && c.name) || "Imported collection"),
    createdAt: Number(c && c.createdAt) || ts,
    updatedAt: Number(c && c.updatedAt) || ts,
    hidden: !!(c && c.hidden),
    folders: Array.isArray(c && c.folders)
      ? c.folders.map((f) => ({
          id: uid(),
          name: String((f && f.name) || "Folder"),
          createdAt: Number(f && f.createdAt) || ts,
          updatedAt: Number(f && f.updatedAt) || ts,
          hidden: !!(f && f.hidden),
          tabs: sanitizeImportedTabs(f && f.tabs),
        }))
      : [],
    tabs: sanitizeImportedTabs(c && c.tabs),
  }));
}

// Merges imported stats counters additively into the existing stats.
async function mergeImportedStats(imported) {
  if (!imported || typeof imported !== "object") return false;
  const stats = await getStats();
  for (const key of ["opened", "closed", "autoClosed"]) {
    stats[key] = (stats[key] || 0) + (Number(imported[key]) || 0);
  }
  if (imported.byDay && typeof imported.byDay === "object") {
    for (const [day, counts] of Object.entries(imported.byDay)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !counts) continue;
      const d = (stats.byDay[day] = stats.byDay[day] || { opened: 0, closed: 0, autoClosed: 0 });
      for (const key of ["opened", "closed", "autoClosed"]) {
        d[key] = (d[key] || 0) + (Number(counts[key]) || 0);
      }
    }
  }
  await chrome.storage.local.set({ stats });
  return true;
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function renderImportExport() {
  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = "Import / Export";
  $content.appendChild(title);

  const card = document.createElement("div");
  card.className = "card";
  card.style.padding = "6px 18px";

  const status = document.createElement("div");
  status.className = "io-status";
  const setStatus = (msg, isError) => {
    status.textContent = msg;
    status.classList.toggle("error", !!isError);
  };

  const rowExport = document.createElement("div");
  rowExport.className = "settings-row";
  rowExport.innerHTML = `<label>Export all collections as JSON</label>`;
  const exportBtn = document.createElement("button");
  exportBtn.textContent = "⬇ Export";
  exportBtn.addEventListener("click", async () => {
    const [collections, stats] = await Promise.all([getCollections(), getStats()]);
    downloadJson(`tabkeeper-export-${todayKey()}.json`, {
      app: "TabKeeper",
      version: 1,
      exportedAt: new Date().toISOString(),
      collections,
      stats,
    });
    setStatus(`Exported ${collections.length} collections.`);
  });
  rowExport.appendChild(exportBtn);

  const rowImport = document.createElement("div");
  rowImport.className = "settings-row";
  rowImport.innerHTML = `<label>Import collections from a JSON file<div class="meta">Imported collections are added alongside existing ones.</div></label>`;
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.style.display = "none";
  const importBtn = document.createElement("button");
  importBtn.textContent = "⬆ Import…";
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const imported = sanitizeImported(data);
      const collections = await getCollections();
      collections.push(...imported);
      await setCollections(collections);
      const mergedStats = await mergeImportedStats(data && data.stats);
      const links = imported.reduce((n, c) => n + collectionTabCount(c), 0);
      setStatus(
        `Imported ${imported.length} collections (${links} links)` +
          (mergedStats ? " and merged stats" : "") +
          ` from ${file.name}.`
      );
      renderSidebar();
    } catch (err) {
      setStatus(`Import failed: ${err.message}`, true);
    }
  });
  rowImport.append(importBtn, fileInput);

  card.append(rowExport, rowImport, status);
  $content.appendChild(card);
}

// ---------------------------------------------------------------------------
// Wiring

async function renderAll() {
  await renderSidebar();
  if (state.view === "search") await renderSearchView();
  else if (state.view === "stats") await renderStatsView();
  else if (state.view === "settings") await renderSettingsView();
  else await renderCollectionView();
}

document.getElementById("new-collection").addEventListener("click", () => {
  const name = prompt("Collection name:", "New collection");
  if (name === null) return;
  mutateCollections((cs) => {
    const col = makeCollection(name.trim() || "New collection");
    cs.push(col);
    state.view = "collection";
    state.selectedCollectionId = col.id;
    return col;
  });
});

document.querySelectorAll(".nav-btn").forEach((b) => {
  b.addEventListener("click", () => {
    state.view = b.dataset.view;
    renderAll();
  });
});

let searchTimer;
$searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = $searchInput.value;
    state.view = state.query.trim() ? "search" : "collection";
    renderAll();
  }, 150);
});

// Live-refresh when the background worker saves auto-closed tabs.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.settings) applyTheme();
  if (changes.collections || changes.stats) renderAll();
});

applyTheme();
renderAll();
