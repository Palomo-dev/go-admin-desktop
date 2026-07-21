import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Almacenamiento simple en JSON dentro de la carpeta de datos del usuario
 * (ej. C:\Users\X\AppData\Roaming\go-admin-desktop\config.json).
 */
export interface DesktopConfig {
  email?: string;
  password?: string;
  agentName?: string;
  organizationId?: number;
  organizationName?: string;
  branchIds?: number[];
  branchNames?: string[];
}

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

export function loadConfig(): DesktopConfig {
  try {
    if (fs.existsSync(CONFIG_PATH())) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8'));
    }
  } catch (err) {
    console.warn('[store] No se pudo leer config.json:', err);
  }
  return {};
}

export function saveConfig(partial: Partial<DesktopConfig>): DesktopConfig {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(updated, null, 2));
  return updated;
}

export function clearConfig(): void {
  try {
    fs.rmSync(CONFIG_PATH(), { force: true });
  } catch (err) {
    console.warn('[store] No se pudo eliminar config.json:', err);
  }
}
