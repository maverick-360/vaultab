async function render() {
  const [tabs, lockedTabs, settings] = await Promise.all([
    chrome.tabs.query({ currentWindow: true }),
    getLockedTabs(),
    getSettings(),
  ]);

  const list = document.getElementById("tab-list");
  list.textContent = "";

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

    li.append(img, title, addBtn, lockBtn);
    li.addEventListener("click", (e) => {
      if (e.target === lockBtn || e.target === addBtn) return;
      chrome.tabs.update(tab.id, { active: true });
    });
    list.appendChild(li);
  }

  const status = document.getElementById("autoclose-status");
  status.textContent = settings.autoCloseEnabled
    ? `Auto-close: on — tabs inactive for ${settings.autoCloseMinutes} min are saved to "Auto Closed" and closed.`
    : "Auto-close: off (enable it from the Dashboard).";
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

applyTheme();
render();
