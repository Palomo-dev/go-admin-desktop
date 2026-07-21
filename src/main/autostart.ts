import { app } from 'electron';

/**
 * Configura el arranque automático con Windows usando la API nativa de Electron
 * (registra la app en el registro de Windows, sin scripts externos).
 */
export function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: ['--hidden'],
  });
}

export function isAutoStartEnabled(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}

export function wasOpenedHidden(): boolean {
  return process.argv.includes('--hidden');
}
