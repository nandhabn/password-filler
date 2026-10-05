import React from 'react';
import { usePasswordsController } from '../../controllers/usePasswordsController';
import { useVaultController } from '../../controllers/useVaultController';
import { PasswordsView } from '../../views/passwords/PasswordsView';
import { VaultGateView } from '../../views/vault/VaultGateView';

// Re-export models for backward compatibility
export type { DeletedPasswordEntry, PasswordEntry } from '../../models/password.model';

const PasswordsWorkspace: React.FC<{ vaultKey: CryptoKey; onLock: () => void }> = ({
  vaultKey,
  onLock,
}) => {
  const controller = usePasswordsController(vaultKey, onLock);
  return <PasswordsView controller={controller} />;
};

export default function Passwords() {
  const vault = useVaultController();

  if (vault.status !== 'unlocked') {
    return (
      <VaultGateView
        status={vault.status}
        passwordInput={vault.passwordInput}
        setPasswordInput={vault.setPasswordInput}
        confirmInput={vault.confirmInput}
        setConfirmInput={vault.setConfirmInput}
        error={vault.error}
        onSetup={vault.handleSetup}
        onUnlock={vault.handleUnlock}
      />
    );
  }

  return <PasswordsWorkspace vaultKey={vault.vaultKey!} onLock={vault.handleLock} />;
}
