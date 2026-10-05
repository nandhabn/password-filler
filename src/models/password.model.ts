import {
  decryptJSON,
  deriveKeyRawB64,
  encryptJSON,
  generateSaltB64,
  importAesKey,
} from '../shared/crypto';
import {
  DELETED_PASSWORDS_STORAGE_KEY,
  PASSWORDS_STORAGE_KEY,
  loadEncryptedList,
  saveEncryptedList,
  touchActivity,
} from '../shared/vault';
import { SiteAssociationsMap, normalizeSite, resolveAssociatedSite } from './association.model';

export interface PasswordEntry {
  id: string;
  site: string;
  tenant?: string;
  username: string;
  password: string;
}

export interface DeletedPasswordEntry extends PasswordEntry {
  deletedAt: number;
}

export interface GroupedSite {
  site: string;
  siteEntries: PasswordEntry[];
  tenants: [string, PasswordEntry[]][];
}

export function normalizeTenant(tenant?: string): string {
  return (tenant || '').trim();
}

export function formatSiteDisplay(siteStr: string): string {
  if (!siteStr) return 'other';
  let cleaned = siteStr.trim();
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/\/+$/, '');
  return cleaned || siteStr;
}

export const PasswordModel = {
  normalizeSite,
  normalizeTenant,
  formatSiteDisplay,

  async loadPasswords(vaultKey: CryptoKey): Promise<PasswordEntry[]> {
    return loadEncryptedList<PasswordEntry>(vaultKey, PASSWORDS_STORAGE_KEY);
  },

  async savePasswords(vaultKey: CryptoKey, entries: PasswordEntry[]): Promise<void> {
    await saveEncryptedList(vaultKey, PASSWORDS_STORAGE_KEY, entries);
    await touchActivity();
  },

  async loadDeletedPasswords(vaultKey: CryptoKey): Promise<DeletedPasswordEntry[]> {
    return loadEncryptedList<DeletedPasswordEntry>(vaultKey, DELETED_PASSWORDS_STORAGE_KEY);
  },

  async saveDeletedPasswords(vaultKey: CryptoKey, entries: DeletedPasswordEntry[]): Promise<void> {
    await saveEncryptedList(vaultKey, DELETED_PASSWORDS_STORAGE_KEY, entries);
    await touchActivity();
  },

  filterEntries(entries: PasswordEntry[], searchQuery: string): PasswordEntry[] {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(
      (e) =>
        normalizeSite(e.site).includes(q) ||
        (e.tenant && e.tenant.toLowerCase().includes(q)) ||
        e.username.toLowerCase().includes(q),
    );
  },

  groupEntries(
    entries: PasswordEntry[],
    associations: SiteAssociationsMap,
    sessionSite?: string,
    activeSite?: string,
  ): GroupedSite[] {
    const siteGroups = entries.reduce<Record<string, PasswordEntry[]>>((groups, entry) => {
      const key = resolveAssociatedSite(entry.site || 'other', associations);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
      return groups;
    }, {});

    const sortedSites = Object.entries(siteGroups).sort(([a], [b]) => {
      const preferred = sessionSite
        ? resolveAssociatedSite(sessionSite, associations)
        : activeSite
        ? resolveAssociatedSite(activeSite, associations)
        : '';
      const aMatch = normalizeSite(a) === preferred ? -1 : 0;
      const bMatch = normalizeSite(b) === preferred ? -1 : 0;
      return aMatch - bMatch;
    });

    return sortedSites.map(([site, siteEntries]) => {
      const tenantGroups = siteEntries.reduce<Record<string, PasswordEntry[]>>((tGroups, entry) => {
        const tKey = normalizeTenant(entry.tenant);
        if (!tGroups[tKey]) tGroups[tKey] = [];
        tGroups[tKey].push(entry);
        return tGroups;
      }, {});

      const sortedTenants = Object.entries(tenantGroups).sort(([a], [b]) => {
        if (!a) return 1;
        if (!b) return -1;
        return a.localeCompare(b);
      });

      return {
        site,
        siteEntries,
        tenants: sortedTenants,
      };
    });
  },

  reorderEntries(entries: PasswordEntry[], sourceId: string, targetId: string): PasswordEntry[] {
    if (sourceId === targetId) return entries;

    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return entries;

    const targetEntry = entries[targetIndex];
    const next = [...entries];
    const [moved] = next.splice(sourceIndex, 1);

    const updatedMoved: PasswordEntry = {
      ...moved,
      site: targetEntry.site,
      tenant: targetEntry.tenant,
    };

    next.splice(targetIndex, 0, updatedMoved);
    return next;
  },

  moveEntryToTenant(
    entries: PasswordEntry[],
    sourceId: string,
    targetSite: string,
    targetTenant: string,
  ): PasswordEntry[] {
    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    if (sourceIndex === -1) return entries;

    const sourceEntry = entries[sourceIndex];
    const normTargetSite = normalizeSite(targetSite);
    const normTargetTenant = normalizeTenant(targetTenant);

    if (
      normalizeSite(sourceEntry.site) === normTargetSite &&
      normalizeTenant(sourceEntry.tenant) === normTargetTenant
    ) {
      return entries;
    }

    const next = [...entries];
    const [moved] = next.splice(sourceIndex, 1);
    const updatedMoved: PasswordEntry = {
      ...moved,
      site: targetSite,
      tenant: targetTenant.trim() ? targetTenant.trim() : undefined,
    };

    const targetGroupIndex = next.findIndex(
      (e) =>
        normalizeSite(e.site) === normTargetSite &&
        normalizeTenant(e.tenant) === normTargetTenant,
    );

    if (targetGroupIndex !== -1) {
      next.splice(targetGroupIndex, 0, updatedMoved);
    } else {
      next.unshift(updatedMoved);
    }

    return next;
  },

  async serializeExport(entries: PasswordEntry[], exportPassword?: string): Promise<string> {
    if (exportPassword && exportPassword.trim()) {
      const salt = generateSaltB64();
      const rawKeyB64 = await deriveKeyRawB64(exportPassword.trim(), salt);
      const exportKey = await importAesKey(rawKeyB64);
      const encrypted = await encryptJSON(exportKey, entries);
      return JSON.stringify({ version: 1, encrypted: true, salt, ...encrypted });
    }
    return JSON.stringify(entries, null, 2);
  },

  async parseImport(
    jsonText: string,
    promptPassword: () => Promise<string | null> | string | null,
  ): Promise<PasswordEntry[]> {
    const parsed = JSON.parse(jsonText);
    let importedList: any[] | null = null;

    if (parsed && parsed.encrypted && parsed.salt && parsed.iv && parsed.data) {
      const importPassword = await promptPassword();
      if (!importPassword) return [];
      const rawKeyB64 = await deriveKeyRawB64(importPassword, parsed.salt);
      const importKey = await importAesKey(rawKeyB64);
      importedList = await decryptJSON<any[]>(importKey, { iv: parsed.iv, data: parsed.data });
    } else if (Array.isArray(parsed)) {
      importedList = parsed;
    }

    if (!Array.isArray(importedList)) return [];

    return importedList
      .filter((item: any) => item.site && item.username && item.password)
      .map((item: any) => ({
        id: crypto.randomUUID(),
        site: String(item.site).trim().toLowerCase(),
        tenant: item.tenant ? String(item.tenant).trim() : undefined,
        username: String(item.username).trim(),
        password: String(item.password).trim(),
      }));
  },
};
