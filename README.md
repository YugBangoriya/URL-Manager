# urlmgr — Personal URL Manager

A single-file personal URL manager built to replace scattered bookmarking tools. No backend, no accounts, no cost — one HTML file that runs anywhere.

**Live demo:** https://yugbangoriya.github.io/URL-Manager/url-manager.html

---

## The Problem

Information accumulates from everywhere — browser bookmarks, Notion databases, Google Drive folders, Instagram saves, WhatsApp links. Every tool either does too much (Notion is a full workspace, not a link store) or too little (browser bookmarks have no structure, no descriptions, no organisation across devices).

The specific need: a purpose-built place to store links by project and category, find them instantly, and access them from any device without creating an account or paying for anything.

No existing tool fit. So this one was built.

---

## What Was Built

A single `.html` file (~95 KB) with all CSS and JavaScript inline. It runs by opening it in a browser. No server. No build step. No dependencies except Google Fonts.

**Features:**
- **Sheets** — multiple named workspaces (College, Business, Personal…)
- **Folders** — categories within each sheet, collapse/expand, drag to reorder
- **Links** — name, URL, description; inline editing; click to open; one-click copy
- **Global search** — searches all sheets and folders simultaneously, live results, click to navigate
- **Export/Import** — download a dated JSON backup, import it on any device
- **Light/Dark mode** — theme preference saved
- **Drag-to-reorder** — sheets, folders, and links all support drag-and-drop reordering
- **Auto-save** — every change is written to `localStorage` immediately

**Cross-device sync workflow:** Export JSON on laptop → save to Google Drive → import on phone. Deliberate design choice — no auth complexity, no cost, full data ownership.

---

## How to Use

1. Open `url-manager.html` in any modern browser.
2. Click `+` in the bottom bar to create a sheet.
3. Click `+ Add Folder` to create a folder in the active sheet.
4. Click `+ Add Link` inside a folder to add a link.
5. Click any cell to edit it inline. Press Enter or click away to save.
6. Use the search bar to find anything across all sheets instantly.

---

## How to Back Up Your Data

1. Click the **↓ Export** button in the top bar.
2. A file named `url-manager-YYYY-MM-DD.json` downloads to your device.
3. Save it to Google Drive, iCloud, or wherever you keep backups.

To restore or sync to another device: click **↑ Import**, choose the JSON file, confirm.

---

## How to Deploy (GitHub Pages)

1. Create a new repository on GitHub (public or private).
2. Upload `url-manager.html` to the repository root.
3. Go to **Settings → Pages → Source** → choose `main` branch → Save.
4. Your URL manager is now live at `https://yourusername.github.io/repo-name/url-manager.html`.

---

## How This Was Built

This tool is a demonstration of AI Product Management: identifying a real personal problem, defining requirements with precision, and using AI to execute the solution completely.

### The Approach

Rather than writing code, the work was done at the specification layer. A Product Requirements Document (PRD) was written first — covering the exact problem, the tech stack, a complete design system (CSS tokens, font choices, colour values), every functional requirement in detail, and the full data model. The AI then executed against that spec across five structured phases.

The quality of the output is a direct function of the quality of the input. Precise instructions produce precise software.

### Condensed PRD

**Problem:** Personal links accumulate from everywhere. Existing tools are either overkill (Notion) or too limited (browser bookmarks). Needed: a purpose-built link manager structured for rapid storage and retrieval.

**Tech decisions:**
| Decision | Choice | Reason |
|---|---|---|
| File type | Single `.html` | No build process, fully portable |
| Storage | `localStorage` | Free, instant, no backend |
| Hosting | GitHub Pages | Free, accessible from any device |
| Sync | Manual Export/Import JSON | No auth complexity |
| Cost | ₹0 | Hard requirement |

**Design system:** Syne (headings) · DM Mono (metadata) · DM Sans (body). Colour palette: deep ember darks (`#020101` → `#2d1610`) with rust accent (`#b7410e`). Full light mode override.

**Data model:** `version` + `settings` (theme, activeSheetId) + `sheets[]` (folders[] → links[]). Stored under `localStorage` key `urlmanager_v1`. Export serialises this structure as-is.

**Phases executed:**
1. Shell + Sheets — tab bar, CRUD, drag-to-reorder, localStorage, empty states
2. Folders + Links — folder/link CRUD, inline editing, copy button, drag-to-reorder
3. Search — global search across all sheets, 200ms debounce, navigate-to-result with highlight
4. Export / Import + Light Mode — JSON backup/restore, import validation, theme toggle
5. Polish — responsive layout (375px), micro-animations, edge case hardening, code comments

The specification quality — not AI capability alone — determines what gets built. This README is part of that demonstration.