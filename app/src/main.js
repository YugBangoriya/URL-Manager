/**
 * main.js — URL Manager Phase 6
 * Architecture: auth state → load Supabase data → in-memory state → render
 *
 * Admin mode  : authenticated user sees all sheets + full CRUD
 * Viewer mode : unauthenticated, sees only public sheets, read-only
 *
 * The render functions are synchronous (they work from in-memory state).
 * Async Supabase calls update state then call renderAll().
 */

import { supabase } from './supabase.js'
import { signInWithPassword, signInWithMagicLink, signOut, getSession, onAuthChange } from './auth.js'
import {
  loadAllData,
  createSheet, renameSheet, deleteSheet, updateSheetOrder, touchSheet, setSheetPublic,
  createFolder, renameFolder, deleteFolder, updateFolderCollapsed, updateFolderOrder,
  createLink, updateLink, deleteLink, updateLinkOrder
} from './db.js'


// ══════════════════════════════════════════════════════════════════════
// GLOBAL STATE
// ══════════════════════════════════════════════════════════════════════

let state = {
  sheets: [],         // Full tree loaded from Supabase
  settings: {
    // Theme and active sheet are per-device prefs — localStorage is fine
    theme: localStorage.getItem('urlmgr_theme') || 'dark',
    activeSheetId: localStorage.getItem('urlmgr_active') || null
  }
}

let currentUser = null    // Supabase user object or null
let isViewer = true    // true = not authenticated
let _switchingSheet = false   // Phase 5 micro-animation flag
let searchTimer = null    // Debounce handle for search

// Drag state
let dragId = null
let folderDragId = null
let folderDragSheetId = null
let linkDragId = null
let linkDragFolderId = null


// ══════════════════════════════════════════════════════════════════════
// UTILITIES  (identical to Phase 1–5)
// ══════════════════════════════════════════════════════════════════════

