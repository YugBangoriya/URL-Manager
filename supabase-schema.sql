-- ═══════════════════════════════════════════════════════════════════════
-- URL Manager — Phase 6 Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- Execute once. Safe to re-run (IF NOT EXISTS guards included).
-- ═══════════════════════════════════════════════════════════════════════


-- ── Extensions ────────────────────────────────────────────────────────
-- gen_random_uuid() is built into Postgres 13+; this is a safety net
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ══════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════

-- ── sheets ────────────────────────────────────────────────────────────
-- One row per sheet (tab) in the app.
-- is_public = true  → visible to unauthenticated viewers
-- is_public = false → admin-only, never exposed via viewer mode
CREATE TABLE IF NOT EXISTS sheets (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name           TEXT        NOT NULL DEFAULT 'My Links',
  last_edit_date DATE        NOT NULL DEFAULT CURRENT_DATE,
  "order"        INTEGER     NOT NULL DEFAULT 0,
  is_public      BOOLEAN     NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── folders ───────────────────────────────────────────────────────────
-- One row per folder within a sheet.
CREATE TABLE IF NOT EXISTS folders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id   UUID        NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name       TEXT        NOT NULL DEFAULT 'New Folder',
  collapsed  BOOLEAN     NOT NULL DEFAULT false,
  "order"    INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── links ─────────────────────────────────────────────────────────────
-- One row per link within a folder.
CREATE TABLE IF NOT EXISTS links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id   UUID        NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name        TEXT        NOT NULL DEFAULT '',
  url         TEXT        NOT NULL DEFAULT '',
  description TEXT        NOT NULL DEFAULT '',
  "order"     INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- RLS is the real security gate. Client-side role checks are
-- supplementary UI only — they never replace these policies.
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE sheets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE links   ENABLE ROW LEVEL SECURITY;


-- ── sheets: Admin (authenticated) ─────────────────────────────────────
-- Full CRUD. user_id must equal the authenticated caller.
-- WITH CHECK ensures nobody can insert/update rows with a foreign user_id.
CREATE POLICY "admin_sheets_all"
  ON sheets
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── sheets: Viewer (anonymous) ────────────────────────────────────────
-- Read-only. Only rows where is_public = true are visible.
CREATE POLICY "viewer_sheets_select"
  ON sheets
  FOR SELECT
  TO anon
  USING (is_public = true);


-- ── folders: Admin ────────────────────────────────────────────────────
CREATE POLICY "admin_folders_all"
  ON folders
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── folders: Viewer ───────────────────────────────────────────────────
-- Only folders whose parent sheet is public.
-- The EXISTS subquery runs server-side; no sheet data leaks to the client.
CREATE POLICY "viewer_folders_select"
  ON folders
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM   sheets
      WHERE  sheets.id        = folders.sheet_id
        AND  sheets.is_public = true
    )
  );


-- ── links: Admin ──────────────────────────────────────────────────────
CREATE POLICY "admin_links_all"
  ON links
  FOR ALL
  TO authenticated
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── links: Viewer ─────────────────────────────────────────────────────
-- Only links whose parent folder sits inside a public sheet.
CREATE POLICY "viewer_links_select"
  ON links
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1
      FROM   folders
      JOIN   sheets ON sheets.id        = folders.sheet_id
      WHERE  folders.id                  = links.folder_id
        AND  sheets.is_public            = true
    )
  );


-- ══════════════════════════════════════════════════════════════════════
-- INDEXES
-- Covering the most frequent query patterns.
-- ══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_sheets_user_id    ON sheets  (user_id);
CREATE INDEX IF NOT EXISTS idx_sheets_is_public  ON sheets  (is_public);
CREATE INDEX IF NOT EXISTS idx_sheets_order      ON sheets  (user_id, "order");

CREATE INDEX IF NOT EXISTS idx_folders_sheet_id  ON folders (sheet_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id   ON folders (user_id);
CREATE INDEX IF NOT EXISTS idx_folders_order     ON folders (sheet_id, "order");

CREATE INDEX IF NOT EXISTS idx_links_folder_id   ON links   (folder_id);
CREATE INDEX IF NOT EXISTS idx_links_user_id     ON links   (user_id);
CREATE INDEX IF NOT EXISTS idx_links_order       ON links   (folder_id, "order");


-- ══════════════════════════════════════════════════════════════════════
-- POST-SETUP CHECKLIST (run manually in Dashboard after this script)
-- ══════════════════════════════════════════════════════════════════════
-- 1. Authentication → Providers → Email: enable "Email + Password" ✓
-- 2. Authentication → Providers → Email: enable "Magic Links"       ✓
-- 3. Authentication → Users → Invite user with your email address   ✓
--    (or sign up via the app — first user becomes the admin)
-- 4. Authentication → Settings → "Enable email confirmations": OFF  ✓
--    (single-user app; email confirmation just adds friction)
-- 5. Authentication → Settings → JWT expiry: 604800 (7 days)        ✓
-- 6. API → copy Project URL and anon key → paste into app/.env      ✓
-- ══════════════════════════════════════════════════════════════════════
