import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { decryptJSON, deriveKeyRawB64, encryptJSON, generateSaltB64, importAesKey } from '../../shared/crypto';
import {
  DELETED_PASSWORDS_STORAGE_KEY,
  PASSWORDS_STORAGE_KEY,
  getUnlockedKey,
  isVaultConfigured,
  loadEncryptedList,
  lockVault,
  saveEncryptedList,
  setupVault,
  touchActivity,
  unlockVault,
} from '../../shared/vault';

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

type SiteAssociations = Record<string, string>;

function PasswordsWorkspace({ vaultKey, onLock }: { vaultKey: CryptoKey; onLock: () => void }) {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [deletedEntries, setDeletedEntries] = useState<DeletedPasswordEntry[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSite, setEditSite] = useState('');
  const [editTenant, setEditTenant] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [activeSite, setActiveSite] = useState('');
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [sessionSite, setSessionSite] = useState('');
  const [associations, setAssociations] = useState<SiteAssociations>({});
  const [showDeletedView, setShowDeletedView] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragOverEntryId, setDragOverEntryId] = useState<string | null>(null);
  const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
  const [collapsedTenants, setCollapsedTenants] = useState<Set<string>>(new Set());
  const [dragOverTenantKey, setDragOverTenantKey] = useState<string | null>(null);
  const [dragOverSite, setDragOverSite] = useState<string | null>(null);

  // Inline rename state
  const [renamingSite, setRenamingSite] = useState<string | null>(null);
  const [renameSiteInput, setRenameSiteInput] = useState('');
  const [renamingTenantKey, setRenamingTenantKey] = useState<string | null>(null);
  const [renameTenantInput, setRenameTenantInput] = useState('');

  // Bulk rename view state
  const [showBulkRenameView, setShowBulkRenameView] = useState(false);
  const [bulkMode, setBulkMode] = useState<'tenant' | 'site' | 'findReplace'>('tenant');
  const [bulkTargetSite, setBulkTargetSite] = useState('');
  const [bulkTargetTenant, setBulkTargetTenant] = useState('');
  const [bulkNewName, setBulkNewName] = useState('');
  const [findReplaceField, setFindReplaceField] = useState<'all' | 'site' | 'tenant' | 'username'>('all');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [bulkStatusMsg, setBulkStatusMsg] = useState('');

  const menuRef = useRef<HTMLDivElement | null>(null);
  const siteDatalistId = useId();
  const tenantDatalistId = useId();

  const normalizeSite = (site: string) => (site || '').trim().toLowerCase();
  const normalizeTenant = (tenant?: string) => (tenant || '').trim();

  const formatSiteDisplay = (siteStr: string) => {
    if (!siteStr) return 'other';
    let cleaned = siteStr.trim();
    cleaned = cleaned.replace(/^https?:\/\//i, '');
    cleaned = cleaned.replace(/\/+$/, '');
    return cleaned || siteStr;
  };

  useEffect(() => {
    (async () => {
      const [pwEntries, delEntries, assocResult] = await Promise.all([
        loadEncryptedList<PasswordEntry>(vaultKey, PASSWORDS_STORAGE_KEY),
        loadEncryptedList<DeletedPasswordEntry>(vaultKey, DELETED_PASSWORDS_STORAGE_KEY),
        chrome.storage.local.get(['siteAssociations']),
      ]);
      setEntries(pwEntries);
      setDeletedEntries(delEntries);
      setAssociations(assocResult.siteAssociations || {});
    })();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      if (tab.id) setActiveTabId(tab.id);

      if (tab.url) {
        try {
          setActiveSite(new URL(tab.url).hostname.toLowerCase());
        } catch {
          // ignore invalid/internal URLs
        }
      }

      // Query session site from background
      chrome.runtime.sendMessage({ type: 'GET_SESSION_SITE', tabId: tab.id }, (res) => {
        if (res?.sessionSite) {
          setSessionSite(res.sessionSite);
        }
      });
    });
  }, []);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, []);

  const saveEntries = (updated: PasswordEntry[]) => {
    setEntries(updated);
    saveEncryptedList(vaultKey, PASSWORDS_STORAGE_KEY, updated);
    touchActivity();
  };

  const saveDeletedEntries = (updated: DeletedPasswordEntry[]) => {
    setDeletedEntries(updated);
    saveEncryptedList(vaultKey, DELETED_PASSWORDS_STORAGE_KEY, updated);
    touchActivity();
  };

  const resolveAssociatedSite = (site: string, map: SiteAssociations) => {
    let current = normalizeSite(site);
    const visited = new Set<string>();

    while (map[current] && !visited.has(current)) {
      visited.add(current);
      current = normalizeSite(map[current]);
    }

    return current;
  };

  const saveAssociations = (updated: SiteAssociations) => {
    setAssociations(updated);
    chrome.storage.local.set({ siteAssociations: updated });
  };

  const associateActiveSiteTo = (targetSite: string) => {
    if (!activeSite) return;

    const normalizedActive = normalizeSite(activeSite);
    const normalizedTarget = normalizeSite(targetSite);
    const resolvedTarget = resolveAssociatedSite(normalizedTarget, associations);

    const next = { ...associations };

    if (normalizedActive === resolvedTarget) {
      delete next[normalizedActive];
      saveAssociations(next);
      return;
    }

    next[normalizedActive] = resolvedTarget;
    saveAssociations(next);
  };

  const clearActiveSiteAssociation = () => {
    if (!activeSite) return;

    const normalizedActive = normalizeSite(activeSite);
    if (!associations[normalizedActive]) return;

    const next = { ...associations };
    delete next[normalizedActive];
    saveAssociations(next);
  };

  const updateSessionSite = async (newSite: string) => {
    if (!activeTabId) return;
    if (newSite) {
      await chrome.runtime.sendMessage({
        type: 'SET_SESSION_SITE',
        tabId: activeTabId,
        site: newSite,
      });
      setSessionSite(newSite);
    } else {
      await chrome.runtime.sendMessage({
        type: 'RESET_SESSION_SITE',
        tabId: activeTabId,
      });
      setSessionSite('');
    }
  };

  // Distinct sites list
  const availableSites = useMemo(() => {
    return Array.from(new Set(entries.map((e) => normalizeSite(e.site)).filter(Boolean))).sort();
  }, [entries]);

  // Distinct tenants for the currently edited site
  const availableTenantsForSite = useMemo(() => {
    const target = normalizeSite(editSite);
    const matched = entries.filter((e) => !target || normalizeSite(e.site) === target);
    return Array.from(new Set(matched.map((e) => normalizeTenant(e.tenant)).filter(Boolean))).sort();
  }, [entries, editSite]);

  // Distinct tenants for the selected site in bulk rename
  const bulkAvailableTenants = useMemo(() => {
    const normSite = normalizeSite(bulkTargetSite);
    const matched = normSite
      ? entries.filter(
          (e) =>
            normalizeSite(e.site) === normSite ||
            resolveAssociatedSite(e.site || 'other', associations) === normSite,
        )
      : entries;
    return Array.from(new Set(matched.map((e) => normalizeTenant(e.tenant)).filter(Boolean))).sort();
  }, [entries, bulkTargetSite, associations]);

  // Count of affected entries for the selected bulk rename action
  const bulkAffectedCount = useMemo(() => {
    if (bulkMode === 'tenant') {
      if (!bulkTargetTenant) return 0;
      const normOld = normalizeTenant(bulkTargetTenant);
      const normSite = normalizeSite(bulkTargetSite);
      return entries.filter((e) => {
        const siteMatch =
          !normSite ||
          normalizeSite(e.site) === normSite ||
          resolveAssociatedSite(e.site || 'other', associations) === normSite;
        return siteMatch && normalizeTenant(e.tenant) === normOld;
      }).length;
    }
    if (bulkMode === 'site') {
      if (!bulkTargetSite) return 0;
      const normOld = normalizeSite(bulkTargetSite);
      return entries.filter((e) => normalizeSite(e.site) === normOld).length;
    }
    if (bulkMode === 'findReplace') {
      if (!findText) return 0;
      return entries.filter((e) => {
        if ((findReplaceField === 'all' || findReplaceField === 'site') && e.site.includes(findText)) return true;
        if ((findReplaceField === 'all' || findReplaceField === 'tenant') && e.tenant && e.tenant.includes(findText)) return true;
        if ((findReplaceField === 'all' || findReplaceField === 'username') && e.username.includes(findText)) return true;
        return false;
      }).length;
    }
    return 0;
  }, [bulkMode, bulkTargetSite, bulkTargetTenant, findReplaceField, findText, entries]);

  const addNewEntry = (prefillSite?: string, prefillTenant?: string) => {
    const siteVal = prefillSite || sessionSite || activeSite || '';
    const tenantVal = prefillTenant || '';
    const newEntry: PasswordEntry = {
      id: crypto.randomUUID(),
      site: siteVal,
      tenant: tenantVal,
      username: '',
      password: '',
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    setEditingId(newEntry.id);
    setEditSite(siteVal);
    setEditTenant(tenantVal);
    setEditUsername('');
    setEditPassword('');
  };

  const deleteEntry = (id: string) => {
    const removed = entries.find((e) => e.id === id);
    if (!removed) return;

    saveEntries(entries.filter((e) => e.id !== id));
    setVisibleIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    const deletedItem: DeletedPasswordEntry = {
      ...removed,
      deletedAt: Date.now(),
    };
    saveDeletedEntries([deletedItem, ...deletedEntries]);

    if (editingId === id) setEditingId(null);
  };

  const restoreDeletedEntry = (id: string) => {
    const restored = deletedEntries.find((entry) => entry.id === id);
    if (!restored) return;

    const { deletedAt: _deletedAt, ...entry } = restored;
    saveEntries([entry, ...entries]);
    saveDeletedEntries(deletedEntries.filter((deleted) => deleted.id !== id));
  };

  const clearDeletedEntries = () => {
    if (deletedEntries.length === 0) return;
    if (!window.confirm(`Permanently delete all ${deletedEntries.length} recently deleted password(s)? This cannot be undone.`)) return;
    saveDeletedEntries([]);
  };

  const openDeletedView = () => {
    setShowMenu(false);
    setShowDeletedView(true);
  };

  const closeDeletedView = () => {
    setShowDeletedView(false);
  };

  const openBulkRenameView = () => {
    setShowMenu(false);
    setShowBulkRenameView(true);
    setBulkStatusMsg('');
  };

  const closeBulkRenameView = () => {
    setShowBulkRenameView(false);
    setBulkStatusMsg('');
  };

  const saveSiteRename = (oldSite: string, newSite: string) => {
    const normOld = normalizeSite(oldSite);
    const normNew = normalizeSite(newSite);
    if (!normNew || normOld === normNew) {
      setRenamingSite(null);
      return;
    }

    const updated = entries.map((e) =>
      normalizeSite(e.site) === normOld ? { ...e, site: normNew } : e,
    );

    const nextAssoc = { ...associations };
    let assocChanged = false;
    for (const [k, v] of Object.entries(nextAssoc)) {
      if (k === normOld) {
        delete nextAssoc[k];
        nextAssoc[normNew] = v;
        assocChanged = true;
      }
      if (v === normOld) {
        nextAssoc[k] = normNew;
        assocChanged = true;
      }
    }
    if (assocChanged) saveAssociations(nextAssoc);

    if (sessionSite && normalizeSite(sessionSite) === normOld) {
      updateSessionSite(normNew);
    }

    saveEntries(updated);
    setRenamingSite(null);
  };

  const saveTenantRename = (site: string, oldTenant: string, newTenant: string) => {
    const normOld = normalizeTenant(oldTenant);
    const normNew = normalizeTenant(newTenant);
    const normSite = normalizeSite(site);

    if (normOld === normNew) {
      setRenamingTenantKey(null);
      return;
    }

    const updated = entries.map((e) => {
      const siteMatch =
        normalizeSite(e.site) === normSite ||
        resolveAssociatedSite(e.site || 'other', associations) === normSite;
      if (siteMatch && normalizeTenant(e.tenant) === normOld) {
        return {
          ...e,
          tenant: normNew ? newTenant.trim() : undefined,
        };
      }
      return e;
    });

    saveEntries(updated);
    setRenamingTenantKey(null);
  };

  const executeBulkTenantRename = () => {
    const normOld = normalizeTenant(bulkTargetTenant);
    const normNew = normalizeTenant(bulkNewName);
    const normSite = normalizeSite(bulkTargetSite);

    if (!bulkTargetTenant || !bulkNewName.trim() || normOld === normNew) return;
    if (!window.confirm(`Rename tenant "${bulkTargetTenant}" to "${bulkNewName.trim()}" for ${bulkAffectedCount} password(s)?`)) return;

    let count = 0;
    const updated = entries.map((e) => {
      const siteMatch =
        !normSite ||
        normalizeSite(e.site) === normSite ||
        resolveAssociatedSite(e.site || 'other', associations) === normSite;
      if (siteMatch && normalizeTenant(e.tenant) === normOld) {
        count++;
        return {
          ...e,
          tenant: normNew ? bulkNewName.trim() : undefined,
        };
      }
      return e;
    });

    saveEntries(updated);
    setBulkStatusMsg(
      `Successfully renamed tenant "${bulkTargetTenant}" to "${bulkNewName.trim()}" for ${count} password(s)!`,
    );
    setBulkTargetTenant(bulkNewName.trim());
    setBulkNewName('');
    setTimeout(() => setBulkStatusMsg(''), 4000);
  };

  const executeBulkSiteRename = () => {
    const normOld = normalizeSite(bulkTargetSite);
    const normNew = normalizeSite(bulkNewName);
    if (!normOld || !normNew || normOld === normNew) return;
    if (!window.confirm(`Rename site "${bulkTargetSite}" to "${normNew}" for ${bulkAffectedCount} password(s)?`)) return;

    let count = 0;
    const updated = entries.map((e) => {
      if (normalizeSite(e.site) === normOld) {
        count++;
        return { ...e, site: normNew };
      }
      return e;
    });

    const nextAssoc = { ...associations };
    let assocChanged = false;
    for (const [k, v] of Object.entries(nextAssoc)) {
      if (k === normOld) {
        delete nextAssoc[k];
        nextAssoc[normNew] = v;
        assocChanged = true;
      }
      if (v === normOld) {
        nextAssoc[k] = normNew;
        assocChanged = true;
      }
    }
    if (assocChanged) saveAssociations(nextAssoc);

    if (sessionSite && normalizeSite(sessionSite) === normOld) {
      updateSessionSite(normNew);
    }

    saveEntries(updated);
    setBulkStatusMsg(
      `Successfully renamed site "${bulkTargetSite}" to "${normNew}" for ${count} password(s)!`,
    );
    setBulkTargetSite(normNew);
    setBulkNewName('');
    setTimeout(() => setBulkStatusMsg(''), 4000);
  };

  const executeFindAndReplace = () => {
    if (!findText) return;
    if (!window.confirm(`Apply find & replace to ${bulkAffectedCount} password(s)?`)) return;

    let count = 0;
    const updated = entries.map((e) => {
      let changed = false;
      let newSite = e.site;
      let newTenant = e.tenant;
      let newUsername = e.username;

      if ((findReplaceField === 'all' || findReplaceField === 'site') && newSite.includes(findText)) {
        newSite = newSite.split(findText).join(replaceText);
        changed = true;
      }
      if (
        (findReplaceField === 'all' || findReplaceField === 'tenant') &&
        newTenant &&
        newTenant.includes(findText)
      ) {
        newTenant = newTenant.split(findText).join(replaceText);
        changed = true;
      }
      if (
        (findReplaceField === 'all' || findReplaceField === 'username') &&
        newUsername.includes(findText)
      ) {
        newUsername = newUsername.split(findText).join(replaceText);
        changed = true;
      }

      if (changed) {
        count++;
        return {
          ...e,
          site: newSite,
          tenant: newTenant?.trim() || undefined,
          username: newUsername,
        };
      }
      return e;
    });

    saveEntries(updated);
    setBulkStatusMsg(`Find & replace completed: updated ${count} password(s)!`);
    setTimeout(() => setBulkStatusMsg(''), 4000);
  };

  const reorderEntries = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const targetEntry = entries[targetIndex];
    const next = [...entries];
    const [moved] = next.splice(sourceIndex, 1);

    // When dropped on an entry in another tenant or site, adopt the target's tenant and site
    const updatedMoved: PasswordEntry = {
      ...moved,
      site: targetEntry.site,
      tenant: targetEntry.tenant,
    };

    next.splice(targetIndex, 0, updatedMoved);
    saveEntries(next);
  };

  const moveEntryToTenant = (sourceId: string, targetSite: string, targetTenant: string) => {
    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    if (sourceIndex === -1) return;

    const sourceEntry = entries[sourceIndex];
    const normTargetSite = normalizeSite(targetSite);
    const normTargetTenant = normalizeTenant(targetTenant);

    if (
      normalizeSite(sourceEntry.site) === normTargetSite &&
      normalizeTenant(sourceEntry.tenant) === normTargetTenant
    ) {
      return;
    }

    const next = [...entries];
    const [moved] = next.splice(sourceIndex, 1);
    const updatedMoved: PasswordEntry = {
      ...moved,
      site: targetSite,
      tenant: targetTenant.trim() ? targetTenant.trim() : undefined,
    };

    // Find the first index of the target tenant group in next, or prepend
    const targetGroupIndex = next.findIndex(
      (e) =>
        normalizeSite(e.site) === normTargetSite &&
        normalizeTenant(e.tenant) === normTargetTenant
    );

    if (targetGroupIndex !== -1) {
      next.splice(targetGroupIndex, 0, updatedMoved);
    } else {
      next.unshift(updatedMoved);
    }

    saveEntries(next);
  };

  const toggleVisibility = (id: string) => {
    const next = new Set(visibleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisibleIds(next);
  };

  const startEdit = (entry: PasswordEntry) => {
    setEditingId(entry.id);
    setEditSite(entry.site);
    setEditTenant(entry.tenant || '');
    setEditUsername(entry.username);
    setEditPassword(entry.password);
  };

  const cancelEdit = () => {
    if (editingId) {
      const entry = entries.find((e) => e.id === editingId);
      if (entry && !entry.site && !entry.username && !entry.password) {
        saveEntries(entries.filter((e) => e.id !== editingId));
      }
    }
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId || !editSite.trim() || !editUsername.trim() || !editPassword.trim()) return;
    const updated = entries.map((e) =>
      e.id === editingId
        ? {
            ...e,
            site: normalizeSite(editSite),
            tenant: editTenant.trim() || undefined,
            username: editUsername.trim(),
            password: editPassword.trim(),
          }
        : e,
    );
    saveEntries(updated);
    setEditingId(null);
  };

  const duplicateEntry = (entry: PasswordEntry) => {
    const newEntry: PasswordEntry = {
      id: crypto.randomUUID(),
      site: entry.site,
      tenant: entry.tenant,
      username: entry.username,
      password: entry.password,
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    setEditingId(newEntry.id);
    setEditSite(newEntry.site);
    setEditTenant(newEntry.tenant || '');
    setEditUsername(newEntry.username);
    setEditPassword(newEntry.password);
  };

  const exportPasswords = async () => {
    if (entries.length === 0) return;
    const exportPassword = window.prompt(
      'Set a password to encrypt this export file (you will need it to import the file later).\n\nLeave blank to export as plain, unencrypted JSON (not recommended).',
    );
    if (exportPassword === null) return;

    let payloadStr: string;
    if (exportPassword.trim()) {
      const salt = generateSaltB64();
      const rawKeyB64 = await deriveKeyRawB64(exportPassword.trim(), salt);
      const exportKey = await importAesKey(rawKeyB64);
      const encrypted = await encryptJSON(exportKey, entries);
      payloadStr = JSON.stringify({ version: 1, encrypted: true, salt, ...encrypted });
    } else {
      if (!window.confirm('Export as plain, unencrypted JSON? Anyone with this file can read all your saved passwords.')) return;
      payloadStr = JSON.stringify(entries, null, 2);
    }

    const blob = new Blob([payloadStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'passwords-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importPasswords = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          let importedList: any[] | null = null;

          if (parsed && parsed.encrypted && parsed.salt && parsed.iv && parsed.data) {
            const importPassword = window.prompt('Enter the password used to encrypt this export file:');
            if (!importPassword) return;
            const rawKeyB64 = await deriveKeyRawB64(importPassword, parsed.salt);
            const importKey = await importAesKey(rawKeyB64);
            try {
              importedList = await decryptJSON<any[]>(importKey, { iv: parsed.iv, data: parsed.data });
            } catch {
              window.alert('Incorrect password or corrupted file.');
              return;
            }
          } else if (Array.isArray(parsed)) {
            if (!window.confirm('This file is unencrypted. Import anyway?')) return;
            importedList = parsed;
          }

          if (!Array.isArray(importedList)) return;
          const valid: PasswordEntry[] = importedList
            .filter((item: any) => item.site && item.username && item.password)
            .map((item: any) => ({
              id: crypto.randomUUID(),
              site: String(item.site).trim().toLowerCase(),
              tenant: item.tenant ? String(item.tenant).trim() : undefined,
              username: String(item.username).trim(),
              password: String(item.password).trim(),
            }));
          if (valid.length > 0) {
            saveEntries([...valid, ...entries]);
          }
        } catch {
          /* ignore invalid JSON */
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.trim().toLowerCase();
    return entries.filter(
      (e) =>
        normalizeSite(e.site).includes(q) ||
        (e.tenant && e.tenant.toLowerCase().includes(q)) ||
        e.username.toLowerCase().includes(q),
    );
  }, [entries, searchQuery]);

  // Group filtered entries by Site -> Tenant
  const groupedData = useMemo(() => {
    const siteGroups = filteredEntries.reduce<Record<string, PasswordEntry[]>>((groups, entry) => {
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
      // Group site entries by Tenant
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
  }, [filteredEntries, associations, sessionSite, activeSite]);

  return (
    <div>
      <datalist id={siteDatalistId}>
        {availableSites.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id={tenantDatalistId}>
        {availableTenantsForSite.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Session Site Banner */}
      <div className="session-site-banner">
        <div className="session-site-status">
          <span className="session-site-label">Tab Session:</span>
          {sessionSite ? (
            <span className="session-site-active" title="Credentials for this site persist for this tab">
              ⚡ <strong>{sessionSite}</strong>
            </span>
          ) : (
            <span className="session-site-none">None (using host / login)</span>
          )}
        </div>
        <div className="session-site-actions">
          <select
            className="session-site-select"
            value={sessionSite}
            onChange={(e) => updateSessionSite(e.target.value)}
            title="Lock credentials for this tab session"
          >
            <option value="">-- Change Site --</option>
            {availableSites.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {sessionSite && (
            <button
              className="link-btn reset-btn"
              onClick={() => updateSessionSite('')}
              title="Reset session site for this tab"
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      <div className="passwords-toolbar">
        {!showDeletedView && (
          <div className="import-export-actions">
            <button className="primary" onClick={() => addNewEntry()}>
              ➕ Add
            </button>
            <button
              onClick={exportPasswords}
              disabled={entries.length === 0}
              title="Export passwords to JSON file"
            >
              ⬇️ Export
            </button>
            <button onClick={importPasswords} title="Import passwords from JSON file">
              ⬆️ Import
            </button>
          </div>
        )}

        <div className="more-menu" ref={menuRef}>
          <button
            className="more-menu-trigger"
            title="More options"
            onClick={() => setShowMenu((prev) => !prev)}
          >
            ⋯
          </button>
          {showMenu && (
            <div className="more-menu-dropdown">
              <button onClick={openBulkRenameView}>✏️ Bulk Rename...</button>
              <button onClick={openDeletedView}>Recently Deleted ({deletedEntries.length})</button>
              <button onClick={() => { setShowMenu(false); onLock(); }}>🔒 Lock</button>
            </div>
          )}
        </div>
      </div>

      {/* Search Input */}
      {!showDeletedView && !showBulkRenameView && (
        <div className="search-bar-container">
          <input
            className="search-input"
            placeholder="🔍 Search site, tenant, or user..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      )}

      {showDeletedView ? (
        <div className="deleted-view">
          <div className="deleted-view-header">
            <button className="link-btn" onClick={closeDeletedView}>
              Back
            </button>
            <span>Recently Deleted ({deletedEntries.length})</span>
            <button
              className="link-btn"
              onClick={clearDeletedEntries}
              disabled={deletedEntries.length === 0}
              title="Permanently remove all deleted passwords"
            >
              Clear All
            </button>
          </div>

          {deletedEntries.length === 0 ? (
            <p className="empty">No deleted passwords</p>
          ) : (
            deletedEntries.map((entry) => (
              <div key={entry.id} className="recently-deleted-row recently-deleted-card">
                <div>
                  <p>
                    {entry.username} {entry.tenant ? <span className="tenant-badge">{entry.tenant}</span> : null}
                  </p>
                  <span>{entry.site}</span>
                  <small>{new Date(entry.deletedAt).toLocaleString()}</small>
                </div>
                <button className="link-btn" onClick={() => restoreDeletedEntry(entry.id)}>
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      ) : showBulkRenameView ? (
        <div className="bulk-rename-view">
          <div className="deleted-view-header">
            <button className="link-btn" onClick={closeBulkRenameView}>
              Back
            </button>
            <span>Bulk Rename Tool</span>
            <span style={{ width: 40 }}></span>
          </div>

          <div className="bulk-mode-selector">
            <button
              className={`bulk-mode-btn${bulkMode === 'tenant' ? ' active' : ''}`}
              onClick={() => {
                setBulkMode('tenant');
                setBulkStatusMsg('');
              }}
            >
              🏢 Tenant
            </button>
            <button
              className={`bulk-mode-btn${bulkMode === 'site' ? ' active' : ''}`}
              onClick={() => {
                setBulkMode('site');
                setBulkStatusMsg('');
              }}
            >
              🌐 Site
            </button>
            <button
              className={`bulk-mode-btn${bulkMode === 'findReplace' ? ' active' : ''}`}
              onClick={() => {
                setBulkMode('findReplace');
                setBulkStatusMsg('');
              }}
            >
              🔍 Find & Replace
            </button>
          </div>

          {bulkMode === 'tenant' && (
            <div className="bulk-form">
              <label>Filter by Site (optional):</label>
              <select
                value={bulkTargetSite}
                onChange={(e) => {
                  setBulkTargetSite(e.target.value);
                  setBulkTargetTenant('');
                }}
              >
                <option value="">-- All Sites --</option>
                {availableSites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label>Select Tenant to Rename:</label>
              <select
                value={bulkTargetTenant}
                onChange={(e) => {
                  setBulkTargetTenant(e.target.value);
                  setBulkNewName(e.target.value);
                }}
              >
                <option value="">-- Choose Tenant --</option>
                {bulkAvailableTenants.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <label>New Tenant Name:</label>
              <input
                placeholder="Enter new tenant name"
                value={bulkNewName}
                onChange={(e) => setBulkNewName(e.target.value)}
              />

              <button
                className="primary"
                disabled={
                  !bulkTargetTenant ||
                  !bulkNewName.trim() ||
                  normalizeTenant(bulkTargetTenant) === normalizeTenant(bulkNewName)
                }
                onClick={executeBulkTenantRename}
              >
                Rename Tenant ({bulkAffectedCount} affected)
              </button>
            </div>
          )}

          {bulkMode === 'site' && (
            <div className="bulk-form">
              <label>Select Site to Rename:</label>
              <select
                value={bulkTargetSite}
                onChange={(e) => {
                  setBulkTargetSite(e.target.value);
                  setBulkNewName(e.target.value);
                }}
              >
                <option value="">-- Choose Site --</option>
                {availableSites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <label>New Site Name / URL:</label>
              <input
                placeholder="e.g. new-domain.com or dev-vgpf.valgenesis.org"
                value={bulkNewName}
                onChange={(e) => setBulkNewName(e.target.value)}
              />

              <button
                className="primary"
                disabled={
                  !bulkTargetSite ||
                  !bulkNewName.trim() ||
                  normalizeSite(bulkTargetSite) === normalizeSite(bulkNewName)
                }
                onClick={executeBulkSiteRename}
              >
                Rename Site ({bulkAffectedCount} affected)
              </button>
            </div>
          )}

          {bulkMode === 'findReplace' && (
            <div className="bulk-form">
              <label>Scope / Field:</label>
              <select
                value={findReplaceField}
                onChange={(e) => setFindReplaceField(e.target.value as any)}
              >
                <option value="all">Site & Tenant & Username</option>
                <option value="site">Site Only</option>
                <option value="tenant">Tenant Only</option>
                <option value="username">Username Only</option>
              </select>

              <label>Text to Find:</label>
              <input
                placeholder="Text to match (e.g. dev-)"
                value={findText}
                onChange={(e) => setFindText(e.target.value)}
              />

              <label>Replace With:</label>
              <input
                placeholder="Replacement text (e.g. prod-)"
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
              />

              <button
                className="primary"
                disabled={!findText}
                onClick={executeFindAndReplace}
              >
                Apply Find & Replace ({bulkAffectedCount} matches)
              </button>
            </div>
          )}

          {bulkStatusMsg && <div className="bulk-status">{bulkStatusMsg}</div>}
        </div>
      ) : (
        <>
          {activeSite && (
            <div className="association-banner">
              <span>
                Host: <strong>{activeSite}</strong>
                {associations[normalizeSite(activeSite)]
                  ? ` -> ${resolveAssociatedSite(activeSite, associations)}`
                  : ''}
              </span>
              {associations[normalizeSite(activeSite)] && (
                <button className="link-btn" onClick={clearActiveSiteAssociation}>
                  Clear Link
                </button>
              )}
            </div>
          )}

          {entries.length === 0 && <p className="empty">No saved passwords</p>}
          {entries.length > 0 && filteredEntries.length === 0 && (
            <p className="empty">No passwords match "{searchQuery}"</p>
          )}

          {groupedData.map(({ site, siteEntries, tenants }) => {
            const isCollapsed = collapsedSites.has(site);
            const linkedSites = [
              ...new Set(siteEntries.map((e) => normalizeSite(e.site || 'other'))),
            ].filter((s) => s !== site);

            const isSessionSiteMatch = sessionSite && normalizeSite(site) === normalizeSite(sessionSite);

            return (
              <div key={site} className={`site-group${isSessionSiteMatch ? ' site-group-session' : ''}`}>
                <div
                  className={`site-group-header${dragOverSite === site ? ' drag-over-site' : ''}`}
                  onClick={() => {
                    if (renamingSite === site) return;
                    setCollapsedSites((prev) => {
                      const next = new Set(prev);
                      if (next.has(site)) next.delete(site);
                      else next.add(site);
                      return next;
                    });
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedEntryId) {
                      setDragOverSite(site);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverSite === site) {
                      setDragOverSite(null);
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (draggedEntryId) {
                      moveEntryToTenant(draggedEntryId, site, '');
                    }
                    setDraggedEntryId(null);
                    setDragOverSite(null);
                    setDragOverEntryId(null);
                    setDragOverTenantKey(null);
                  }}
                >
                  {renamingSite === site ? (
                    <div className="inline-rename-form" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={renameSiteInput}
                        onChange={(e) => setRenameSiteInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSiteRename(site, renameSiteInput);
                          if (e.key === 'Escape') setRenamingSite(null);
                        }}
                        autoFocus
                        placeholder="New site name"
                      />
                      <button
                        className="link-btn primary-btn"
                        onClick={() => saveSiteRename(site, renameSiteInput)}
                        title="Save site rename"
                      >
                        Save
                      </button>
                      <button
                        className="link-btn"
                        onClick={() => setRenamingSite(null)}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="site-group-title">
                      <span className={`collapse-arrow${isCollapsed ? ' collapsed' : ''}`}>▼</span>
                      <span className="site-name-text" title={site}>
                        {formatSiteDisplay(site)}
                      </span>
                      {isSessionSiteMatch && <span className="session-active-pill">Session</span>}
                      {linkedSites.length > 0 && (
                        <span className="linked-sites">({linkedSites.map(formatSiteDisplay).join(', ')})</span>
                      )}
                      <span className="site-group-count">{siteEntries.length}</span>
                    </span>
                  )}

                  <div className="site-group-tools" onClick={(e) => e.stopPropagation()}>
                    {renamingSite !== site && (
                      <button
                        className="link-btn"
                        onClick={() => {
                          setRenamingSite(site);
                          setRenameSiteInput(site);
                        }}
                        title={`Rename site ${site}`}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      className="link-btn add-tenant-btn"
                      onClick={() => addNewEntry(site)}
                      title={`Add password or new tenant under ${site}`}
                    >
                      + Add
                    </button>
                    {activeSite && normalizeSite(activeSite) !== normalizeSite(site) && (
                      <button
                        className="link-btn"
                        onClick={() => associateActiveSiteTo(site)}
                        title={`Associate ${activeSite} with ${site}`}
                      >
                        {resolveAssociatedSite(activeSite, associations) === normalizeSite(site)
                          ? 'Associated'
                          : 'Link'}
                      </button>
                    )}
                    <a
                      href={site.startsWith('http') ? site : `https://${site}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="site-link"
                      title={`Open ${site}`}
                    >
                      🔗
                    </a>
                  </div>
                </div>

                {!isCollapsed &&
                  tenants.map(([tenantName, tenantEntries]) => {
                    const tenantKey = `${site}::${tenantName || '__default__'}`;
                    const isTenantCollapsed = collapsedTenants.has(tenantKey);
                    const showTenantBar = tenants.length > 1 || (tenants.length === 1 && tenantName !== '');

                    return (
                      <div
                        key={tenantKey}
                        className={`tenant-container${dragOverTenantKey === tenantKey ? ' drag-over-tenant-container' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (draggedEntryId && !dragOverEntryId) {
                            setDragOverTenantKey(tenantKey);
                          }
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            if (dragOverTenantKey === tenantKey) {
                              setDragOverTenantKey(null);
                            }
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (draggedEntryId) {
                            moveEntryToTenant(draggedEntryId, site, tenantName);
                          }
                          setDraggedEntryId(null);
                          setDragOverTenantKey(null);
                          setDragOverEntryId(null);
                        }}
                      >
                        {showTenantBar && (
                          <div
                            className={`tenant-group-header${dragOverTenantKey === tenantKey ? ' drag-over-tenant' : ''}`}
                            onClick={() => {
                              if (renamingTenantKey === tenantKey) return;
                              setCollapsedTenants((prev) => {
                                const next = new Set(prev);
                                if (next.has(tenantKey)) next.delete(tenantKey);
                                else next.add(tenantKey);
                                return next;
                              });
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (draggedEntryId) {
                                setDragOverTenantKey(tenantKey);
                              }
                            }}
                            onDragLeave={() => {
                              if (dragOverTenantKey === tenantKey) {
                                setDragOverTenantKey(null);
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (draggedEntryId) {
                                moveEntryToTenant(draggedEntryId, site, tenantName);
                              }
                              setDraggedEntryId(null);
                              setDragOverTenantKey(null);
                              setDragOverEntryId(null);
                            }}
                          >
                            {renamingTenantKey === tenantKey ? (
                              <div className="inline-rename-form" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={renameTenantInput}
                                  onChange={(e) => setRenameTenantInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveTenantRename(site, tenantName, renameTenantInput);
                                    if (e.key === 'Escape') setRenamingTenantKey(null);
                                  }}
                                  autoFocus
                                  placeholder="Tenant name (e.g. dev, prod)"
                                />
                                <button
                                  className="link-btn primary-btn"
                                  onClick={() => saveTenantRename(site, tenantName, renameTenantInput)}
                                  title="Save tenant rename"
                                >
                                  Save
                                </button>
                                <button
                                  className="link-btn"
                                  onClick={() => setRenamingTenantKey(null)}
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <span className="tenant-group-title">
                                <span className={`collapse-arrow${isTenantCollapsed ? ' collapsed' : ''}`}>▼</span>
                                🏢 {tenantName || 'General / Default'}
                                <span className="tenant-group-count">{tenantEntries.length}</span>
                              </span>
                            )}
                            <div className="tenant-group-tools" onClick={(e) => e.stopPropagation()}>
                              {renamingTenantKey !== tenantKey && (
                                <button
                                  className="link-btn"
                                  onClick={() => {
                                    setRenamingTenantKey(tenantKey);
                                    setRenameTenantInput(tenantName);
                                  }}
                                  title={`Rename tenant ${tenantName || 'General'}`}
                                >
                                  Rename
                                </button>
                              )}
                              <button
                                className="link-btn add-user-btn"
                                onClick={() => addNewEntry(site, tenantName)}
                                title={`Add another user under tenant ${tenantName || 'General'}`}
                              >
                                + Add User
                              </button>
                            </div>
                          </div>
                        )}

                        {!isTenantCollapsed &&
                          tenantEntries.map((entry) => (
                            <div
                              key={entry.id}
                              className={`card draggable-card${dragOverEntryId === entry.id ? ' drag-over' : ''}${editingId === entry.id ? ' editing-card' : ''}`}
                              draggable={editingId !== entry.id}
                              onDragStart={() => setDraggedEntryId(entry.id)}
                              onDragEnd={() => {
                                setDraggedEntryId(null);
                                setDragOverEntryId(null);
                                setDragOverTenantKey(null);
                                setDragOverSite(null);
                              }}
                              onDragOver={(event) => {
                                event.preventDefault();
                                if (draggedEntryId && draggedEntryId !== entry.id) {
                                  setDragOverEntryId(entry.id);
                                }
                              }}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (draggedEntryId && draggedEntryId !== entry.id) {
                                  reorderEntries(draggedEntryId, entry.id);
                                }
                                setDraggedEntryId(null);
                                setDragOverEntryId(null);
                                setDragOverTenantKey(null);
                              }}
                            >
                              {editingId !== entry.id && (
                                <div className="card-actions">
                                  <button
                                    className="icon-btn"
                                    title="Edit"
                                    onClick={() => startEdit(entry)}
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    className="icon-btn"
                                    title="Duplicate"
                                    onClick={() => duplicateEntry(entry)}
                                  >
                                    📋
                                  </button>
                                  <button
                                    className="icon-btn delete"
                                    title="Delete"
                                    onClick={() => deleteEntry(entry.id)}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}

                              {editingId === entry.id ? (
                                <div className="edit-form">
                                  <input
                                    value={editSite}
                                    onChange={(e) => setEditSite(e.target.value)}
                                    placeholder="Site (e.g. portal.company.com)"
                                    list={siteDatalistId}
                                  />
                                  <input
                                    value={editTenant}
                                    onChange={(e) => setEditTenant(e.target.value)}
                                    placeholder="Tenant (e.g. Acme Corp, Beta LLC)"
                                    list={tenantDatalistId}
                                  />
                                  <input
                                    value={editUsername}
                                    onChange={(e) => setEditUsername(e.target.value)}
                                    placeholder="Username / Email"
                                  />
                                  <input
                                    value={editPassword}
                                    onChange={(e) => setEditPassword(e.target.value)}
                                    placeholder="Password"
                                    type="text"
                                  />
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                    <button className="primary" onClick={saveEdit}>
                                      Save
                                    </button>
                                    <button onClick={cancelEdit}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="card-user-line">
                                    <p>
                                      <strong>User:</strong> {entry.username}
                                    </p>
                                    {entry.tenant && (
                                      <span className="tenant-badge" title="Tenant">
                                        {entry.tenant}
                                      </span>
                                    )}
                                  </div>
                                  <p className="password-value">
                                    <strong>Pass:</strong>{' '}
                                    {visibleIds.has(entry.id) ? entry.password : '••••••••'}
                                    <button onClick={() => toggleVisibility(entry.id)}>
                                      {visibleIds.has(entry.id) ? 'Hide' : 'Show'}
                                    </button>
                                  </p>
                                </>
                              )}
                            </div>
                          ))}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

type VaultStatus = 'loading' | 'setup' | 'locked' | 'unlocked';

export default function Passwords() {
  const [status, setStatus] = useState<VaultStatus>('loading');
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const configured = await isVaultConfigured();
      if (!configured) {
        setStatus('setup');
        return;
      }
      const key = await getUnlockedKey();
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
      const key = await getUnlockedKey();
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
    const key = await setupVault(passwordInput);
    chrome.runtime.sendMessage({ type: 'VAULT_UNLOCKED' });
    setVaultKey(key);
    setStatus('unlocked');
    setPasswordInput('');
    setConfirmInput('');
  };

  const handleUnlock = async () => {
    setError('');
    const key = await unlockVault(passwordInput);
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
    await lockVault();
    chrome.runtime.sendMessage({ type: 'VAULT_LOCKED' });
    setVaultKey(null);
    setStatus('locked');
    setPasswordInput('');
  };

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
          onKeyDown={(e) => e.key === 'Enter' && handleSetup()}
        />
        {error && <p className="vault-error">{error}</p>}
        <button className="primary" onClick={handleSetup}>
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
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          autoFocus
        />
        {error && <p className="vault-error">{error}</p>}
        <button className="primary" onClick={handleUnlock}>
          Unlock
        </button>
      </div>
    );
  }

  return <PasswordsWorkspace vaultKey={vaultKey!} onLock={handleLock} />;
}
