import { app, ipcMain } from 'electron';
import http from 'http';
import { login, startAgent, stopAgent, getStatus } from './agentRunner';
import { setAutoStart, isAutoStartEnabled } from './autostart';
import { saveConfig, clearConfig, loadConfig } from './store';
import { DISCOVERY_PORT } from './constants';
import { getUpdateState, checkForUpdates, installUpdate } from './updater';

/**
 * Registra todos los handlers IPC que la UI (renderer) puede invocar
 * a través del preload bridge (window.goAdminDesktop).
 */
export function registerIpcHandlers(): void {
  // ── Sesión ──
  ipcMain.handle('session:login', async (_e, email: string, password: string, remember: boolean) => {
    if (remember) {
      saveConfig({ rememberedEmail: email });
    } else {
      const cfg = loadConfig();
      delete cfg.rememberedEmail;
      saveConfig(cfg);
    }
    return await login(email, password);
  });

  ipcMain.handle('session:getRememberedEmail', () => {
    return loadConfig().rememberedEmail || null;
  });

  ipcMain.handle('session:clearRememberedEmail', () => {
    const cfg = loadConfig();
    delete cfg.rememberedEmail;
    saveConfig(cfg);
    return true;
  });

  ipcMain.handle(
    'session:start',
    async (_e, orgId: number, orgName: string, branchIds: number[], branchNames: string[]) => {
      await startAgent(orgId, orgName, branchIds, branchNames);
      return getStatus();
    }
  );

  ipcMain.handle('session:status', () => getStatus());

  ipcMain.handle('session:logout', () => {
    stopAgent();
    clearConfig();
    return true;
  });

  ipcMain.handle('session:setAgentName', (_e, name: string) => {
    saveConfig({ agentName: name });
    return true;
  });

  // ── Auto-arranque ──
  ipcMain.handle('autostart:get', () => isAutoStartEnabled());
  ipcMain.handle('autostart:set', (_e, enabled: boolean) => {
    setAutoStart(enabled);
    return isAutoStartEnabled();
  });

  // ── Impresoras (via discovery server local del agente) ──
  ipcMain.handle('printing:list', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/printers`));
  ipcMain.handle('printing:discover', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/discover`));

  // ── Actualizaciones ──
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:state', () => getUpdateState());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:install', () => {
    installUpdate();
    return true;
  });
}

function fetchLocalJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Respuesta inválida del servidor de descubrimiento'));
          }
        });
      })
      .on('error', reject);
  });
}
