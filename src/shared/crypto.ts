// AES-GCM encryption helpers backed by PBKDF2-derived keys (Web Crypto API).
const PBKDF2_ITERATIONS = 250_000;

export interface EncryptedPayload {
  iv: string; // base64
  data: string; // base64
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateSaltB64(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveRawKeyBits(password: string, saltB64: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(saltB64) as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  );
}

// Derives a raw 32-byte AES key as base64, so it can be cached (e.g. in chrome.storage.session)
// and re-imported across extension contexts (popup/background) without re-entering the password.
export async function deriveKeyRawB64(password: string, saltB64: string): Promise<string> {
  const bits = await deriveRawKeyBits(password, saltB64);
  return toBase64(bits);
}

export async function importAesKey(rawKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', fromBase64(rawKeyB64) as BufferSource, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

export async function decryptJSON<T>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource },
    key,
    fromBase64(payload.data) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