function isoToday() {
  const d = new Date()
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${MON[+m - 1] ?? ''} ${y}`
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c])
  )
}


// ══════════════════════════════════════════════════════════════════════
// STATE HELPERS
// ══════════════════════════════════════════════════════════════════════

const orderedSheets = () => [...state.sheets].sort((a, b) => a.order - b.order)

const activeSheet = () =>
  state.sheets.find(s => s.id === state.settings.activeSheetId) ??
  state.sheets[0] ??
  null

function setActiveSheet(id) {
  state.settings.activeSheetId = id
  localStorage.setItem('urlmgr_active', id)
}


// ══════════════════════════════════════════════════════════════════════
// DATA LOADING
// ══════════════════════════════════════════════════════════════════════

async function loadData() {
  const { data, error } = await loadAllData(!isViewer)
  if (error) {
    console.error('[urlmgr] loadData error', error)
    return
  }
  state.sheets = data ?? []

  // Validate that the remembered active sheet still exists
  if (!state.sheets.find(s => s.id === state.settings.activeSheetId)) {
    const first = orderedSheets()[0]
    if (first) setActiveSheet(first.id)
    else state.settings.activeSheetId = null
  }
}


// ══════════════════════════════════════════════════════════════════════
// SVG ICON STRINGS
// ══════════════════════════════════════════════════════════════════════

const SVG_CHEVRON = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 4 6 8 10 4"/></svg>`
const SVG_DOTS = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="3.5" cy="2.5" r="1.1"/><circle cx="3.5" cy="6" r="1.1"/><circle cx="3.5" cy="9.5" r="1.1"/><circle cx="8.5" cy="2.5" r="1.1"/><circle cx="8.5" cy="6" r="1.1"/><circle cx="8.5" cy="9.5" r="1.1"/></svg>`
const SVG_TRASH = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 5 13 5"/><path d="M6 5V3h4v2"/><path d="M5 5l.9 8.5h4.2L11 5"/></svg>`
const SVG_COPY = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8" height="9" rx="1.5"/><path d="M10 5V3.5A1.5 1.5 0 0 0 8.5 2H4A1.5 1.5 0 0 0 2.5 3.5V10A1.5 1.5 0 0 0 4 11.5H5"/></svg>`
const SVG_CHECK = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 8 6 12 14 4"/></svg>`
const SVG_PLUS = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>`
const SVG_SUN = `<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.8"/><line x1="8" y1="1" x2="8" y2="2.6"/><line x1="8" y1="13.4" x2="8" y2="15"/><line x1="1" y1="8" x2="2.6" y2="8"/><line x1="13.4" y1="8" x2="15" y2="8"/><line x1="3.1" y1="3.1" x2="4.2" y2="4.2"/><line x1="11.8" y1="11.8" x2="12.9" y2="12.9"/><line x1="12.9" y1="3.1" x2="11.8" y2="4.2"/><line x1="4.2" y1="11.8" x2="3.1" y2="12.9"/></svg>`
const SVG_MOON = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 10.5A6 6 0 0 1 5.5 2.5a6.1 6.1 0 1 0 8 8Z"/></svg>`
const SVG_EXPORT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2"/><polyline points="5 7.5 8 10.5 11 7.5"/><line x1="8" y1="2" x2="8" y2="10.5"/></svg>`
const SVG_LOGOUT = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3"/><polyline points="11 11 14 8 11 5"/><line x1="14" y1="8" x2="6" y2="8"/></svg>`
const SVG_LOGIN = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3"/><polyline points="7 11 4 8 7 5"/><line x1="4" y1="8" x2="12" y2="8"/></svg>`
const SVG_GLOBE = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/></svg>`
const SVG_PENCIL = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14l1-3.5L11.5 2 14 4.5 5.5 13z"/><path d="M9.5 4l2.5 2.5"/></svg>`
const SVG_LOCK = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>`


// ══════════════════════════════════════════════════════════════════════
// CONFIRMATION DIALOG  (same pattern as Phase 1–5)
// ══════════════════════════════════════════════════════════════════════

function showConfirm(title, msg, onOk, opts = {}) {
  const okLabel = opts.okLabel ?? 'Delete'
  const okClass = opts.okClass ?? 'btn-danger'
  const el = document.createElement('div')
  el.className = 'dlg-overlay'
  el.tabIndex = -1
  el.innerHTML = `
    <div class="dlg-box" role="dialog" aria-modal="true">
      <div class="dlg-title">${title}</div>
      <div class="dlg-msg">${msg}</div>
      <div class="dlg-actions">
        <button class="btn ${okClass}" data-r="ok">${okLabel}</button>
        <button class="btn btn-ghost"  data-r="cancel">Cancel</button>
      </div>
    </div>`
  document.body.appendChild(el)
  el.focus()
  const close = () => el.remove()
  el.querySelector('[data-r="cancel"]').onclick = close
  el.querySelector('[data-r="ok"]').onclick = () => { close(); onOk() }
  el.addEventListener('click', e => { if (e.target === el) close() })
  el.addEventListener('keydown', e => { if (e.key === 'Escape') close() })
}


// ══════════════════════════════════════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════════════════════════════════════

function showAuthModal() {
  const root = document.getElementById('auth-modal-root')
  if (root.querySelector('.dlg-overlay')) return  // already open

  const el = document.createElement('div')
  el.className = 'dlg-overlay'
  el.tabIndex = -1
  el.innerHTML = `
    <div class="dlg-box auth-dlg" role="dialog" aria-modal="true" aria-label="Login">
      <div class="dlg-title">Admin Login</div>
      <div id="auth-error" class="auth-error" style="display:none"></div>

      <div class="auth-field">
        <label for="auth-email">Email</label>
        <input id="auth-email" type="email" placeholder="you@example.com"
               autocomplete="email" spellcheck="false">
      </div>
      <div class="auth-field" id="auth-pw-wrap">
        <label for="auth-password">Password</label>
        <input id="auth-password" type="password" placeholder="••••••••"
               autocomplete="current-password">
      </div>

      <div class="dlg-actions auth-actions">
        <button class="btn btn-danger" id="btn-auth-submit">Login</button>
        <button class="btn btn-ghost"  id="btn-auth-cancel">Cancel</button>
      </div>

      <button class="auth-magic-link" id="btn-magic-link">
        Send a magic link instead
      </button>
    </div>`

  root.appendChild(el)
  el.querySelector('#auth-email').focus()

  let magicMode = false

  const showError = (msg) => {
    const err = el.querySelector('#auth-error')
    err.textContent = msg
    err.style.display = 'block'
  }

  const hideError = () => {
    el.querySelector('#auth-error').style.display = 'none'
  }

  // Toggle between password mode and magic-link mode
  el.querySelector('#btn-magic-link').addEventListener('click', () => {
    magicMode = !magicMode
    const pwWrap = el.querySelector('#auth-pw-wrap')
    const submit = el.querySelector('#btn-auth-submit')
    const magicBtn = el.querySelector('#btn-magic-link')
    pwWrap.style.display = magicMode ? 'none' : ''
    submit.textContent = magicMode ? 'Send Link' : 'Login'
    magicBtn.textContent = magicMode ? 'Use password instead' : 'Send a magic link instead'
    hideError()
  })

  // Submit handler — works for both modes
  el.querySelector('#btn-auth-submit').addEventListener('click', async () => {
    hideError()
    const email = el.querySelector('#auth-email').value.trim()
    const password = el.querySelector('#auth-password').value

    if (!email) { showError('Email is required.'); return }

    const submitBtn = el.querySelector('#btn-auth-submit')
    submitBtn.disabled = true
    submitBtn.textContent = magicMode ? 'Sending…' : 'Logging in…'

    if (magicMode) {
      const { error } = await signInWithMagicLink(email)
      if (error) {
        showError('Could not send link. Check your email address.')
        submitBtn.disabled = false
        submitBtn.textContent = 'Send Link'
      } else {
        el.querySelector('.dlg-box').innerHTML = `
          <div class="dlg-title">Link sent</div>
          <div class="dlg-msg">Check your email for a login link. Close this when done.</div>
          <div class="dlg-actions"><button class="btn btn-ghost" id="btn-magic-close">Close</button></div>`
        el.querySelector('#btn-magic-close').onclick = () => el.remove()
      }
    } else {
      if (!password) {
        showError('Password is required.')
        submitBtn.disabled = false
        submitBtn.textContent = 'Login'
        return
      }
      const { error } = await signInWithPassword(email, password)
      if (error) {
        showError('Incorrect email or password.')
        submitBtn.disabled = false
        submitBtn.textContent = 'Login'
      }
      // On success, onAuthChange fires → modal is removed there
    }
  })

  // Enter key submits
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') el.querySelector('#btn-auth-submit').click()
    if (e.key === 'Escape') { e.preventDefault(); el.remove() }
  })

  el.querySelector('#btn-auth-cancel').onclick = () => el.remove()
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
}

function closeAuthModal() {
  document.getElementById('auth-modal-root').innerHTML = ''
}


// ══════════════════════════════════════════════════════════════════════
// TOP BAR ACTIONS
// ══════════════════════════════════════════════════════════════════════

function initTopActions() {
  const bar = document.getElementById('top-actions')
  bar.innerHTML = ''

  if (!isViewer) {
    // Export button (admin only)
    const expBtn = document.createElement('button')
    expBtn.className = 'tap-btn'
    expBtn.title = 'Export data as JSON'
    expBtn.innerHTML = SVG_EXPORT
    expBtn.addEventListener('click', exportData)

    // Logout button
    const outBtn = document.createElement('button')
    outBtn.className = 'tap-btn'
    outBtn.title = 'Logout'
    outBtn.innerHTML = SVG_LOGOUT
    outBtn.addEventListener('click', async () => {
      await signOut()
      // onAuthChange handles the rest
    })

    bar.append(expBtn, outBtn)
  } else {
    // Login button (viewer mode)
    const inBtn = document.createElement('button')
    inBtn.className = 'tap-btn'
    inBtn.title = 'Admin Login'
    inBtn.innerHTML = SVG_LOGIN
    inBtn.addEventListener('click', showAuthModal)
    bar.appendChild(inBtn)
  }

  // Theme toggle — always visible
  const themeBtn = document.createElement('button')
  themeBtn.id = 'btn-theme'
  themeBtn.className = 'tap-btn'
  const startsLight = document.body.classList.contains('light')
  themeBtn.innerHTML = startsLight ? SVG_MOON : SVG_SUN
  themeBtn.title = startsLight ? 'Switch to dark mode' : 'Switch to light mode'
  themeBtn.addEventListener('click', toggleTheme)
  bar.appendChild(themeBtn)
}


// ══════════════════════════════════════════════════════════════════════
// VIEWER BANNER
// ══════════════════════════════════════════════════════════════════════

function syncViewerBanner() {
  const banner = document.getElementById('viewer-banner')
  banner.style.display = isViewer ? 'flex' : 'none'
  document.getElementById('btn-banner-login').onclick = showAuthModal
  // Shift main area down when banner is visible
  document.getElementById('main-area').classList.toggle('has-banner', isViewer)
  document.getElementById('top-bar').classList.toggle('has-banner', isViewer)
}


// ══════════════════════════════════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════════════════════════════════

function toggleTheme() {
  const isNowLight = document.body.classList.toggle('light')
  state.settings.theme = isNowLight ? 'light' : 'dark'
  localStorage.setItem('urlmgr_theme', state.settings.theme)
  const btn = document.getElementById('btn-theme')
  if (!btn) return
  btn.innerHTML = isNowLight ? SVG_MOON : SVG_SUN
  btn.title = isNowLight ? 'Switch to dark mode' : 'Switch to light mode'
}


// ══════════════════════════════════════════════════════════════════════
// EXPORT  (admin only — works from in-memory state)
// ══════════════════════════════════════════════════════════════════════

function exportData() {
  const d = new Date()
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const payload = JSON.stringify({ exported_at: new Date().toISOString(), sheets: state.sheets }, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: `url-manager-${ds}.json`, style: 'display:none' })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}


// ══════════════════════════════════════════════════════════════════════
// SHEET CRUD
// ══════════════════════════════════════════════════════════════════════

async function activateSheet(id) {
  _switchingSheet = true
  setActiveSheet(id)
  renderAll()
  _switchingSheet = false
}

async function addSheet(name) {
  name = name.trim()
  if (!name) return
  const maxOrder = state.sheets.reduce((m, s) => Math.max(m, s.order), -1)
  const { data, error } = await createSheet(name, maxOrder + 1)
  if (error || !data) return
  data.folders = []
  state.sheets.push(data)
  setActiveSheet(data.id)
  renderAll()
}

async function doRenameSheet(id, name) {
  name = name.trim()
  const sh = state.sheets.find(s => s.id === id)
  if (!sh) return
  // Empty or unchanged name: no database write, no last-edit bump.
  // Re-render so the tab goes back from the input to the normal label.
  if (!name || name === sh.name) { renderTabs(); return }
  const { error } = await renameSheet(id, name)
  // Save failed: restore the old name instead of leaving the input stuck on screen
  if (error) { renderTabs(); return }
  sh.name = name
  sh.last_edit_date = isoToday()
  renderAll()
}

async function doDeleteSheet(id) {
  const idx = state.sheets.findIndex(s => s.id === id)
  if (idx < 0) return
  const sh = state.sheets[idx]
  const msg = sh.folders.length
    ? `"${esc(sh.name)}" contains folders and links. Delete everything?`
    : `Delete the sheet "${esc(sh.name)}"?`
  showConfirm('Delete Sheet', msg, async () => {
    const { error } = await deleteSheet(id)
    if (error) return
    state.sheets.splice(idx, 1)
    if (!state.sheets.length) {
      // Create a fresh default sheet if the last one was deleted
      await addSheet('My Links')
      return
    }
    if (state.settings.activeSheetId === id) {
      setActiveSheet(orderedSheets()[0].id)
    }
    renderAll()
  })
}

async function doToggleSheetPublic(id) {
  const sh = state.sheets.find(s => s.id === id)
  if (!sh) return
  const { error } = await setSheetPublic(id, !sh.is_public)
  if (error) return
  sh.is_public = !sh.is_public
  sh.last_edit_date = isoToday()
  renderTabs()
}


// ══════════════════════════════════════════════════════════════════════
// FOLDER CRUD
// ══════════════════════════════════════════════════════════════════════

async function addFolder() {
  const sh = activeSheet()
  if (!sh || isViewer) return
  const maxOrder = sh.folders.reduce((m, f) => Math.max(m, f.order), -1)
  const { data, error } = await createFolder(sh.id, 'New Folder', maxOrder + 1)
  if (error || !data) return
  data.links = []
  sh.folders.push(data)
  sh.last_edit_date = isoToday()
  renderMain()
  renderTabs()
  // Auto-open inline rename
  setTimeout(() => {
    const card = document.querySelector(`.folder-card[data-fid="${data.id}"]`)
    if (!card) return
    const nm = card.querySelector('.folder-name')
    if (nm) startFolderRename(card, sh.id, data.id, nm)
  }, 20)
}

async function doRenameFolder(sheetId, folderId, name) {
  name = name.trim()
  if (!name) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  if (!fo) return
  const { error } = await renameFolder(folderId, sheetId, name)
  if (error) return
  fo.name = name
  sh.last_edit_date = isoToday()
  renderTabs()
}

async function doDeleteFolder(sheetId, folderId) {
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  if (!sh || !fo) return
  const msg = fo.links.length
    ? `"${esc(fo.name)}" contains ${fo.links.length} link${fo.links.length !== 1 ? 's' : ''}. Delete everything?`
    : `Delete the folder "${esc(fo.name)}"?`
  showConfirm('Delete Folder', msg, async () => {
    const { error } = await deleteFolder(folderId, sheetId)
    if (error) return
    sh.folders = sh.folders.filter(f => f.id !== folderId)
    sh.last_edit_date = isoToday()
    renderMain()
    renderTabs()
  })
}

async function doToggleFolder(sheetId, folderId) {
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  if (!fo) return
  fo.collapsed = !fo.collapsed
  updateFolderCollapsed(folderId, fo.collapsed)  // fire-and-forget
  const card = document.querySelector(`.folder-card[data-fid="${folderId}"]`)
  if (card) card.classList.toggle('collapsed', fo.collapsed)
}

function startFolderRename(card, sheetId, folderId, nmEl) {
  if (card.querySelector('.folder-rename-inp')) return
  const inp = document.createElement('input')
  inp.type = 'text'
  inp.className = 'folder-rename-inp'
  inp.value = nmEl.textContent
  nmEl.replaceWith(inp)
  inp.focus(); inp.select()
  let done = false
  const commit = () => {
    if (done) return; done = true
    const val = inp.value.trim() || nmEl.textContent
    doRenameFolder(sheetId, folderId, val)
    inp.replaceWith(nmEl)
    nmEl.textContent = val
  }
  const cancel = () => { if (done) return; done = true; inp.replaceWith(nmEl) }
  inp.addEventListener('blur', commit)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })
}


// ══════════════════════════════════════════════════════════════════════
// LINK CRUD
// ══════════════════════════════════════════════════════════════════════

async function addLink(sheetId, folderId) {
  if (isViewer) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  if (!fo) return
  const maxOrder = fo.links.reduce((m, l) => Math.max(m, l.order), -1)
  const { data, error } = await createLink(folderId, sheetId, maxOrder + 1)
  if (error || !data) return
  fo.links.push(data)
  sh.last_edit_date = isoToday()
  renderMain()
  renderTabs()
  setTimeout(() => {
    const row = document.querySelector(`.link-row[data-lid="${data.id}"]`)
    const cell = row?.querySelector('.link-cell[data-field="name"]')
    if (cell) startCellEdit(cell, sheetId, folderId, data.id, 'name')
  }, 20)
}

async function doUpdateLink(sheetId, folderId, linkId, field, value) {
  if (isViewer) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  const lk = fo?.links.find(l => l.id === linkId)
  if (!lk) return
  const { error } = await updateLink(linkId, sheetId, field, value)
  if (error) return
  lk[field] = value
  sh.last_edit_date = isoToday()
  const row = document.querySelector(`.link-row[data-lid="${linkId}"]`)
  const cell = row?.querySelector(`.link-cell[data-field="${field}"]`)
  if (cell) renderCellDisplay(cell, field, value)
  if (field === 'url') {
    const copyBtn = row?.querySelector('.lac-copy')
    if (copyBtn) {
      copyBtn.classList.toggle('lac-disabled', !value)
      copyBtn.title = value ? 'Copy URL' : 'No URL to copy'
    }
  }
  renderTabs()
}

async function doDeleteLink(sheetId, folderId, linkId) {
  if (isViewer) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  const lk = fo?.links.find(l => l.id === linkId)
  if (!lk) return
  const label = lk.name ? `"${esc(lk.name)}"` : 'This link'
  showConfirm('Delete Link', `${label} will be permanently removed.`, async () => {
    const { error } = await deleteLink(linkId, sheetId)
    if (error) return
    fo.links = fo.links.filter(l => l.id !== linkId)
    sh.last_edit_date = isoToday()
    renderMain()
    renderTabs()
  })
}


// ══════════════════════════════════════════════════════════════════════
// CELL DISPLAY + INLINE EDITING
// ══════════════════════════════════════════════════════════════════════

function renderCellDisplay(cell, field, value) {
  cell.innerHTML = ''
  const inner = document.createElement('div')
  inner.className = 'lc-inner' + (value ? '' : ' ph')
  if (field === 'url' && value) {
    const a = Object.assign(document.createElement('a'), {
      href: value, target: '_blank', rel: 'noopener noreferrer', textContent: value
    })
    a.addEventListener('click', e => e.stopPropagation())
    inner.appendChild(a)
  } else {
    inner.textContent = value || (field === 'name' ? 'Name…' : field === 'url' ? 'https://…' : 'Description…')
  }
  cell.appendChild(inner)
}

function startCellEdit(cell, sheetId, folderId, linkId, field) {
  if (isViewer) return
  if (cell.querySelector('.link-cell-inp')) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  const lk = fo?.links.find(l => l.id === linkId)
  if (!lk) return
  const original = lk[field] || ''
  cell.innerHTML = ''
  const inp = Object.assign(document.createElement('input'), {
    type: 'text', className: 'link-cell-inp', value: original
  })
  cell.appendChild(inp)
  inp.focus(); inp.select()
  let done = false
  const commit = () => { if (done) return; done = true; doUpdateLink(sheetId, folderId, linkId, field, inp.value.trim()) }
  const cancel = () => { if (done) return; done = true; renderCellDisplay(cell, field, original) }
  inp.addEventListener('blur', commit)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur() }
    if (e.key === 'Escape') { e.preventDefault(); inp.removeEventListener('blur', commit); cancel() }
  })
}


// ══════════════════════════════════════════════════════════════════════
// CLIPBOARD
// ══════════════════════════════════════════════════════════════════════

function copyToClipboard(text, btn) {
  const showDone = () => {
    btn.classList.add('copy-done'); btn.innerHTML = SVG_CHECK
    setTimeout(() => { btn.classList.remove('copy-done'); btn.innerHTML = SVG_COPY }, 1500)
  }
  const fallback = () => {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, style: 'position:fixed;opacity:0;top:0;left:0'
    })
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy') } catch (e) { }
    ta.remove()
  }
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(showDone).catch(() => { fallback(); showDone() })
  } else { fallback(); showDone() }
}


// ══════════════════════════════════════════════════════════════════════
// DRAG-TO-REORDER: TABS
// ══════════════════════════════════════════════════════════════════════

function onDragStart(e) {
  dragId = e.currentTarget.dataset.id
  e.currentTarget.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', dragId)
}
function onDragOver(e) {
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  document.querySelectorAll('.sheet-tab.drag-over').forEach(t => t.classList.remove('drag-over'))
  if (e.currentTarget.dataset.id !== dragId) e.currentTarget.classList.add('drag-over')
}
async function onDrop(e) {
  e.preventDefault()
  const src = e.dataTransfer.getData('text/plain')
  const tgt = e.currentTarget.dataset.id
  if (!src || src === tgt) return
  const sorted = orderedSheets()
  const si = sorted.findIndex(s => s.id === src)
  const ti = sorted.findIndex(s => s.id === tgt)
  if (si < 0 || ti < 0) return
  const [moved] = sorted.splice(si, 1)
  sorted.splice(ti, 0, moved)
  sorted.forEach((s, i) => {
    s.order = i
    updateSheetOrder(s.id, i)  // fire-and-forget
  })
  renderTabs()
}
function onDragEnd() {
  document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('dragging', 'drag-over'))
  dragId = null
}


// ══════════════════════════════════════════════════════════════════════
// DRAG-TO-REORDER: FOLDERS
// ══════════════════════════════════════════════════════════════════════

function onFolderDragStart(e, sheetId, folderId) {
  folderDragId = folderId; folderDragSheetId = sheetId
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', folderId)
  e.stopPropagation()
}
function onFolderDragOver(e, card) {
  if (!folderDragId || folderDragId === card.dataset.fid) return
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('folder-drag-over'))
  card.classList.add('folder-drag-over')
}
function onFolderDrop(e, sheetId, targetFolderId) {
  e.preventDefault()
  document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('folder-drag-over'))
  if (!folderDragId || folderDragId === targetFolderId || folderDragSheetId !== sheetId) return
  const sh = state.sheets.find(s => s.id === sheetId)
  if (!sh) return
  const sorted = [...sh.folders].sort((a, b) => a.order - b.order)
  const si = sorted.findIndex(f => f.id === folderDragId)
  const ti = sorted.findIndex(f => f.id === targetFolderId)
  if (si < 0 || ti < 0) return
  const [moved] = sorted.splice(si, 1)
  sorted.splice(ti, 0, moved)
  sorted.forEach((f, i) => { f.order = i; updateFolderOrder(f.id, i) })
  folderDragId = null
  renderMain()
}
function onFolderDragEnd() {
  document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('folder-drag-over'))
  folderDragId = null
}


// ══════════════════════════════════════════════════════════════════════
// DRAG-TO-REORDER: LINKS
// ══════════════════════════════════════════════════════════════════════

function onLinkDragStart(e, folderId, linkId) {
  linkDragId = linkId; linkDragFolderId = folderId
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', linkId)
  e.stopPropagation()
}
function onLinkDragOver(e, row, folderId) {
  if (!linkDragId || linkDragId === row.dataset.lid || linkDragFolderId !== folderId) return
  e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  document.querySelectorAll('.link-row').forEach(r => r.classList.remove('link-drag-over'))
  row.classList.add('link-drag-over')
}
function onLinkDrop(e, sheetId, folderId, targetLinkId) {
  e.preventDefault()
  document.querySelectorAll('.link-row').forEach(r => r.classList.remove('link-drag-over'))
  if (!linkDragId || linkDragId === targetLinkId || linkDragFolderId !== folderId) return
  const sh = state.sheets.find(s => s.id === sheetId)
  const fo = sh?.folders.find(f => f.id === folderId)
  if (!fo) return
  const sorted = [...fo.links].sort((a, b) => a.order - b.order)
  const si = sorted.findIndex(l => l.id === linkDragId)
  const ti = sorted.findIndex(l => l.id === targetLinkId)
  if (si < 0 || ti < 0) return
  const [moved] = sorted.splice(si, 1)
  sorted.splice(ti, 0, moved)
  sorted.forEach((l, i) => { l.order = i; updateLinkOrder(l.id, i) })
  linkDragId = null
  renderMain()
}
function onLinkDragEnd() {
  document.querySelectorAll('.link-row').forEach(r => r.classList.remove('link-drag-over'))
  linkDragId = null
}


// ══════════════════════════════════════════════════════════════════════
// BUILD LINK ROW
// ══════════════════════════════════════════════════════════════════════

function buildLinkRow(sheetId, folderId, lk) {
  const row = document.createElement('div')
  row.className = 'link-row'
  row.dataset.lid = lk.id
  row.draggable = false

  const dh = document.createElement('div')
  dh.className = 'link-drag-hdl'; dh.innerHTML = SVG_DOTS; dh.title = 'Drag to reorder'
  if (!isViewer) {
    dh.addEventListener('mousedown', () => { row.draggable = true })
    dh.addEventListener('mouseup', () => { row.draggable = false })
  }

  const nmCell = Object.assign(document.createElement('div'), { className: 'link-cell' })
  nmCell.dataset.field = 'name'; renderCellDisplay(nmCell, 'name', lk.name)

  const urlCell = Object.assign(document.createElement('div'), { className: 'link-cell' })
  urlCell.dataset.field = 'url'; renderCellDisplay(urlCell, 'url', lk.url)

  const descCell = Object.assign(document.createElement('div'), { className: 'link-cell' })
  descCell.dataset.field = 'description'; renderCellDisplay(descCell, 'description', lk.description)

  const actions = document.createElement('div')
  actions.className = 'link-actions'

  const copyBtn = document.createElement('button')
  copyBtn.className = 'lac lac-copy' + (lk.url ? '' : ' lac-disabled')
  copyBtn.title = lk.url ? 'Copy URL' : 'No URL to copy'
  copyBtn.innerHTML = SVG_COPY
  copyBtn.addEventListener('click', e => {
    e.stopPropagation()
    const sh2 = state.sheets.find(s => s.id === sheetId)
    const fo2 = sh2?.folders.find(f => f.id === folderId)
    const lk2 = fo2?.links.find(l => l.id === lk.id)
    if (!lk2?.url) return
    copyToClipboard(lk2.url, copyBtn)
  })

  actions.appendChild(copyBtn)

  if (!isViewer) {
    const delBtn = document.createElement('button')
    delBtn.className = 'lac lac-del'; delBtn.title = 'Delete link'; delBtn.innerHTML = SVG_TRASH
    delBtn.addEventListener('click', e => { e.stopPropagation(); doDeleteLink(sheetId, folderId, lk.id) })
    actions.appendChild(delBtn)
  }

  if (!isViewer) {
    [nmCell, urlCell, descCell].forEach(cell => {
      cell.addEventListener('click', () => startCellEdit(cell, sheetId, folderId, lk.id, cell.dataset.field))
    })
  }

  if (!isViewer) {
    row.addEventListener('dragstart', e => onLinkDragStart(e, folderId, lk.id))
    row.addEventListener('dragover', e => onLinkDragOver(e, row, folderId))
    row.addEventListener('drop', e => onLinkDrop(e, sheetId, folderId, lk.id))
    row.addEventListener('dragend', onLinkDragEnd)
  }

  row.append(dh, nmCell, urlCell, descCell, actions)
  return row
}


// ══════════════════════════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════════════════════════

function performSearch(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const results = []
  state.sheets.forEach(sheet => {
    sheet.folders.forEach(folder => {
      folder.links.forEach(link => {
        const hit = (link.name?.toLowerCase().includes(q)) ||
          (link.url?.toLowerCase().includes(q)) ||
          (link.description?.toLowerCase().includes(q))
        if (hit) results.push({ sheetId: sheet.id, sheetName: sheet.name, folderId: folder.id, folderName: folder.name, linkId: link.id, linkName: link.name, linkUrl: link.url })
      })
    })
  })
  return results
}

function showSearchDropdown(results, query) {
  const dd = document.getElementById('search-dropdown')
  dd.innerHTML = ''
  if (!results.length) {
    const empty = document.createElement('div')
    empty.className = 'search-empty'
    empty.textContent = `No results for "${query}"`
    dd.appendChild(empty)
  } else {
    results.forEach(r => {
      const item = document.createElement('div')
      item.className = 'search-result'
      item.setAttribute('role', 'option')
      const display = r.linkName || r.linkUrl
      const nameEl = document.createElement('div')
      nameEl.className = 'sr-name' + (display ? '' : ' sr-unnamed')
      nameEl.textContent = display || '(unnamed link)'
      const metaEl = document.createElement('div')
      metaEl.className = 'sr-meta'
      metaEl.textContent = `${r.sheetName} / ${r.folderName}`
      item.append(nameEl, metaEl)
      item.addEventListener('click', () => { closeSearch(); navigateToResult(r) })
      dd.appendChild(item)
    })
  }
  dd.classList.add('open')
}

function closeSearch() {
  const inp = document.getElementById('search-input')
  const dd = document.getElementById('search-dropdown')
  if (inp) inp.value = ''
  if (dd) dd.classList.remove('open')
}

function collapseDropdown() {
  document.getElementById('search-dropdown')?.classList.remove('open')
}

function navigateToResult(result) {
  if (state.settings.activeSheetId !== result.sheetId) {
    setActiveSheet(result.sheetId)
  }
  const sh = state.sheets.find(s => s.id === result.sheetId)
  const fo = sh?.folders.find(f => f.id === result.folderId)
  if (fo?.collapsed) { fo.collapsed = false; updateFolderCollapsed(fo.id, false) }
  renderAll()
  setTimeout(() => {
    const row = document.querySelector(`.link-row[data-lid="${result.linkId}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    row.classList.remove('search-highlight')
    void row.offsetWidth
    row.classList.add('search-highlight')
    row.addEventListener('animationend', () => row.classList.remove('search-highlight'), { once: true })
  }, 20)
}


