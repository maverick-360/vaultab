# Vaultab — Tab Manager, Auto-Close & Time Tracker

Vaultab is a Manifest V3 Chrome extension that brings together everything
you need to tame browser chaos: a full session manager with collections and
folders, smart auto-close that quietly sweeps away idle tabs and saves them
for later, per-site tab locking, time-spent analytics with donut charts and
weekday histograms, keyboard shortcuts, undo, themes, and import/export.

## Features

1. **Collections** — save sets of tabs into named collections. Rename them
   inline; each collection shows its created-at and updated-at timestamps.
2. **Folders** — group links inside a collection into folders, rename them,
   and drag links between folders (or back to the collection root) to move
   and reorder them. Collections can likewise be reordered by dragging in
   the sidebar.
3. **Site-name links** — saved links display the site's page title (falling
   back to hostname) with its favicon, and open in a new tab when clicked.
4. **Search** — the dashboard search matches site names, URLs, folder names,
   and collection names, with highlighted results.
5. **Auto-close** — tabs inactive for a configurable number of minutes
   (default 20) are closed automatically and saved to the **Auto Closed**
   collection so nothing is lost. Inside it, each link is filed into a
   folder named after its domain, grouping similar tabs together; closing
   the same URL again replaces the old entry instead of duplicating it,
   and the size cap applies across all folders (oldest links dropped,
   empty folders removed). Active, pinned, audible, and non-http(s) tabs
   are never touched, and a window is never shrunk below a configurable
   minimum tab count (default 5).
6. **Tab lock** — in the popup, click 🔓 next to any tab to lock it (🔒);
   locked tabs are exempt from auto-close. Locks last for the browser
   session (tab ids reset on restart). For permanent protection, click 📌
   to always lock the tab's site: locked sites are stored persistently,
   match subdomains too, and can be managed in **Settings → Locked sites**
   (patterns containing "/" match anywhere in the URL).
7. **Stats** — counts of opened, closed, and auto-closed tabs, all-time and
   per-day (last 14 days shown).
8. **Single-tab save** — the ➕ button next to any tab in the popup saves
   just that tab to an existing collection or a brand-new one.
9. **Themes** — Light, Dark, and Ocean, selectable in Settings; applies to
   both the popup and the dashboard.
10. **Import / export** — export all collections to a JSON file and import
    them back (imported collections are appended, ids regenerated). The
    accepted format is documented below under "Import format".
11. **Hide / unhide** — collections and folders can be hidden (🙈). Hidden
    collections move to a collapsible "Hidden" section in the sidebar;
    hidden folders disappear behind a "Show hidden folders" toggle in the
    collection view. Hidden items are excluded from search results.
12. **Duplicate detection** — repeated URLs within a collection get a "dup"
    badge and a one-click "Remove duplicates" toolbar button (keeps the
    first occurrence). The popup offers "Close duplicate tabs" for the
    current window, keeping the active tab of each group.
13. **Restore options** — open a collection's links in the current window
    or a new one; an optional corral-style setting removes links from
    their collection once opened.
14. **Auto-close countdown** — the popup shows estimated minutes until
    each tab auto-closes (∞ for exempt tabs: active, pinned, audible,
    locked, or on a locked site).
15. **Auto-close scope** — in Settings, choose whether auto-close applies
    to all sites, all sites *except* a pattern list (whitelist), or *only*
    the sites on the list (blacklist). Patterns follow the same rules as
    locked sites and persist across restarts.
16. **Stats visualization** — the Stats view renders a grouped bar chart
    (SVG, no libraries) of the last 14 days of opened/closed/auto-closed
    counts, plus a "Most auto-closed sites" top-10 ranking backed by
    uncapped per-hostname counters.
17. **Keyboard shortcuts** — Ctrl/Cmd+Shift+S saves the current tab to a
    "Quick saved" collection, Ctrl/Cmd+Shift+L toggles the current tab's
    lock, Ctrl/Cmd+Shift+K opens the dashboard. Rebind them at
    `chrome://extensions/shortcuts`. The toolbar badge flashes ✓ / L / U
    as feedback.
