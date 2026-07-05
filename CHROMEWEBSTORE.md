# Chrome Web Store Listing — Vaultab

> Last Updated: 2026-07-05

---

## Store Listing

**Extension Name** ✅
```
Vaultab - Tab Manager, Auto-Close & Time Tracker
```
<!-- 49 chars — well within the 75-char limit -->

---

**Short Description** ✅
```
Save tabs into collections, auto-close idle tabs, lock sites, and track time spent per website — all locally.
```
<!-- 110 chars — within the 132-char limit -->

---

**Detailed Description** ✅

Paste the following into the Chrome Developer Dashboard description field:

```
Vaultab keeps your browser tidy without losing anything. It saves tabs into named collections and folders, silently closes idle ones, and tracks how long you spend on every site.

COLLECTIONS & FOLDERS
Organise saved links into named collections and sub-folders. Drag links between folders or reorder them. Rename anything inline. Collections and folders can be hidden when not needed and restored with one click.

AUTO-CLOSE
Tabs left idle for a configurable time (default 20 minutes) are automatically closed and filed into an "Auto Closed" collection — grouped by domain, with duplicates deduplicated. Active, pinned, audible, and locked tabs are never touched. A configurable minimum tab count prevents a window from getting too empty.

TAB LOCKING
Lock individual tabs for the browser session (lock icon), or permanently lock a site so it is always exempt from auto-close (pin icon). Locked sites are stored persistently and match subdomains. Manage them in Settings > Locked sites. Auto-close scope can be set to all sites, a whitelist, or a blacklist.

POPUP PANELS
The toolbar popup has two panels: Auto Closed (quick access to recently saved tabs) and Opened Tabs (all current tabs with lock/save controls and countdown to auto-close).

SEARCH & DUPLICATE DETECTION
Instant search across all collection names, folder names, page titles, and URLs with highlighted results. Duplicate URLs within a collection are flagged with a "dup" badge and removable in one click. The popup also offers "Close duplicate tabs" for the current window.

TIME TRACKING & ANALYTICS
The popup's Time panel shows a donut chart of time spent per site (Today / Daily average / All-time). Click any slice or row to see per-site detail: first and last visit, visited-days count, rank, and a weekday histogram. Tracking pauses when Chrome is idle and flushes every minute.

IMPORT / EXPORT
Export all collections to a JSON file and import them back on any machine. Importing appends collections without overwriting existing ones. Stats are merged additively. CSV export of time data is also available.

KEYBOARD SHORTCUTS
Cmd/Ctrl+Shift+S — save current tab to "Quick saved"
Cmd/Ctrl+Shift+L — toggle lock on current tab
Cmd/Ctrl+Shift+K — open the dashboard
Rebind any shortcut at chrome://extensions/shortcuts.

UNDO
Deleting a link, folder, or collection shows an Undo toast for 6 seconds — no irreversible confirm dialogs.

THEMES
Light, Dark, and Ocean themes apply to both the popup and the dashboard.

PRIVACY
Everything stays on your device. No data is sent to any server. No analytics. No accounts required.
```

---

**Category**
```
Productivity
```

**Single Purpose**
```
Saves browser tabs into organised collections, automatically closes idle tabs, and tracks time spent per website.
```

**Primary Language**
```
English
```

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Extension Icon 48px | 48×48 PNG | ✅ Ready | `icons/icon48.png` |
| Extension Icon 16px | 16×16 PNG | ✅ Ready | `icons/icon16.png` |
| Screenshot 1 — Popup (Opened Tabs panel) | 1280×800 or 640×400 | ⬜ Needed | |
| Screenshot 2 — Dashboard (collections view) | 1280×800 or 640×400 | ⬜ Needed | |
| Screenshot 3 — Time tracking donut chart | 1280×800 or 640×400 | ⬜ Needed | |
| Screenshot 4 — Stats bar chart | 1280×800 or 640×400 | ⬜ Needed | |
| Screenshot 5 — Settings panel | 1280×800 or 640×400 | ⬜ Needed | |
| Small Promo Tile | 440×280 | ⬜ Needed | |
| Marquee Promo Tile | 1400×560 | ⬜ Optional | |

### Screenshot Notes

1. **Popup — Opened Tabs panel**: Show several tabs with lock icons, auto-close countdown timers, and the ➕ save button visible.
2. **Dashboard**: Show a collection open with 2–3 folders and links inside, sidebar visible on the left.
3. **Time tracking**: Show the donut chart in the Time panel with 3–4 sites, one row expanded with detail.
4. **Stats**: Show the SVG bar chart (14-day opened/closed/auto-closed) plus the "Most auto-closed sites" table.
5. **Settings**: Show the Settings view — auto-close scope dropdown, locked sites list, and theme selector visible.

> Tip: Use a 1280×800 browser window. Do not include personal tabs/history in screenshots.

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `tabs` | permissions | Required to read tab titles, URLs, and activity state. Vaultab displays open tabs in the popup, detects idle tabs for auto-close, saves them with the correct title and URL, and offers "Close duplicate tabs". Without this permission, `tab.url` and `tab.title` return `undefined`. |
| `storage` | permissions | Required to persist all user data on-device: saved collections, folders and links, locked sites, auto-close site lists, daily stats, and per-site time-tracking data. User preferences are stored in `chrome.storage.sync` (synced via Chrome's own infrastructure to the user's other devices). No data leaves to any developer-controlled server. |
| `alarms` | permissions | Required to schedule the 1-minute recurring sweep that checks whether any tabs have been idle long enough to trigger auto-close. `chrome.alarms` is the only reliable periodic timer in a Manifest V3 service worker — `setTimeout` and `setInterval` are terminated when the service worker goes idle. |
| `favicon` | permissions | Required to display site favicons alongside saved links in collections. Uses Chrome's internal `chrome.runtime.getURL("_favicon/?pageUrl=...")` API. This is a browser-local call — no external network request is made. |
| `idle` | permissions | Required by the time-tracking feature to detect when Chrome itself is idle (no user input), so the timer pauses and does not incorrectly credit idle time to a site. Uses `chrome.idle.queryState` with a user-configurable cutoff (default: 5 minutes). |