// ══════════════════════════════════════════════════════════════════════
// RENDER — MAIN AREA
// ══════════════════════════════════════════════════════════════════════

function renderMain() {
  const area = document.getElementById('main-area')

  if (_switchingSheet) {
    area.classList.remove('sheet-switch')
    void area.offsetWidth
    area.classList.add('sheet-switch')
  }

  const sheet = activeSheet()

  if (!sheet) {
    area.innerHTML = `<div class="empty-state"><span>No sheets found.</span></div>`
    return
  }

  if (!sheet.folders.length) {
    const adminHint = isViewer ? '' : ' click <strong>+ Add Folder</strong> to get started'
    area.innerHTML = `
      <div class="empty-state">
        <svg width="54" height="54" viewBox="0 0 54 54" fill="none" color="var(--muted)" aria-hidden="true">
          <path d="M7 44V20a2 2 0 0 1 2-2h13l4.5 4.5H47a2 2 0 0 1 2 2v19.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z"
                stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
          <path d="M27 30.5v9M22.5 35h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <span>No folders yet${adminHint}</span>
      </div>`
    return
  }

  const list = document.createElement('div')
  list.id = 'folder-list'
  const folders = [...sheet.folders].sort((a, b) => a.order - b.order)

  folders.forEach(fo => {
    const links = [...fo.links].sort((a, b) => a.order - b.order)

    const card = document.createElement('div')
    card.className = 'folder-card' + (fo.collapsed ? ' collapsed' : '')
    card.dataset.fid = fo.id
    card.draggable = false

    const hdr = document.createElement('div')
    hdr.className = 'folder-header'

    const chevron = document.createElement('span')
    chevron.className = 'folder-chevron'; chevron.innerHTML = SVG_CHEVRON

    const nmEl = document.createElement('span')
    nmEl.className = 'folder-name'; nmEl.textContent = fo.name

    const badge = document.createElement('span')
    badge.className = 'folder-badge'; badge.textContent = links.length

    const dragHdl = document.createElement('span')
    dragHdl.className = 'folder-drag-hdl'; dragHdl.innerHTML = SVG_DOTS; dragHdl.title = 'Drag to reorder'

    const delBtn = document.createElement('button')
    delBtn.className = 'folder-del'; delBtn.title = 'Delete folder'; delBtn.innerHTML = SVG_TRASH

    hdr.append(chevron, nmEl, badge)

    if (!isViewer) {
      dragHdl.addEventListener('mousedown', () => { card.draggable = true })
      dragHdl.addEventListener('mouseup', () => { card.draggable = false })
      hdr.append(dragHdl, delBtn)
    }

    hdr.addEventListener('click', e => {
      if (e.target.closest('.folder-del') || e.target.closest('.folder-drag-hdl') || e.target.closest('.folder-rename-inp')) return
      doToggleFolder(sheet.id, fo.id)
    })

    if (!isViewer) {
      nmEl.addEventListener('dblclick', e => { e.stopPropagation(); startFolderRename(card, sheet.id, fo.id, nmEl) })
      delBtn.addEventListener('click', e => { e.stopPropagation(); doDeleteFolder(sheet.id, fo.id) })
      card.addEventListener('dragstart', e => onFolderDragStart(e, sheet.id, fo.id))
      card.addEventListener('dragover', e => onFolderDragOver(e, card))
      card.addEventListener('drop', e => onFolderDrop(e, sheet.id, fo.id))
      card.addEventListener('dragend', onFolderDragEnd)
      card.addEventListener('dragend', () => { card.draggable = false })
    }

    const body = document.createElement('div')
    body.className = 'folder-body'

    if (links.length > 0) {
      const colHdr = document.createElement('div')
      colHdr.className = 'link-col-hdr'
      colHdr.innerHTML = `<span></span><span>Name</span><span>URL</span><span>Description</span><span></span>`
      body.appendChild(colHdr)
      const rowsWrap = document.createElement('div')
      rowsWrap.className = 'link-rows-wrap'
      links.forEach(lk => rowsWrap.appendChild(buildLinkRow(sheet.id, fo.id, lk)))
      body.appendChild(rowsWrap)
    } else {
      const empty = document.createElement('div')
      empty.className = 'folder-empty'
      empty.textContent = isViewer ? 'No links in this folder.' : 'No links yet — click + Add Link below'
      body.appendChild(empty)
    }

    if (!isViewer) {
      const alBar = document.createElement('div')
      alBar.className = 'add-link-bar'
      const alBtn = document.createElement('button')
      alBtn.className = 'btn-add-link'; alBtn.innerHTML = SVG_PLUS + ' + Add Link'
      alBtn.addEventListener('click', () => addLink(sheet.id, fo.id))
      alBar.appendChild(alBtn)
      body.appendChild(alBar)
    }

    card.append(hdr, body)
    list.appendChild(card)
  })

  area.innerHTML = ''
  area.appendChild(list)
}


