# TabKeeper — Sessions & Auto-Close

A Chrome extension (Manifest V3) that combines a session manager with an
inactive-tab auto-closer.

## Features

1. **Collections** — save sets of tabs into named collections. Rename them
   inline; each collection shows its created-at and updated-at timestamps.
2. **Folders** — group links inside a collection into folders, rename them,
   and move links between folders with the per-link dropdown.
3. **Site-name links** — saved links display the site's page title (falling
   back to hostname) with its favicon, and open in a new tab when clicked.
4. **Search** — the dashboard search matches site names, URLs, folder names,
   and collection names, with highlighted results.
5. **Auto-close** — tabs inactive for a configurable number of minutes
   (default 20) are closed automatically and saved to the **Auto Closed**
   collection so nothing is lost. Active, pinned, audible, and
   non-http(s) tabs are never touched, and a window is never shrunk below a
   configurable minimum tab count (default 5).
6. **Tab lock** — in the popup, click 🔓 next to any tab to lock it (🔒);
   locked tabs are exempt from auto-close. Locks last for the browser
   session (tab ids reset on restart).
7. **Stats** — counts of opened, closed, and auto-closed tabs, all-time and
   per-day (last 14 days shown).
8. **Single-tab save** — the ➕ button next to any tab in the popup saves
   just that tab to an existing collection or a brand-new one.
9. **Themes** — Light, Dark, and Ocean, selectable in Settings; applies to
   both the popup and the dashboard.
10. **Import / export** — export all collections to a JSON file and import
    them back (imported collections are appended, ids regenerated). A sample
    file, [example-import.json](example-import.json), can be downloaded from
    Settings; it shows the accepted format.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Usage

- Click the toolbar icon for the popup: lock/unlock tabs, save the current
  window as a collection, or open the **Dashboard**.
- The dashboard (also at `dashboard.html`) manages collections, folders,
  search, stats, and settings.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`tabs`, `storage`, `alarms`, `favicon`) |
| `background.js` | Service worker: activity tracking, auto-close sweep (1-min alarm), stats |
| `popup.*` | Toolbar popup: tab list with lock toggles, save-window |
| `dashboard.*` | Full-page manager: collections, folders, search, stats, settings |
| `common.js` | Shared storage/formatting helpers |

## Data model

Stored in `chrome.storage.local`:

```
collections: [{ id, name, createdAt, updatedAt,
                folders: [{ id, name, createdAt, updatedAt, tabs: [...] }],
                tabs: [{ id, title, url, addedAt }] }]
settings:    { autoCloseEnabled, autoCloseMinutes, minTabsPerWindow,
               autoClosedCap, theme }
stats:       { opened, closed, autoClosed, byDay: { "YYYY-MM-DD": {...} } }
```

## Import format

Import accepts either a full export (`{ "collections": [...] }`) or a bare
array of collections. Only `url` is required per link; `title`, folder
names, and timestamps are optional and filled with sensible defaults. See
[example-import.json](example-import.json).

Per-browser-session state (`chrome.storage.session`): `tabActivity`
(last-used timestamps) and `lockedTabs`.
