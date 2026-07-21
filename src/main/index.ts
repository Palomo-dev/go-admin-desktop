import { app, BrowserWindow } from 'electron';
import path from 'path';
import { APP_NAME } from './constants';
import { registerIpcHandlers } from './ipc';
import { createTray } from './tray';
import { wasOpenedHidden } from './autostart';
import { tryAutoStart, markOffline, stopAgent } from './agentRunner';

let mainWindow: BrowserWindow | null = null;
let quitting = false;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 640,
    title: APP_NAME,
    resizable: false,
    autoHideMenuBar: true,
    show: !wasOpenedHidden(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  // Cerrar = minimizar a la bandeja (no salir)
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

// Instancia única: si ya está corriendo, enfoca la ventana existente
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerIpcHandlers();
    mainWindow = createMainWindow();
    createTray(mainWindow);

    // Si hay sesión guardada, arranca el agente automáticamente
    const started = await tryAutoStart();
    if (started) {
      mainWindow.webContents.send('agent:autostarted');
    }
  });

  app.on('before-quit', async (e) => {
    if (!quitting) {
      e.preventDefault();
      quitting = true;
      await markOffline();
      stopAgent();
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    // No salir: la app vive en la bandeja del sistema
  });
}