// ══════════════════════════════════════════════════════════════════════
// RENDER — TAB BAR
// ══════════════════════════════════════════════════════════════════════

function renderTabs() {
  const bar = document.getElementById('tab-bar')
  bar.innerHTML = ''

  orderedSheets().forEach(sheet => {
    const tab = document.createElement('div')
    tab.className = 'sheet-tab' + (sheet.id === state.settings.activeSheetId ? ' active' : '')
    tab.dataset.id = sheet.id
    tab.draggable = !isViewer
    if (!isViewer) tab.classList.add('editable')

    const nm = document.createElement('span')
    nm.className = 'tab-name'; nm.textContent = sheet.name

    const dt = document.createElement('span')
    dt.className = 'tab-date'; dt.textContent = fmtDate(sheet.last_edit_date)

    tab.append(nm, dt)

    if (!isViewer) {
      // Public/private toggle icon
      const pub = document.createElement('span')
      pub.className = 'tab-pub'
      pub.innerHTML = sheet.is_public ? SVG_GLOBE : SVG_LOCK
      pub.title = sheet.is_public ? 'Public — click to make private' : 'Private — click to make public'
      pub.addEventListener('click', e => { e.stopPropagation(); doToggleSheetPublic(sheet.id) })

      // Delete ✕
      const del = document.createElement('span')
      del.className = 'tab-del'; del.title = 'Delete sheet'; del.textContent = '✕'
      del.addEventListener('click', e => { e.stopPropagation(); doDeleteSheet(sheet.id) })

      // Rename ✎ — a visible button, so renaming isn't hidden behind a double-click
      const edit = document.createElement('span')
      edit.className = 'tab-edit'; edit.title = 'Rename sheet'; edit.innerHTML = SVG_PENCIL
      edit.addEventListener('click', e => { e.stopPropagation(); startRename(tab, sheet, nm) })

      tab.append(edit, pub, del)
      // Double-clicking the name still works as a shortcut
      tab.addEventListener('dblclick', e => {
        if (e.target.closest('.tab-del, .tab-pub, .tab-edit')) return
        startRename(tab, sheet, nm)
      })
      tab.addEventListener('dragstart', onDragStart)
      tab.addEventListener('dragover', onDragOver)
      tab.addEventListener('drop', onDrop)
      tab.addEventListener('dragend', onDragEnd)
    }

    tab.addEventListener('click', e => {
      if (e.target.classList.contains('tab-del') || e.target.classList.contains('tab-pub')) return
      if (tab.querySelector('.tab-rename-input')) return
      activateSheet(sheet.id)
    })

    bar.appendChild(tab)
  })

  if (!isViewer) {
    const plus = document.createElement('div')
    plus.id = 'tab-add'; plus.title = 'New sheet'; plus.textContent = '+'
    plus.addEventListener('click', startCreate)
    bar.appendChild(plus)
  }
}