> No `host_permissions` are requested. Vaultab does not inject content scripts, intercept network requests, or read page content beyond the metadata already visible in the tab strip.

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** Yes — stored locally on the user's device only.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | — | No |
| Health info | No | No | — | No |
| Financial info | No | No | — | No |
| Authentication info | No | No | — | No |
| Personal communications | No | No | — | No |
| Location | No | No | — | No |
| Web history | Yes — page title + URL of saved/auto-closed tabs | No — `chrome.storage.local` only | Populating saved collections and Auto Closed history | No |
| User activity | Yes — seconds spent per hostname per day | No — `chrome.storage.local` only | Time-tracking donut chart and analytics in the popup | No |
| Website content | No | No | — | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL**: ⬜ To be created and hosted before submission.

Suggested host: GitHub Pages — add a `docs/privacy.md` to the repo and enable GitHub Pages on the `docs/` folder. The URL will be `https://<username>.github.io/<repo>/privacy`.

### Draft Privacy Policy (ready to publish)

```
Privacy Policy for Vaultab
Last updated: 2026-07-05

Vaultab is a Chrome browser extension. This policy explains what data the
extension stores and how it is used.

WHAT DATA IS STORED
Vaultab stores the following data on your device:

- Page titles and URLs of tabs you save manually or that are auto-closed.
  Stored in chrome.storage.local (stays on your device).

- Time spent on each website hostname, in seconds per day.
  Stored in chrome.storage.local (stays on your device).

- User preferences: theme, auto-close timer, minimum tab count, idle cutoff,
  and site lists (whitelist / blacklist / locked sites).
  Stored in chrome.storage.sync, which Chrome syncs to your other devices
  signed into the same Google account via Google's own infrastructure.

HOW DATA IS USED
Saved tab titles and URLs are used solely to display your saved collections
and Auto Closed history inside the extension.
Time-spent data is used solely to power the time-tracking chart and analytics
shown in the extension popup.
Preferences are used solely to control the extension's behaviour.

THIRD-PARTY SERVICES
Vaultab does not use any third-party analytics, advertising, or tracking
services. No data is sent to any server operated by the developer.
The favicon feature uses Chrome's internal _favicon API — a browser-local
call that does not contact external servers.

DATA SHARING
No data is shared with any third party under any circumstances.

DATA RETENTION AND DELETION
Data remains on your device until you remove it. You can clear all data via
Settings > Clear all data inside the extension. Uninstalling the extension
removes all locally stored data.

CHANGES TO THIS POLICY
If this policy changes, the "Last updated" date will be updated.

CONTACT
For privacy questions: [your-email@example.com]
or open an issue at: [https://github.com/you/vaultab/issues]
```

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free  

---

## Developer Info

**Publisher Name**: [REQUIRED — your name or organisation]  
**Contact Email**: [REQUIRED — displayed publicly on the store listing]  
**Support URL**: [e.g. https://github.com/you/vaultab/issues]  
**Homepage URL**: [e.g. https://github.com/you/vaultab]  

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-07-05 | Initial release — collections, folders, drag-and-drop, auto-close with domain grouping, tab locking, locked sites, auto-close scope, time tracking, time analytics, stats chart, import/export, themes, keyboard shortcuts, undo toasts, duplicate detection, restore options, hide/unhide, synced settings | Draft |

---

## Pre-Publish Checklist

### Code
- [x] Manifest V3 — no V2 APIs used
- [x] All 3 icon files exist (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`)
- [x] `"action"` key present in manifest (required for `chrome.action.*`)
- [x] `tabs` permission declared
- [x] Service worker uses `chrome.alarms` for periodic work
- [ ] Confirm no `eval()` or `new Function()` calls in any extension page

### Store Assets
- [ ] At least 1 screenshot at 1280×800 or 640×400
- [ ] Privacy policy hosted at a live URL (HTTP 200)

### Chrome Developer Dashboard
- [ ] Privacy policy URL entered
- [ ] Permissions justification filled (copy from the table above)
- [ ] Data use disclosure form completed (matches the table above)
- [ ] Short description pasted
- [ ] Detailed description pasted

### ZIP Package
Create the ZIP from the extension folder, **excluding**:
```
.git/
.gitignore
CHROMEWEBSTORE.md
README.md
*.py
*Export*.json
*import*.json
*categorized*.json
```

Recommended command:
```bash
cd /Users/soumavodey/Documents
zip -r vaultab-1.0.0.zip chrome-extension/ \
  --exclude "chrome-extension/.git/*" \
  --exclude "chrome-extension/.gitignore" \
  --exclude "chrome-extension/CHROMEWEBSTORE.md" \
  --exclude "chrome-extension/README.md" \
  --exclude "chrome-extension/*.py" \
  --exclude "chrome-extension/*.json" \
  --include "chrome-extension/manifest.json"
```

> Note: The `--include manifest.json` ensures the manifest is in the ZIP even with the broad `*.json` exclude. Alternatively, manually exclude only the data files.

---

## Review Notes

### Known Issues / Limitations
- The `favicon` permission may draw reviewer attention. The justification (Chrome-internal `_favicon` API, no external request) is accurate and specific — include it verbatim in the Dashboard's permission justification form.
- `idle` is a less common permission. The justification ties it to a specific user-facing feature (time-tracking pause on idle) which is what reviewers look for.

### Rejection History
<!-- None yet — first submission -->
