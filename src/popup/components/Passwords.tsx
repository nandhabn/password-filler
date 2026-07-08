import { useEffect, useRef, useState } from 'react';

interface PasswordEntry {
  id: string;
  site: string;
  username: string;
  password: string;
}

interface DeletedPasswordEntry extends PasswordEntry {
  deletedAt: number;
}

type SiteAssociations = Record<string, string>;

export default function Passwords() {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [deletedEntries, setDeletedEntries] = useState<DeletedPasswordEntry[]>([]);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSite, setEditSite] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [activeSite, setActiveSite] = useState('');
  const [associations, setAssociations] = useState<SiteAssociations>({});
  const [showDeletedView, setShowDeletedView] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragOverEntryId, setDragOverEntryId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chrome.storage.local.get(['passwords', 'siteAssociations', 'deletedPasswords'], (result) => {
      setEntries(result.passwords || []);
      setAssociations(result.siteAssociations || {});
      setDeletedEntries(result.deletedPasswords || []);
    });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabUrl = tabs[0]?.url;
      if (!tabUrl) return;

      try {
        setActiveSite(new URL(tabUrl).hostname.toLowerCase());
      } catch {
        // ignore invalid/unsupported URLs like chrome:// pages
      }
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
    chrome.storage.local.set({ passwords: updated });
  };

  const normalizeSite = (site: string) => site.trim().toLowerCase();

  const saveDeletedEntries = (updated: DeletedPasswordEntry[]) => {
    setDeletedEntries(updated);
    chrome.storage.local.set({ deletedPasswords: updated });
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

  const addNewEntry = () => {
    const newEntry: PasswordEntry = {
      id: crypto.randomUUID(),
      site: '',
      username: '',
      password: '',
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    setEditingId(newEntry.id);
    setEditSite('');
    setEditUsername('');
    setEditPassword('');
  };

  const deleteEntry = (id: string) => {
    const removed = entries.find(e => e.id === id);
    if (!removed) return;

    saveEntries(entries.filter(e => e.id !== id));
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
    saveDeletedEntries([]);
  };

  const openDeletedView = () => {
    setShowMenu(false);
    setShowDeletedView(true);
  };

  const closeDeletedView = () => {
    setShowDeletedView(false);
  };

  const reorderEntries = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;

    const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
    const targetIndex = entries.findIndex((entry) => entry.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const next = [...entries];
    const [moved] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, moved);
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
    setEditUsername(entry.username);
    setEditPassword(entry.password);
  };

  const cancelEdit = () => {
    if (editingId) {
      const entry = entries.find(e => e.id === editingId);
      // If the entry is empty (unsaved new entry), remove it
      if (entry && !entry.site && !entry.username && !entry.password) {
        saveEntries(entries.filter(e => e.id !== editingId));
      }
    }
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editingId || !editSite.trim() || !editUsername.trim() || !editPassword.trim()) return;
    const updated = entries.map(e =>
      e.id === editingId
        ? { ...e, site: normalizeSite(editSite), username: editUsername.trim(), password: editPassword.trim() }
        : e
    );
    saveEntries(updated);
    setEditingId(null);
  };

  const duplicateEntry = (entry: PasswordEntry) => {
    const newEntry: PasswordEntry = {
      id: crypto.randomUUID(),
      site: entry.site,
      username: entry.username,
      password: entry.password,
    };
    const updated = [newEntry, ...entries];
    saveEntries(updated);
    // Open the duplicate in edit mode
    setEditingId(newEntry.id);
    setEditSite(newEntry.site);
    setEditUsername(newEntry.username);
    setEditPassword(newEntry.password);
  };

  const exportPasswords = () => {
    if (entries.length === 0) return;
    const data = JSON.stringify(entries, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
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
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target?.result as string);
          if (!Array.isArray(imported)) return;
          const valid: PasswordEntry[] = imported
            .filter((item: any) => item.site && item.username && item.password)
            .map((item: any) => ({
              id: crypto.randomUUID(),
              site: String(item.site),
              username: String(item.username),
              password: String(item.password),
            }));
          if (valid.length > 0) {
            saveEntries([...valid, ...entries]);
          }
        } catch { /* ignore invalid JSON */ }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div>
      <div className="passwords-toolbar">
        {!showDeletedView && (
          <div className="import-export-actions">
            <button className="primary" onClick={addNewEntry}>➕ Add</button>
            <button onClick={exportPasswords} disabled={entries.length === 0} title="Export passwords to JSON file">⬇️ Export</button>
            <button onClick={importPasswords} title="Import passwords from JSON file">⬆️ Import</button>
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
              <button onClick={openDeletedView}>Recently Deleted ({deletedEntries.length})</button>
            </div>
          )}
        </div>
      </div>

      {showDeletedView ? (
        <div className="deleted-view">
          <div className="deleted-view-header">
            <button className="link-btn" onClick={closeDeletedView}>Back</button>
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
                  <p>{entry.username}</p>
                  <span>{entry.site}</span>
                  <small>{new Date(entry.deletedAt).toLocaleString()}</small>
                </div>
                <button className="link-btn" onClick={() => restoreDeletedEntry(entry.id)}>Restore</button>
              </div>
            ))
          )}
        </div>
      ) : (
        <>

          {activeSite && (
            <div className="association-banner">
              <span>
                Current site: <strong>{activeSite}</strong>
                {associations[normalizeSite(activeSite)]
                  ? ` -> ${resolveAssociatedSite(activeSite, associations)}`
                  : ''}
              </span>
              {associations[normalizeSite(activeSite)] && (
                <button className="link-btn" onClick={clearActiveSiteAssociation}>Clear Link</button>
              )}
            </div>
          )}

          {entries.length === 0 && <p className="empty">No saved passwords</p>}
          {Object.entries(
            entries.reduce<Record<string, PasswordEntry[]>>((groups, entry) => {
              const key = resolveAssociatedSite(entry.site || 'other', associations);
              if (!groups[key]) groups[key] = [];
              groups[key].push(entry);
              return groups;
            }, {})
          ).map(([site, groupEntries]) => (
            <div key={site} className="site-group">
              <div className="site-group-header">
                <span>{site}</span>
                <div className="site-group-tools">
                  {activeSite && normalizeSite(activeSite) !== normalizeSite(site) && (
                    <button
                      className="link-btn"
                      onClick={() => associateActiveSiteTo(site)}
                      title={`Associate ${activeSite} with ${site}`}
                    >
                      {resolveAssociatedSite(activeSite, associations) === normalizeSite(site)
                        ? 'Associated'
                        : 'Associate Here'}
                    </button>
                  )}
                  <a
                    href={site.startsWith('http') ? site : `https://${site}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="site-link"
                    title={`Open ${site}`}
                  >🔗</a>
                </div>
              </div>
              {groupEntries.map(entry => (
                  <div
                    key={entry.id}
                    className={`card draggable-card${dragOverEntryId === entry.id ? ' drag-over' : ''}`}
                    draggable={editingId !== entry.id}
                    onDragStart={() => setDraggedEntryId(entry.id)}
                    onDragEnd={() => {
                      setDraggedEntryId(null);
                      setDragOverEntryId(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (draggedEntryId && draggedEntryId !== entry.id) {
                        setDragOverEntryId(entry.id);
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedEntryId && draggedEntryId !== entry.id) {
                        reorderEntries(draggedEntryId, entry.id);
                      }
                      setDraggedEntryId(null);
                      setDragOverEntryId(null);
                    }}
                  >
                  <div className="card-actions">
                    <button className="icon-btn" title="Edit" onClick={() => startEdit(entry)}>✏️</button>
                    <button className="icon-btn" title="Duplicate" onClick={() => duplicateEntry(entry)}>📋</button>
                    <button className="icon-btn delete" title="Delete" onClick={() => deleteEntry(entry.id)}>🗑️</button>
                  </div>
                  {editingId === entry.id ? (
                    <div className="edit-form">
                      <input value={editSite} onChange={e => setEditSite(e.target.value)} placeholder="Site" />
                      <input value={editUsername} onChange={e => setEditUsername(e.target.value)} placeholder="Username" />
                      <input value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Password" type="text" />
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <button className="primary" onClick={saveEdit}>Save</button>
                        <button onClick={cancelEdit}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p>User: {entry.username}</p>
                      <p className="password-value">
                        Pass: {visibleIds.has(entry.id) ? entry.password : '••••••••'}
                        <button onClick={() => toggleVisibility(entry.id)}>
                          {visibleIds.has(entry.id) ? 'Hide' : 'Show'}
                        </button>
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