function startRename(tab, sheet, nm) {
  if (tab.querySelector('.tab-rename-input')) return
  const inp = Object.assign(document.createElement('input'), {
    type: 'text', className: 'tab-rename-input', value: sheet.name, maxLength: 48
  })
  // A draggable parent makes mouse text-selection inside the input unreliable
  tab.draggable = false
  nm.replaceWith(inp); inp.focus(); inp.select()
  let done = false
  const commit = () => { if (done) return; done = true; doRenameSheet(sheet.id, inp.value.trim() || sheet.name) }
  const cancel = () => { if (done) return; done = true; renderTabs() }
  inp.addEventListener('blur', commit)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })
}

function startCreate() {
  const bar = document.getElementById('tab-bar')
  const plus = document.getElementById('tab-add')
  if (bar.querySelector('.tab-create-input')) return
  const inp = Object.assign(document.createElement('input'), {
    type: 'text', className: 'tab-create-input', placeholder: 'Sheet name…', maxLength: 48
  })
  bar.insertBefore(inp, plus); inp.focus()
  let done = false
  const commit = () => {
    if (done) return; done = true
    const v = inp.value.trim()
    if (v) addSheet(v); else { inp.remove(); renderTabs() }
  }
  const cancel = () => { if (done) return; done = true; inp.remove(); renderTabs() }
  inp.addEventListener('blur', commit)
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })
}


