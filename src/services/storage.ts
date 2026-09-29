import { invoke } from "@tauri-apps/api/core";
import {
  getSetting,
  setSetting,
  deleteSetting as dbDeleteSetting,
  getAllSettings,
} from "./database";

/**
 * Marker stored in the settings table (`api_key_<provider>`) when the real key
 * lives in the OS credential store. The row's presence is what tells the UI a
 * key is configured.
 */
const KEYCHAIN_MARKER = "keychain";

const secretName = (provider: string) => `api_key_${provider}`;

export const storageService = {
  /**
   * API keys go to the OS credential store (Windows Credential Manager, macOS
   * Keychain, Secret Service). Only when that store is unavailable (e.g. a Linux
   * session without a keyring daemon) do they fall back to the legacy AES value
   * in the database.
   */
  async saveApiKey(provider: string, key: string): Promise<void> {
    try {
      await invoke("secret_set", { name: secretName(provider), value: key });
      await this.saveSetting(secretName(provider), KEYCHAIN_MARKER);
    } catch (err) {
      console.warn(`[storage] credential store unavailable, using encrypted DB fallback: ${String(err)}`);
      const encrypted = await invoke<string>("encrypt_value", { value: key });
      await this.saveSetting(secretName(provider), encrypted);
    }
  },

  async getApiKey(provider: string): Promise<string | null> {
    const stored = await this.getSetting(secretName(provider));
    if (!stored) return null;
    if (stored === KEYCHAIN_MARKER) {
      return invoke<string | null>("secret_get", { name: secretName(provider) });
    }
    // Legacy AES value: decrypt, then move it into the credential store.
    const key = await invoke<string>("decrypt_value", { encrypted: stored });
    try {
      await invoke("secret_set", { name: secretName(provider), value: key });
      await this.saveSetting(secretName(provider), KEYCHAIN_MARKER);
    } catch {
      // Store unavailable: keep the legacy value; retried on the next read.
    }
    return key;
  },

  async deleteApiKey(provider: string): Promise<void> {
    await invoke("secret_delete", { name: secretName(provider) }).catch(() => {});
    await this.deleteSetting(secretName(provider));
  },

  async saveSetting(key: string, value: string): Promise<void> {
    await setSetting(key, value);
  },

  async getSetting(key: string): Promise<string | null> {
    return getSetting(key);
  },

  async deleteSetting(key: string): Promise<void> {
    await dbDeleteSetting(key);
  },

  async getAllSettings(): Promise<Record<string, string>> {
    return getAllSettings();
  },
};

// Legacy named exports for backward compatibility
export async function getAppDataDir(): Promise<string> {
  return invoke<string>("get_app_data_dir");
}

export async function ensureDirectoryExists(_dir: string): Promise<void> {
  // Handled by the Rust backend when copying files
}

export async function saveCvFile(sourcePath: string, cvId: string): Promise<string> {
  const ext = sourcePath.toLowerCase().endsWith(".docx") ? "docx" : "pdf";
  const destName = `${cvId}.${ext}`;
  return invoke<string>("copy_file_to_app_data", { source: sourcePath, destName });
}

export async function readFileAsText(filePath: string): Promise<string> {
  const bytes = await invoke<number[]>("read_file_bytes", { path: filePath });
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(new Uint8Array(bytes));
}

export async function fileExists(_filePath: string): Promise<boolean> {
  try {
    await invoke("read_file_bytes", { path: _filePath });
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(_filePath: string): Promise<void> {
  // File deletion is handled by the Rust backend if needed.
  // For now, DB record deletion is sufficient.
}

// Exports to user-chosen locations go through the native Save As dialog:
// see src/services/file-export.ts (`saveBytesWithDialog`).
