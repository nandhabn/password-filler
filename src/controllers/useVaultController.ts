import { useEffect, useState } from 'react';
import { VaultModel, VaultStatus } from '../models/vault.model';

export function useVaultController() {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const configured = await VaultModel.isConfigured();
      if (!configured) {
        setStatus('setup');
        return;
      }
      const key = await VaultModel.getUnlockedKey();
      if (key) {
        setVaultKey(key);
        setStatus('unlocked');
      } else {
        setStatus('locked');
      }
    })();
  }, []);

  // Auto-lock the open popup if the idle timeout elapses while it's still visible.
  useEffect(() => {
    if (status !== 'unlocked') return;
    const interval = setInterval(async () => {
      const key = await VaultModel.getUnlockedKey();
      if (!key) {
        setVaultKey(null);
        setStatus('locked');
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [status]);

  const handleSetup = async () => {
    setError('');
    if (passwordInput.length < 8) {
      setError('Master password must be at least 8 characters.');
      return;
    }
    if (passwordInput !== confirmInput) {
      setError('Passwords do not match.');
      return;
    }
    const key = await VaultModel.setup(passwordInput);
    chrome.runtime.sendMessage({ type: 'VAULT_UNLOCKED' });
    setVaultKey(key);
    setStatus('unlocked');
    setPasswordInput('');
    setConfirmInput('');
  };

  const handleUnlock = async () => {
    setError('');
    const key = await VaultModel.unlock(passwordInput);
    if (!key) {
      setError('Incorrect master password.');
      return;
    }
    chrome.runtime.sendMessage({ type: 'VAULT_UNLOCKED' });
    setVaultKey(key);
    setStatus('unlocked');
    setPasswordInput('');
  };

  const handleLock = async () => {
    await VaultModel.lock();
    chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' });
    setVaultKey(null);
    setStatus('locked');
    setPasswordInput('');
  };

  return {
    status,
    vaultKey,
    passwordInput,
    setPasswordInput,
    confirmInput,
    setConfirmInput,
    error,
    handleSetup,
    handleUnlock,
    handleLock,
  };
}
