const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const DATA_PATH = path.join(app.getPath('userData'), 'budget-data.json')
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png')
const APP_DIR   = __dirname

// ── Git backup ────────────────────────────────────────────────────────────────

let backupBusy = false

async function gitBackup() {
  if (backupBusy) return { ok: false, reason: 'busy' }
  backupBusy = true

  // Make sure git and credential helper can run from the Electron environment
  const env = {
    ...process.env,
    PATH: `/usr/bin:/usr/local/bin:/opt/homebrew/bin:${process.env.PATH || ''}`,
    HOME: app.getPath('home'),
  }
  const run = cmd => execAsync(cmd, { cwd: APP_DIR, env, timeout: 20000 })

  try {
    await run('git add -A')
    const { stdout } = await run('git status --porcelain')
    if (!stdout.trim()) {
      backupBusy = false
      return { ok: true, noChanges: true }
    }
    const date = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
    await run(`git commit -m "Budget backup — ${date}"`)
    await run('git push')
    backupBusy = false
    return { ok: true, time: new Date().toISOString() }
  } catch (e) {
    backupBusy = false
    return { ok: false, error: e.message }
  }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const icon = nativeImage.createFromPath(ICON_PATH)
  const win = new BrowserWindow({
    width: 1260,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f172a',
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile('src/index.html')
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(ICON_PATH)
  if (process.platform === 'darwin') app.dock.setIcon(icon)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Auto-backup to GitHub on every quit
let quitting = false
app.on('before-quit', async e => {
  if (quitting) return
  e.preventDefault()
  quitting = true
  await gitBackup().catch(() => {})   // never block the quit on error
  app.quit()
})

// ── IPC ───────────────────────────────────────────────────────────────────────

ipcMain.handle('data:load', () => {
  try {
    if (fs.existsSync(DATA_PATH)) return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
    return null
  } catch { return null }
})

ipcMain.handle('data:save', (_, data) => {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8'); return true }
  catch { return false }
})

ipcMain.handle('data:open-location', () => shell.showItemInFolder(DATA_PATH))

ipcMain.handle('data:export-path', async () => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export Budget Data',
    defaultPath: path.join(app.getPath('downloads'), 'my-budget.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  return filePath || null
})

ipcMain.handle('git:backup', () => gitBackup())