18. **Undo** — deleting a link, folder, or collection (or removing
    duplicates) shows a toast with an Undo button for ~6 seconds instead
    of a confirm dialog. Any newer edit invalidates the pending undo.
19. **Synced settings** — preferences live in `chrome.storage.sync` and
    follow you across machines signed into the same Chrome profile.
    Collections, stats, and site lists stay local.
20. **Time tracking** — the popup's ⏱ Time panel shows a donut chart of
    time spent per site with Today / Daily average / All-time views;
    click a slice or row to inspect it. Tracking follows the focused tab
    on http(s) pages, pauses after a configurable idle timeout (Chrome
    `idle` API), and flushes every minute. Settings offers the idle
    cutoff, chart gap, an optional toolbar-badge timer, CSV export,
    "Reset settings", and "Clear all data"; JSON export/import doubles
    as backup/restore and carries time data (merged additively).
21. **Time analytics** — the per-site list ends with a Total row and an
    expandable "Overall stats" block (first/last day, active days, most
    and least active day, today/all-time totals, daily and pure
    averages, a per-day timeline, and a Mo–Su weekday histogram).
    Clicking a site row expands the same detail for that domain, plus
    visited-days count, today/all-time rank, first/last visit, and an
    "Open" link.
22. **Tags** — links, folders, and collections can be tagged via their 🏷
    buttons (comma-separated input; tags are lowercased and deduped).
    Tags render as chips beside the item, clicking a chip searches it,
    and the dashboard search matches tags alongside names and URLs. Tags
    survive export/import.

## Install (developer mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Usage

- Click the toolbar icon for the popup, which has two switchable panels:
  **Auto Closed** lists that collection (click a link to reopen it, 🗑 to
  discard), and **Opened tabs** shows the current window's tabs with
  lock/pin/save controls and auto-close countdowns. Click a panel's tab to
  switch; the last choice is remembered. The **Dashboard** button opens
  the full manager.
- The dashboard (also at `dashboard.html`) manages collections, folders,
  search, stats, and settings.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest (`tabs`, `storage`, `alarms`, `favicon`, `idle`) |
| `background.js` | Service worker: activity tracking, auto-close sweep (1-min alarm), stats, time tracking |
| `popup.*` | Toolbar popup: tab list with lock toggles, save-window |
| `dashboard.*` | Full-page manager: collections, folders, search, stats, settings |
| `common.js` | Shared storage/formatting helpers |

## Data model

Stored in `chrome.storage.local`:

```
collections: [{ id, name, createdAt, updatedAt, tags?,
                folders: [{ id, name, createdAt, updatedAt, tags?, tabs: [...] }],
                tabs: [{ id, title, url, addedAt, lastOpenedAt?, tags? }] }]
lockedSites:   ["mail.google.com", ...]
autoCloseList: ["news.ycombinator.com", ...]
stats:       { opened, closed, autoClosed, byDay: { "YYYY-MM-DD": {...} },
               autoClosedSites: { hostname: count } }
timeSpent:   { "YYYY-MM-DD": { hostname: seconds } }
timeTrackingSince: timestamp
```

Stored in `chrome.storage.sync` (follows the Chrome profile):

```
settings:    { autoCloseEnabled, autoCloseMinutes, minTabsPerWindow,
               autoClosedCap, theme, restoreRemoves, autoCloseScope }
```

## Import format

Import accepts either a full export (`{ "collections": [...] }`) or a bare
array of collections. Only `url` is required per link; `title`, folder
names, and timestamps are optional and filled with sensible defaults. If
the file has a top-level `stats` object (`opened`, `closed`, `autoClosed`,
`byDay`), its counters are merged additively into your existing stats.

```json
{
  "collections": [
    {
      "name": "Research",
      "folders": [
        { "name": "Docs", "tabs": [{ "title": "MDN", "url": "https://developer.mozilla.org/" }] }
      ],
      "tabs": [{ "title": "Wikipedia", "url": "https://www.wikipedia.org/" }]
    }
  ]
}
```
