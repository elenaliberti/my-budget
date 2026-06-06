const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

const DATA_PATH = path.join(app.getPath('userData'), 'budget-data.json')
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png')

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
