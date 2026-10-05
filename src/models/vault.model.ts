import {
  DELETED_PASSWORDS_STORAGE_KEY,
  PASSWORDS_STORAGE_KEY,
  getUnlockedKey,
  isVaultConfigured,
  lockVault,
  setupVault,
  touchActivity,
  unlockVault,
} from '../shared/vault';

export type VaultStatus = 'loading' | 'setup' | 'locked' | 'unlocked';

export const VaultModel = {
  PASSWORDS_STORAGE_KEY,
  DELETED_PASSWORDS_STORAGE_KEY,

  async isConfigured(): Promise<boolean> {
    return isVaultConfigured();
  },

  async getUnlockedKey(): Promise<CryptoKey | null> {
    return getUnlockedKey();
  },

  async setup(password: string): Promise<CryptoKey> {
    return setupVault(password);
  },

  async unlock(password: string): Promise<CryptoKey | null> {
    return unlockVault(password);
  },

  async lock(): Promise<void> {
    return lockVault();
  },

  async touch(): Promise<void> {
    return touchActivity();
  },
};
