import React from 'react';
import { VaultStatus } from '../../models/vault.model';

interface VaultGateViewProps {
  status: VaultStatus;
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  confirmInput: string;
  setConfirmInput: (val: string) => void;
  error: string;
  onSetup: () => void;
  onUnlock: () => void;
}

export const VaultGateView: React.FC<VaultGateViewProps> = ({
  status,
  passwordInput,
  setPasswordInput,
  confirmInput,
  setConfirmInput,
  error,
  onSetup,
  onUnlock,
}) => {
  if (status === 'loading') {
    return <p className="empty">Loading…</p>;
  }

  if (status === 'setup') {
    return (
      <div className="vault-gate">
        <h3>🔐 Create a Master Password</h3>
        <p className="vault-hint">
          This encrypts all saved passwords on your device. There is no recovery if you forget it — store it
          somewhere safe.
        </p>
        <input
          type="password"
          placeholder="Master password (min 8 characters)"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm master password"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSetup()}
        />
        {error && <p className="vault-error">{error}</p>}
        <button className="primary" onClick={onSetup}>
          Create &amp; Unlock
        </button>
      </div>
    );
  }

  if (status === 'locked') {
    return (
      <div className="vault-gate">
        <h3>🔒 Vault Locked</h3>
        <input
          type="password"
          placeholder="Master password"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
          autoFocus
        />
        {error && <p className="vault-error">{error}</p>}
        <button className="primary" onClick={onUnlock}>
          Unlock
        </button>
      </div>
    );
  }

  return null;
};