// ══════════════════════════════════════════════════════════════════════
// RENDER ALL
// ══════════════════════════════════════════════════════════════════════

function renderAll() {
  renderTabs()
  renderMain()
  syncViewerBanner()
  // Add Folder button: hidden in viewer mode
  document.getElementById('folder-add-bar').style.display = isViewer ? 'none' : ''
}


// ══════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════

async function init() {
  // 1. Apply saved theme before first render to avoid flash
  if (state.settings.theme === 'light') document.body.classList.add('light')

  // 2. Show loading state while we check auth + fetch data
  document.getElementById('main-area').innerHTML = `<div class="loading-state">Loading…</div>`

  // 3. Check auth
  const session = await getSession()
  currentUser = session?.user ?? null
  isViewer = !currentUser

  // 4. Load data from Supabase
  await loadData()

  // 5. Build top-bar buttons and render everything
  initTopActions()
  renderAll()

  // 6. Wire Add Folder button
  document.getElementById('btn-add-folder').addEventListener('click', addFolder)

  // 7. Wire search
  const searchInput = document.getElementById('search-input')
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer)
    const raw = searchInput.value
    if (!raw.trim()) { collapseDropdown(); return }
    searchTimer = setTimeout(() => showSearchDropdown(performSearch(raw), raw.trim()), 200)
  })
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); searchInput.blur() }
  })
  document.addEventListener('click', e => {
    if (!document.getElementById('search-wrap')?.contains(e.target)) collapseDropdown()
  })

  // 8. React to auth state changes (login / logout)
  onAuthChange(async (event, session) => {
    currentUser = session?.user ?? null
    isViewer = !currentUser

    if (event === 'SIGNED_IN') {
      closeAuthModal()
      await loadData()
      initTopActions()
      renderAll()
    }

    if (event === 'SIGNED_OUT') {
      await loadData()
      initTopActions()
      renderAll()
    }
  })
}

init()