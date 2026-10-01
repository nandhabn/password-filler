// Vault key management: derives/verifies a master password and caches the resulting
// AES key in chrome.storage.session (extension-only, cleared on browser restart)
// so both the popup and the background service worker can decrypt saved passwords
// without re-prompting on every action, while still auto-locking after inactivity.
import {
  EncryptedPayload,
  decryptJSON,
  deriveKeyRawB64,
  encryptJSON,
  generateSaltB64,
  importAesKey,
} from './crypto';

export const PASSWORDS_STORAGE_KEY = 'passwordsVault';
export const DELETED_PASSWORDS_STORAGE_KEY = 'deletedPasswordsVault';

const SALT_KEY = 'security_salt';
const VERIFIER_KEY = 'security_verifier';
const SESSION_RAW_KEY = 'security_raw_key';
const SESSION_LAST_ACTIVITY_KEY = 'security_last_activity';
const VERIFIER_PLAINTEXT = '__vault_unlock_check__';

export const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // auto-lock after 5 minutes of inactivity

export async function isVaultConfigured(): Promise<boolean> {
  const result = await chrome.storage.local.get([SALT_KEY]);
  return Boolean(result[SALT_KEY]);
}

// One-time migration from the old plaintext `passwords` / `deletedPasswords` keys.
async function migrateLegacyPlaintext(key: CryptoKey): Promise<void> {
  const legacy = await chrome.storage.local.get(['passwords', 'deletedPasswords']);
  const updates: Record<string, EncryptedPayload> = {};

  if (Array.isArray(legacy.passwords) && legacy.passwords.length > 0) {
    updates[PASSWORDS_STORAGE_KEY] = await encryptJSON(key, legacy.passwords);
  }
  if (Array.isArray(legacy.deletedPasswords) && legacy.deletedPasswords.length > 0) {
    updates[DELETED_PASSWORDS_STORAGE_KEY] = await encryptJSON(key, legacy.deletedPasswords);
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
  await chrome.storage.local.remove(['passwords', 'deletedPasswords']);
}

export async function setupVault(password: string): Promise<CryptoKey> {
  const salt = generateSaltB64();
  const rawKeyB64 = await deriveKeyRawB64(password, salt);
  const key = await importAesKey(rawKeyB64);
  const verifier = await encryptJSON(key, VERIFIER_PLAINTEXT);

  await chrome.storage.local.set({ [SALT_KEY]: salt, [VERIFIER_KEY]: verifier });
  await migrateLegacyPlaintext(key);
  await persistUnlockedKey(rawKeyB64);
  return key;
}

// Returns null when the password is incorrect (or the vault isn't set up yet).
export async function unlockVault(password: string): Promise<CryptoKey | null> {
  const result = await chrome.storage.local.get([SALT_KEY, VERIFIER_KEY]);
  const salt: string | undefined = result[SALT_KEY];
  const verifier: EncryptedPayload | undefined = result[VERIFIER_KEY];
  if (!salt || !verifier) return null;

  const rawKeyB64 = await deriveKeyRawB64(password, salt);
  const key = await importAesKey(rawKeyB64);

  try {
    const check = await decryptJSON<string>(key, verifier);
    if (check !== VERIFIER_PLAINTEXT) return null;
  } catch {
    return null; // wrong password -> AES-GCM authentication fails
  }

  await persistUnlockedKey(rawKeyB64);
  return key;
}

async function persistUnlockedKey(rawKeyB64: string): Promise<void> {
  await chrome.storage.session.set({
    [SESSION_RAW_KEY]: rawKeyB64,
    [SESSION_LAST_ACTIVITY_KEY]: Date.now(),
  });
}

// Refreshes the idle timer; call this on any meaningful vault activity.
export async function touchActivity(): Promise<void> {
  const result = await chrome.storage.session.get([SESSION_RAW_KEY]);
  if (result[SESSION_RAW_KEY]) {
    await chrome.storage.session.set({ [SESSION_LAST_ACTIVITY_KEY]: Date.now() });
  }
}

// Returns the cached key if the session is still valid, auto-locking (and returning null)
// if the idle timeout has elapsed since the last activity.
export async function getUnlockedKey(): Promise<CryptoKey | null> {
  const result = await chrome.storage.session.get([SESSION_RAW_KEY, SESSION_LAST_ACTIVITY_KEY]);
  const rawKeyB64: string | undefined = result[SESSION_RAW_KEY];
  if (!rawKeyB64) return null;

  const lastActivity: number = result[SESSION_LAST_ACTIVITY_KEY] || 0;
  if (Date.now() - lastActivity > LOCK_TIMEOUT_MS) {
    await lockVault();
    return null;
  }

  return importAesKey(rawKeyB64);
}

export async function lockVault(): Promise<void> {
  await chrome.storage.session.remove([SESSION_RAW_KEY, SESSION_LAST_ACTIVITY_KEY]);
}

export async function loadEncryptedList<T>(key: CryptoKey, storageKey: string): Promise<T[]> {
  const result = await chrome.storage.local.get([storageKey]);
  const payload: EncryptedPayload | undefined = result[storageKey];
  if (!payload) return [];
  try {
    return await decryptJSON<T[]>(key, payload);
  } catch {
    return [];
  }
}

export async function saveEncryptedList<T>(key: CryptoKey, storageKey: string, list: T[]): Promise<void> {
  const payload = await encryptJSON(key, list);
  await chrome.storage.local.set({ [storageKey]: payload });
}
