import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import path from 'path';
import { APP_NAME } from './constants';
import { getStatus } from './agentRunner';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '..', '..', 'build', 'icon.ico');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    // Fallback: icono vacío de 16x16 si aún no existe build/icon.ico
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const refreshMenu = () => {
    const status = getStatus();
    const menu = Menu.buildFromTemplate([
      {
        label: status.running
          ? `● Conectado — ${status.organizationName || ''}`
          : '○ Desconectado',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Abrir',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          app.quit();
        },
      },
    ]);
    tray!.setContextMenu(menu);
  };

  refreshMenu();
  setInterval(refreshMenu, 30_000);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}
