import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AssociationModel,
  SiteAssociationsMap,
  normalizeSite,
  resolveAssociatedSite,
} from '../models/association.model';
import {
  DeletedPasswordEntry,
  PasswordEntry,
  PasswordModel,
  normalizeTenant,
} from '../models/password.model';
import { SessionSiteModel } from '../models/session.model';

export function usePasswordsController(vaultKey: CryptoKey, onLock: () => void) {
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
  const [associations, setAssociations] = useState<SiteAssociationsMap>({});
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

  useEffect(() => {
    (async () => {
      const [pwEntries, delEntries, assocMap] = await Promise.all([
        PasswordModel.loadPasswords(vaultKey),
        PasswordModel.loadDeletedPasswords(vaultKey),
        AssociationModel.loadAssociations(),
      ]);
      setEntries(pwEntries);
      setDeletedEntries(delEntries);
      setAssociations(assocMap);
    })();

    SessionSiteModel.getActiveTabInfo().then(async ({ tabId, hostname }) => {
      if (!tabId) return;
      setActiveTabId(tabId);
      if (hostname) {
        setActiveSite(hostname);
      }
      const sessSite = await SessionSiteModel.getSessionSite(tabId);
      if (sessSite) {
        setSessionSite(sessSite);
      }
    });
  }, [vaultKey]);

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
    PasswordModel.savePasswords(vaultKey, updated);
  };

  const saveDeletedEntries = (updated: DeletedPasswordEntry[]) => {
    setDeletedEntries(updated);
    PasswordModel.saveDeletedPasswords(vaultKey, updated);
  };

  const saveAssociations = (updated: SiteAssociationsMap) => {
    setAssociations(updated);
    AssociationModel.saveAssociations(updated);
  };

  const associateActiveSiteTo = (targetSite: string) => {
    if (!activeSite) return;
    const updated = AssociationModel.associateSite(associations, activeSite, targetSite);
    saveAssociations(updated);
  };

  const clearActiveSiteAssociation = () => {
    if (!activeSite) return;
    const updated = AssociationModel.clearSiteAssociation(associations, activeSite);
    saveAssociations(updated);
  };

  const updateSessionSite = async (newSite: string) => {
    if (!activeTabId) return;
    if (newSite) {
      await SessionSiteModel.setSessionSite(activeTabId, newSite);
      setSessionSite(newSite);
    } else {
      await SessionSiteModel.resetSessionSite(activeTabId);
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
  }, [bulkMode, bulkTargetSite, bulkTargetTenant, findReplaceField, findText, entries, associations]);

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

    const { updated: nextAssoc, changed: assocChanged } =
      AssociationModel.updateSiteRenameInAssociations(associations, normOld, normNew);
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

    const { updated: nextAssoc, changed: assocChanged } =
      AssociationModel.updateSiteRenameInAssociations(associations, normOld, normNew);
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
    const updated = PasswordModel.reorderEntries(entries, sourceId, targetId);
    saveEntries(updated);
  };

  const moveEntryToTenant = (sourceId: string, targetSite: string, targetTenant: string) => {
    const updated = PasswordModel.moveEntryToTenant(entries, sourceId, targetSite, targetTenant);
    saveEntries(updated);
  };

  const toggleVisibility = (id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

    if (!exportPassword.trim()) {
      if (!window.confirm('Export as plain, unencrypted JSON? Anyone with this file can read all your saved passwords.')) return;
    }

    const payloadStr = await PasswordModel.serializeExport(entries, exportPassword);
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
          const content = ev.target?.result as string;
          const valid = await PasswordModel.parseImport(content, () => {
            return window.prompt('Enter the password used to encrypt this export file:');
          });
          if (valid.length > 0) {
            saveEntries([...valid, ...entries]);
          }
        } catch {
          window.alert('Incorrect password or corrupted file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    return PasswordModel.filterEntries(entries, searchQuery);
  }, [entries, searchQuery]);

  // Group filtered entries by Site -> Tenant
  const groupedData = useMemo(() => {
    return PasswordModel.groupEntries(filteredEntries, associations, sessionSite, activeSite);
  }, [filteredEntries, associations, sessionSite, activeSite]);

  const toggleSiteCollapse = (site: string) => {
    setCollapsedSites((prev) => {
      const next = new Set(prev);
      if (next.has(site)) next.delete(site);
      else next.add(site);
      return next;
    });
  };

  const toggleTenantCollapse = (tenantKey: string) => {
    setCollapsedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenantKey)) next.delete(tenantKey);
      else next.add(tenantKey);
      return next;
    });
  };

  return {
    entries,
    deletedEntries,
    associations,
    visibleIds,
    editingId,
    editSite,
    setEditSite,
    editTenant,
    setEditTenant,
    editUsername,
    setEditUsername,
    editPassword,
    setEditPassword,
    activeSite,
    sessionSite,
    showDeletedView,
    showMenu,
    setShowMenu,
    searchQuery,
    setSearchQuery,
    draggedEntryId,
    setDraggedEntryId,
    dragOverEntryId,
    setDragOverEntryId,
    dragOverTenantKey,
    setDragOverTenantKey,
    dragOverSite,
    setDragOverSite,
    collapsedSites,
    collapsedTenants,
    renamingSite,
    setRenamingSite,
    renameSiteInput,
    setRenameSiteInput,
    renamingTenantKey,
    setRenamingTenantKey,
    renameTenantInput,
    setRenameTenantInput,
    showBulkRenameView,
    bulkMode,
    setBulkMode,
    bulkTargetSite,
    setBulkTargetSite,
    bulkTargetTenant,
    setBulkTargetTenant,
    bulkNewName,
    setBulkNewName,
    findReplaceField,
    setFindReplaceField,
    findText,
    setFindText,
    replaceText,
    setReplaceText,
    bulkStatusMsg,
    menuRef,
    siteDatalistId,
    tenantDatalistId,
    availableSites,
    availableTenantsForSite,
    bulkAvailableTenants,
    bulkAffectedCount,
    filteredEntries,
    groupedData,
    addNewEntry,
    deleteEntry,
    restoreDeletedEntry,
    clearDeletedEntries,
    openDeletedView,
    closeDeletedView,
    openBulkRenameView,
    closeBulkRenameView,
    saveSiteRename,
    saveTenantRename,
    executeBulkTenantRename,
    executeBulkSiteRename,
    executeFindAndReplace,
    reorderEntries,
    moveEntryToTenant,
    toggleVisibility,
    startEdit,
    cancelEdit,
    saveEdit,
    duplicateEntry,
    exportPasswords,
    importPasswords,
    associateActiveSiteTo,
    clearActiveSiteAssociation,
    updateSessionSite,
    toggleSiteCollapse,
    toggleTenantCollapse,
    onLock,
  };
}

export type PasswordsController = ReturnType<typeof usePasswordsController>;
