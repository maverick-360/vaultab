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
- Folders inside collections; links display site name and favicon
- Drag-and-drop reordering for sidebar collections and for links between
  folders, replacing the move dropdown
- Hide/unhide for collections and folders, excluded from search
- Tags on links, folders, and collections — clickable chips, searchable,
  preserved on export/import
- Duplicate detection: "dup" badges, one-click remove-duplicates per
  collection, and close-duplicate-tabs for the current window
- Search across site names, URLs, folder, collection names — and later
  tags — with highlighted results

#### Auto-close
- Background sweep that closes inactive tabs (configurable threshold,
  minimum tabs per window) into an "Auto Closed" collection
- Per-tab session locks and countdown estimates in the popup
- Persistent site locks (📌) that survive browser restarts, with
  subdomain-aware pattern matching
- Whitelist/blacklist scope: auto-close all sites, all except a list, or
  only listed sites
- Auto-closed tabs grouped into per-domain folders with duplicate-URL
  replacement and a cap across folders

#### Popup
- Tabbed panels: Auto Closed (click to reopen) and Opened tabs, with the
  last-used panel remembered
- Single-tab save (➕) into an existing or new collection
- Save-window-to-collection and last-opened relative times on links

#### Time tracking
- Per-site time tracking (focused tab, idle-aware) with a donut chart,
  Today / Daily average / All-time views, per-site list with Total row
- Drill-down analytics: overall and per-domain stats, ranks, first/last
  visit, daily/pure averages, per-day timeline, weekday histogram
- Optional toolbar badge showing today's time on the current site, CSV
  export, and clear-data/reset-settings actions

#### Stats, restore & workflow
- Opened/closed/auto-closed counters, per-day history, 14-day SVG bar
  chart, and most-auto-closed-sites ranking
- Restore options: open a collection in the current or a new window;
  optional corral mode that removes links once opened
- Undo toasts for deletions instead of confirm dialogs
- Keyboard shortcuts: save current tab, toggle lock, open dashboard
- Settings synced via `chrome.storage.sync` across Chrome profiles
- Themes: Light, Dark, Ocean ; Catppuccin Mocha
- JSON import/export as full backup (collections, stats, time data) plus
  a Tab Wrangler migration converter

#### Branding & docs
- Vault-wheel icon set (16/32/48/128) and Web Store promo tile
- Chrome Web Store listing draft and GitHub-ready README with badges,
  hero banner, and illustrative SVG mockups

### Changed
- Renamed the project from TabKeeper to Vaultab throughout the codebase
  and documentation

[1.0.0]: https://github.com/maverick-360/vaultab/releases/tag/v1.0.0
