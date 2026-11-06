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
// IMPORT (additive only)
// ══════════════════════════════════════════════════════════════════════

const IMPORT_CHUNK = 500 // rows per bulk insert

/**
 * Import ONE sheet (with its folders and links) as brand-new rows.
 *
 * SAFETY CONTRACT: this function only ever INSERTs new rows. It never updates
 * or deletes anything that existed before the import. The single UPDATE it can
 * perform targets the sheet row it created a moment earlier: if something fails
 * halfway, that new sheet is renamed "[incomplete] ..." so it is easy to spot.
 * There is deliberately no delete anywhere in this function.
 *
 * sheet = { name, folders: [ { name, collapsed, links: [ { name, url, description } ] } ] }
 * Imported sheets are always private (is_public = false).
 *
 * Returns { data: { sheetId, folders, links }, error: null } on success, or
 * { data: null, error, sheetId? } on failure (sheetId = the partial new sheet).
 */
export async function importSheetTree(sheet, order) {
  // 1. The sheet itself
  const { data: newSheet, error: sheetErr } = await supabase
    .from('sheets')
    .insert({ name: sheet.name, order, last_edit_date: isoToday(), is_public: false })
    .select()
    .single()
  if (sheetErr || !newSheet) {
    return { data: null, error: sheetErr || new Error('The sheet could not be created.') }
  }

  // Something went wrong after the sheet exists: flag it, never remove it
  const fail = async error => {
    try {
      await supabase.from('sheets').update({ name: `[incomplete] ${sheet.name}` }).eq('id', newSheet.id)
    } catch (_) { /* best effort only */ }
    return { data: null, error, sheetId: newSheet.id }
  }

  try {
    // 2. Folders (one bulk insert); map position -> new folder id
    const folderIds = []
    if (sheet.folders.length) {
      const rows = sheet.folders.map((f, i) => ({
        sheet_id: newSheet.id, name: f.name, collapsed: f.collapsed, order: i
      }))
      const { data: made, error } = await supabase.from('folders').insert(rows).select('id, order')
      if (error || !made || made.length !== rows.length) {
        return fail(error || new Error('The folders could not be created.'))
      }
      made.forEach(r => { folderIds[r.order] = r.id })
    }

    // 3. Links (bulk inserts in chunks)
    const linkRows = []
    sheet.folders.forEach((f, i) => {
      f.links.forEach((l, j) => {
        linkRows.push({ folder_id: folderIds[i], name: l.name, url: l.url, description: l.description, order: j })
      })
    })
    for (let i = 0; i < linkRows.length; i += IMPORT_CHUNK) {
      const { error } = await supabase.from('links').insert(linkRows.slice(i, i + IMPORT_CHUNK))
      if (error) return fail(error)
    }

    return { data: { sheetId: newSheet.id, folders: sheet.folders.length, links: linkRows.length }, error: null }
  } catch (e) {
    return fail(e)
  }
}


// ══════════════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════════════

function isoToday() {
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}