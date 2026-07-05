# Changelog

All notable changes to Vaultab are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-07-05

Initial release, developed as **TabKeeper** and renamed to **Vaultab** before
release.

### Added

#### Collections & organisation
- Collections of saved tabs with inline rename and created/updated timestamps
  (`0c3a620`)
- Folders inside collections; links display site name and favicon (`0c3a620`)
- Drag-and-drop reordering for sidebar collections and for links between
  folders, replacing the move dropdown (`c672f40`)
- Hide/unhide for collections and folders, excluded from search (`7e5c1f6`)
- Tags on links, folders, and collections — clickable chips, searchable,
  preserved on export/import (`49bdb5a`)
- Duplicate detection: "dup" badges, one-click remove-duplicates per
  collection, and close-duplicate-tabs for the current window (`b13f542`)
- Search across site names, URLs, folder, collection names — and later
  tags — with highlighted results (`0c3a620`, `49bdb5a`)

#### Auto-close
- Background sweep that closes inactive tabs (configurable threshold,
  minimum tabs per window) into an "Auto Closed" collection (`0c3a620`)
- Per-tab session locks and countdown estimates in the popup (`0c3a620`,
  `b13f542`)
- Persistent site locks (📌) that survive browser restarts, with
  subdomain-aware pattern matching (`8814ff2`)
- Whitelist/blacklist scope: auto-close all sites, all except a list, or
  only listed sites (`ce3c0e2`)
- Auto-closed tabs grouped into per-domain folders with duplicate-URL
  replacement and a cap across folders (`e95eb3e`)

#### Popup
- Tabbed panels: Auto Closed (click to reopen) and Opened tabs, with the
  last-used panel remembered (`08fc0e8`)
- Single-tab save (➕) into an existing or new collection (`ad89aea`)
- Save-window-to-collection and last-opened relative times on links
  (`0c3a620`, `08fc0e8`)

#### Time tracking
- Per-site time tracking (focused tab, idle-aware) with a donut chart,
  Today / Daily average / All-time views, per-site list with Total row
  (`4ebe073`)
- Drill-down analytics: overall and per-domain stats, ranks, first/last
  visit, daily/pure averages, per-day timeline, weekday histogram
  (`4ebe073`)
- Optional toolbar badge showing today's time on the current site, CSV
  export, and clear-data/reset-settings actions (`4ebe073`)

#### Stats, restore & workflow
- Opened/closed/auto-closed counters, per-day history, 14-day SVG bar
  chart, and most-auto-closed-sites ranking (`0c3a620`, `7c69a6c`)
- Restore options: open a collection in the current or a new window;
  optional corral mode that removes links once opened (`b13f542`)
- Undo toasts for deletions instead of confirm dialogs (`7c69a6c`)
- Keyboard shortcuts: save current tab, toggle lock, open dashboard
  (`7c69a6c`)
- Settings synced via `chrome.storage.sync` across Chrome profiles
  (`7c69a6c`)
- Themes: Light, Dark, Ocean (`ad89aea`); Catppuccin Mocha (`c623b54`)
- JSON import/export as full backup (collections, stats, time data) plus
  a Tab Wrangler migration converter (`ad89aea`, `c2b921d`)

#### Branding & docs
- Vault-wheel icon set (16/32/48/128) and Web Store promo tile (`ad069b7`)
- Chrome Web Store listing draft and GitHub-ready README with badges,
  hero banner, and illustrative SVG mockups (`49bdb5a`, `fa626cc`,
  `829d924`, `4467cfa`)

### Changed
- Renamed the project from TabKeeper to Vaultab throughout the codebase
  and documentation (`7ecfb78`)

[1.0.0]: https://github.com/maverick-360/vaultab/releases/tag/v1.0.0
