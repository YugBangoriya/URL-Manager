/**
 * db.js — all database operations for URL Manager Phase 6
 *
 * Every function returns { data, error } (Supabase convention).
 * The caller decides how to handle errors.
 * No raw SQL here — all queries go through the Supabase SDK which
 * uses parameterized queries internally. SQL injection is structurally impossible.
 *
 * RLS enforcement: authenticated users access their own rows only.
 * Unauthenticated callers (anon role) access public-sheet rows only.
 * Neither can be overridden client-side — it is enforced at the DB layer.
 */

import { supabase } from './supabase.js'


// ══════════════════════════════════════════════════════════════════════
// SHEETS
// ══════════════════════════════════════════════════════════════════════

/**
 * Load the full data tree: sheets → folders → links.
 * isAdmin: true  → load all sheets (authenticated, RLS returns user's rows)
 * isAdmin: false → load public sheets only (anon, RLS filters automatically)
 *
 * The single nested query is more efficient than three separate queries.
 */
export async function loadAllData(isAdmin) {
  let query = supabase
    .from('sheets')
    .select(`
      id, name, last_edit_date, order, is_public, created_at,
      folders (
        id, sheet_id, name, collapsed, order, created_at,
        links (
          id, folder_id, name, url, description, order, created_at
        )
      )
    `)
    .order('order', { ascending: true })

  if (!isAdmin) {
    query = query.eq('is_public', true)
  }

  const { data, error } = await query

  if (error || !data) return { data: [], error }

  // Sort folders and links by their order field (Supabase returns them unsorted)
  const sorted = data.map(sheet => ({
    ...sheet,
    folders: (sheet.folders || [])
      .sort((a, b) => a.order - b.order)
      .map(folder => ({
        ...folder,
        links: (folder.links || []).sort((a, b) => a.order - b.order)
      }))
  }))

  return { data: sorted, error: null }
}

export async function createSheet(name, order) {
  const { data, error } = await supabase
    .from('sheets')
    .insert({ name, order, last_edit_date: isoToday() })
    .select()
    .single()
  return { data, error }
}

export async function renameSheet(id, name) {
  const { data, error } = await supabase
    .from('sheets')
    .update({ name, last_edit_date: isoToday() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export async function deleteSheet(id) {
  // Cascades to folders → links via FK ON DELETE CASCADE
  const { error } = await supabase.from('sheets').delete().eq('id', id)
  return { error }
}

export async function updateSheetOrder(id, order) {
  const { error } = await supabase
    .from('sheets').update({ order }).eq('id', id)
  return { error }
}

export async function touchSheet(id) {
  const { error } = await supabase
    .from('sheets')
    .update({ last_edit_date: isoToday() })
    .eq('id', id)
  return { error }
}

export async function setSheetPublic(id, isPublic) {
  const { data, error } = await supabase
    .from('sheets')
    .update({ is_public: isPublic, last_edit_date: isoToday() })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}


// ══════════════════════════════════════════════════════════════════════
// FOLDERS
// ══════════════════════════════════════════════════════════════════════

export async function createFolder(sheetId, name, order) {
  const { data, error } = await supabase
    .from('folders')
    .insert({ sheet_id: sheetId, name, order, collapsed: false })
    .select()
    .single()
  return { data, error }
}

export async function renameFolder(id, sheetId, name) {
  const { error: folderErr } = await supabase
    .from('folders').update({ name }).eq('id', id)
  await touchSheet(sheetId)
  return { error: folderErr }
}

export async function deleteFolder(id, sheetId) {
  // Cascades to links via FK
  const { error } = await supabase.from('folders').delete().eq('id', id)
  await touchSheet(sheetId)
  return { error }
}

export async function updateFolderCollapsed(id, collapsed) {
  const { error } = await supabase
    .from('folders').update({ collapsed }).eq('id', id)
  return { error }
}

export async function updateFolderOrder(id, order) {
  const { error } = await supabase
    .from('folders').update({ order }).eq('id', id)
  return { error }
}


// ══════════════════════════════════════════════════════════════════════
// LINKS
// ══════════════════════════════════════════════════════════════════════

export async function createLink(folderId, sheetId, order) {
  const { data, error } = await supabase
    .from('links')
    .insert({ folder_id: folderId, name: '', url: '', description: '', order })
    .select()
    .single()
  await touchSheet(sheetId)
  return { data, error }
}

export async function updateLink(id, sheetId, field, value) {
  const { error } = await supabase
    .from('links').update({ [field]: value }).eq('id', id)
  await touchSheet(sheetId)
  return { error }
}

export async function deleteLink(id, sheetId) {
  const { error } = await supabase.from('links').delete().eq('id', id)
  await touchSheet(sheetId)
  return { error }
}

export async function updateLinkOrder(id, order) {
  const { error } = await supabase
    .from('links').update({ order }).eq('id', id)
  return { error }
}


// ══════════════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════════════

function isoToday() {
  const d  = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
