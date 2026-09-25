import { invoke } from "@tauri-apps/api/core";
import {
  getSetting,
  setSetting,
  deleteSetting as dbDeleteSetting,
  getAllSettings,
} from "./database";

export const storageService = {
  async saveApiKey(provider: string, key: string): Promise<void> {
    const encrypted = await invoke<string>("encrypt_value", { value: key });
    await this.saveSetting(`api_key_${provider}`, encrypted);
  },

  async getApiKey(provider: string): Promise<string | null> {
    const encrypted = await this.getSetting(`api_key_${provider}`);
    if (!encrypted) return null;
    return invoke<string>("decrypt_value", { encrypted });
  },

  async deleteApiKey(provider: string): Promise<void> {
    await this.deleteSetting(`api_key_${provider}`);
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
