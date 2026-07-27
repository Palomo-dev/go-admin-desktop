import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Almacenamiento simple en JSON dentro de la carpeta de datos del usuario
 * (ej. C:\Users\X\AppData\Roaming\go-admin-desktop\config.json).
 *
 * SEGURIDAD: nunca se guarda la contraseña del usuario. La sesión se conserva
 * mediante el refresh token de Supabase cifrado con safeStorage (DPAPI en
 * Windows), que solo puede descifrar el mismo usuario del sistema operativo.
 */
export interface DesktopConfig {
  email?: string;
  rememberedEmail?: string;
  agentName?: string;
  organizationId?: number;
  organizationName?: string;
  branchIds?: number[];
  branchNames?: string[];
  /** Refresh token de Supabase cifrado con safeStorage y codificado en base64. */
  encryptedRefreshToken?: string;
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

/**
 * Migración de seguridad: versiones anteriores (<= 0.1.6) guardaban la contraseña
 * del usuario en texto plano en config.json. Se elimina de forma irreversible.
 * Debe ejecutarse al arrancar, antes de cualquier intento de auto-login.
 */
export function purgeLegacyPassword(): boolean {
  try {
    if (!fs.existsSync(CONFIG_PATH())) return false;

    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8')) as Record<string, unknown>;
    if (!('password' in raw)) return false;

    delete raw.password;
    fs.writeFileSync(CONFIG_PATH(), JSON.stringify(raw, null, 2));
    console.warn('[store] Contraseña heredada eliminada de config.json (migración de seguridad)');
    return true;
  } catch (err) {
    console.warn('[store] No se pudo purgar la contraseña heredada:', err);
    return false;
  }
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

/**
 * Guarda el refresh token cifrado. Si el SO no ofrece cifrado disponible,
 * no se persiste nada: es preferible pedir login de nuevo que dejarlo en claro.
 */
export function saveRefreshToken(refreshToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[store] safeStorage no disponible: no se persistirá la sesión');
    return;
  }
  const encrypted = safeStorage.encryptString(refreshToken).toString('base64');
  saveConfig({ encryptedRefreshToken: encrypted });
}

/**
 * Recupera y descifra el refresh token. Devuelve null si no existe o si el
 * cifrado no puede deshacerse (ej. otro usuario del SO, perfil movido).
 */
export function loadRefreshToken(): string | null {
  const { encryptedRefreshToken } = loadConfig();
  if (!encryptedRefreshToken) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[store] safeStorage no disponible: no se puede recuperar la sesión');
    return null;
  }

  try {
    return safeStorage.decryptString(Buffer.from(encryptedRefreshToken, 'base64'));
  } catch (err) {
    console.warn('[store] Refresh token ilegible, se descarta:', err);
    clearRefreshToken();
    return null;
  }
}

export function clearRefreshToken(): void {
  const cfg = loadConfig();
  delete cfg.encryptedRefreshToken;
  try {
    fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn('[store] No se pudo limpiar el refresh token:', err);
  }
}
