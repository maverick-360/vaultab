#!/usr/bin/env python3
"""Convert a Tab Wrangler export into a TabKeeper import file.

Usage: python3 convert-tabwrangler.py TabWranglerExport.json [output.json]

Produces one collection per calendar month (based on each tab's closedAt),
with a folder per domain that has FOLDER_THRESHOLD+ tabs that month; the
rest of the month's links stay at the collection root. Tab Wrangler's
lifetime counters are mapped onto TabKeeper stats:

  totalTabsRemoved  -> stats.closed
  totalTabsWrangled -> stats.autoClosed
  (opens are not tracked by Tab Wrangler, so stats.opened stays 0)

Per-day stats are reconstructed from the saved tabs' closedAt timestamps.
"""

import json
import sys
from collections import defaultdict
from datetime import date, datetime
from urllib.parse import urlparse

FOLDER_THRESHOLD = 5


def domain_of(url):
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        host = ""
    return host.removeprefix("www.") or "other"


def month_key(ts_ms):
    return datetime.fromtimestamp(ts_ms / 1000).strftime("%Y-%m")


def month_label(key):
    return datetime.strptime(key, "%Y-%m").strftime("%b %Y")


def day_key(ts_ms):
    return date.fromtimestamp(ts_ms / 1000).isoformat()


def make_entry(tab):
    return {
        "title": (tab.get("title") or "").strip() or domain_of(tab.get("url", "")),
        "url": tab["url"],
        "addedAt": int(tab["closedAt"]),
    }


def convert(data):
    tabs = [t for t in data.get("savedTabs", []) if t.get("url") and t.get("closedAt")]

    by_month = defaultdict(list)
    for tab in tabs:
        by_month[month_key(tab["closedAt"])].append(tab)

    collections = []
    for mkey in sorted(by_month, reverse=True):  # newest collection first
        month_tabs = sorted(by_month[mkey], key=lambda t: t["closedAt"], reverse=True)

        by_domain = defaultdict(list)
        for tab in month_tabs:
            by_domain[domain_of(tab["url"])].append(tab)

        folders = []
        root = []
        for dom in sorted(by_domain, key=lambda d: len(by_domain[d]), reverse=True):
            dom_tabs = by_domain[dom]
            if len(dom_tabs) >= FOLDER_THRESHOLD:
                folders.append(
                    {
                        "name": dom,
                        "createdAt": min(t["closedAt"] for t in dom_tabs),
                        "updatedAt": max(t["closedAt"] for t in dom_tabs),
                        "tabs": [make_entry(t) for t in dom_tabs],
                    }
                )
            else:
                root.extend(dom_tabs)
        root.sort(key=lambda t: t["closedAt"], reverse=True)

        collections.append(
            {
                "name": f"Tab Wrangler · {month_label(mkey)}",
                "createdAt": min(t["closedAt"] for t in month_tabs),
                "updatedAt": max(t["closedAt"] for t in month_tabs),
                "folders": folders,
                "tabs": [make_entry(t) for t in root],
            }
        )

    by_day = defaultdict(lambda: {"opened": 0, "closed": 0, "autoClosed": 0})
    for tab in tabs:
        d = by_day[day_key(tab["closedAt"])]
        d["closed"] += 1
        d["autoClosed"] += 1

    stats = {
        "opened": 0,
        "closed": int(data.get("totalTabsRemoved", 0)),
        "autoClosed": int(data.get("totalTabsWrangled", 0)),
        "byDay": dict(sorted(by_day.items())),
    }

    return {
        "app": "TabKeeper",
        "version": 1,
        "exportedAt": datetime.now().astimezone().isoformat(),
        "convertedFrom": "Tab Wrangler",
        "collections": collections,
        "stats": stats,
    }


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "TabKeeper-import.json"

    with open(src) as f:
        data = json.load(f)
    result = convert(data)

    with open(out, "w") as f:
        json.dump(result, f, indent=1)

    n_tabs = sum(
        len(c["tabs"]) + sum(len(fo["tabs"]) for fo in c["folders"])
        for c in result["collections"]
    )
    n_folders = sum(len(c["folders"]) for c in result["collections"])
    print(
        f"Wrote {out}: {len(result['collections'])} collections, "
        f"{n_folders} folders, {n_tabs} links, "
        f"stats closed={result['stats']['closed']} autoClosed={result['stats']['autoClosed']}"
    )


if __name__ == "__main__":
    main()
