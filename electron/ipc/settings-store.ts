import { app, safeStorage } from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const API_KEY_KEYS = new Set(['deepseekApiKey', 'exaApiKey', 'perplexityApiKey']);

/** One-time per-process guard so the plaintext→encrypted migration runs once. */
let plaintextMigrationQueued = false;

function getSettingsPath(): string {
  // Headless CLI runs in an isolated Chromium profile but must still read the
  // desktop app's settings — honor AURAXIS_USER_DATA_DIR when set (same
  // convention as credentials.ts).
  const userDataPath = process.env.AURAXIS_USER_DATA_DIR || app.getPath('userData');
  return path.join(userDataPath, 'auraxis-settings.json');
}

export async function readSettings(): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(getSettingsPath(), 'utf-8');
    const settings = JSON.parse(raw);
    const plaintextKeys: string[] = [];
    // Decrypt API keys
    for (const key of API_KEY_KEYS) {
      if (typeof settings[key] === 'string' && settings[key]) {
        if (settings[key].startsWith('enc:')) {
          try {
            const buf = Buffer.from(settings[key].slice(4), 'base64');
            settings[key] = safeStorage.isEncryptionAvailable()
              ? safeStorage.decryptString(buf)
              : settings[key];
          } catch {
            // Cannot decrypt, remove key
            delete settings[key];
          }
        } else if (safeStorage.isEncryptionAvailable()) {
          plaintextKeys.push(key);
        }
      }
    }
    // Migrate legacy plaintext keys to safeStorage encryption (write-once).
    if (plaintextKeys.length > 0 && !plaintextMigrationQueued) {
      plaintextMigrationQueued = true;
      void writeSettings(settings).catch(() => {});
    }
    return settings;
  } catch {
    return {};
  }
}

export async function writeSettings(settings: Record<string, unknown>): Promise<void> {
  const toWrite = { ...settings };
  // Encrypt API keys
  for (const key of API_KEY_KEYS) {
    if (typeof toWrite[key] === 'string' && toWrite[key] && !(toWrite[key] as string).startsWith('enc:')) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(toWrite[key] as string);
          toWrite[key] = 'enc:' + encrypted.toString('base64');
        }
      } catch {
        // If encryption fails, don't store in plaintext
        delete toWrite[key];
      }
    }
  }
  const settingsPath = getSettingsPath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(toWrite, null, 2), 'utf-8');
}
