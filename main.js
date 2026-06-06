const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const DATA_PATH = path.join(app.getPath('userData'), 'budget-data.json')
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png')

// ── Git helpers (same pattern as My Library) ──────────────────────────────────

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve(stdout.trim())
    })
  })
}

async function findGit() {
  for (const p of ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git']) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('Git not found.')
}

function findRepoDir() {
  const candidates = [
    path.join(app.getPath('home'), 'Downloads', 'budget-app'),
    path.join(__dirname),
    process.cwd(),
  ]
  for (const c of candidates) {
    try {
      const resolved = path.resolve(c)
      if (fs.existsSync(path.join(resolved, '.git'))) return resolved
    } catch {}
  }
  return null
}

ipcMain.handle('git:status', async () => {
  try {
    const git = await findGit()
    const repoDir = findRepoDir()
    if (!repoDir) return { ok: false, error: 'Git repo not found.' }
    let lastBackup = ''
    try { lastBackup = await run(git, ['log', '-1', '--format=%ar'], repoDir) } catch {}
    return { ok: true, lastBackup }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('git:backup', async () => {
  try {
    const git = await findGit()
    const repoDir = findRepoDir()
    if (!repoDir) return { ok: false, error: 'Git repo not found. Make sure the app is in ~/Downloads/budget-app.' }

    // Copy current data into the repo so it gets backed up too
    const repoDataPath = path.join(repoDir, 'budget-data.json')
    if (fs.existsSync(DATA_PATH)) fs.copyFileSync(DATA_PATH, repoDataPath)

    await run(git, ['add', '.'], repoDir)

    let status = ''
    try { status = await run(git, ['status', '--porcelain'], repoDir) } catch {}
    if (!status) return { ok: true, message: 'Already up to date — nothing new to back up.' }

    const now = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    await run(git, ['commit', '-m', `Budget backup — ${now}`], repoDir)
    await run(git, ['push', 'origin', 'main'], repoDir)

    return { ok: true, message: `Backed up to GitHub at ${now} ✓` }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

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

app.whenReady().then(() => {
  const icon = nativeImage.createFromPath(ICON_PATH)
  if (process.platform === 'darwin') app.dock.setIcon(icon)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ── Data IPC ──────────────────────────────────────────────────────────────────

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
