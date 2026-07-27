import { contextBridge, ipcRenderer } from 'electron';

/**
 * Bridge seguro entre la UI (renderer) y el proceso principal.
 * Expuesto como window.goAdminDesktop.
 *
 * La app web (app.goadmin.io) también puede detectar este bridge en el futuro
 * si se carga dentro de un BrowserWindow de Desktop.
 */
contextBridge.exposeInMainWorld('goAdminDesktop', {
  // Sesión
  login: (email: string, password: string, remember: boolean) => ipcRenderer.invoke('session:login', email, password, remember),
  getRememberedEmail: () => ipcRenderer.invoke('session:getRememberedEmail'),
  start: (orgId: number, orgName: string, branchIds: number[], branchNames: string[]) =>
    ipcRenderer.invoke('session:start', orgId, orgName, branchIds, branchNames),
  status: () => ipcRenderer.invoke('session:status'),
  logout: () => ipcRenderer.invoke('session:logout'),
  clearRememberedEmail: () => ipcRenderer.invoke('session:clearRememberedEmail'),
  setAgentName: (name: string) => ipcRenderer.invoke('session:setAgentName', name),

  // Auto-arranque con Windows
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('autostart:set', enabled),

  // Impresoras
  listPrinters: () => ipcRenderer.invoke('printing:list'),
  discoverNetwork: () => ipcRenderer.invoke('printing:discover'),

  // Versión y actualizaciones
  version: () => ipcRenderer.invoke('app:version'),
  updateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Eventos desde el main process
  onAutoStarted: (callback: () => void) => ipcRenderer.on('agent:autostarted', callback),
  onUpdateState: (callback: (state: unknown) => void) =>
    ipcRenderer.on('update:state', (_e, state) => callback(state)),
});
