import { useEffect, useMemo, useState } from 'react';

type SiteAssociationsMap = Record<string, string>;

interface AssociationRow {
  source: string;
  target: string;
  resolvedTarget: string;
}

export default function SiteAssociations() {
  const [associations, setAssociations] = useState<SiteAssociationsMap>({});
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editSourceValue, setEditSourceValue] = useState('');
  const [editTargetValue, setEditTargetValue] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['siteAssociations'], (result) => {
      setAssociations(result.siteAssociations || {});
    });
  }, []);

  const normalizeSite = (site: string) => site.trim().toLowerCase();

  const resolveAssociatedSite = (site: string, map: SiteAssociationsMap) => {
    let current = normalizeSite(site);
    const visited = new Set<string>();

    while (map[current] && !visited.has(current)) {
      visited.add(current);
      current = normalizeSite(map[current]);
    }

    return current;
  };

  const rows = useMemo<AssociationRow[]>(() => {
    return Object.entries(associations)
      .map(([source, target]) => ({
        source,
        target,
        resolvedTarget: resolveAssociatedSite(source, associations),
      }))
      .sort((a, b) => a.source.localeCompare(b.source));
  }, [associations]);

  const saveAssociations = (updated: SiteAssociationsMap) => {
    setAssociations(updated);
    chrome.storage.local.set({ siteAssociations: updated });
  };

  const removeAssociation = (sourceSite: string) => {
    const next = { ...associations };
    delete next[sourceSite];
    saveAssociations(next);
  };

  const clearAllAssociations = () => {
    saveAssociations({});
  };

  const startEdit = (row: AssociationRow) => {
    setEditingSource(row.source);
    setEditSourceValue(row.source);
    setEditTargetValue(row.target);
  };

  const cancelEdit = () => {
    setEditingSource(null);
    setEditSourceValue('');
    setEditTargetValue('');
  };

  const saveEdit = () => {
    if (!editingSource) return;

    const normalizedSource = normalizeSite(editSourceValue);
    const normalizedTarget = normalizeSite(editTargetValue);
    if (!normalizedSource || !normalizedTarget) return;

    const next = { ...associations };
    delete next[editingSource];
    next[normalizedSource] = normalizedTarget;
    saveAssociations(next);
    cancelEdit();
  };

  return (
    <div>
      <div className="associations-header">
        <h3>Website Associations</h3>
        <button
          className="link-btn"
          onClick={clearAllAssociations}
          disabled={rows.length === 0}
          title="Remove all website associations"
        >
          Clear All
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="empty">No website associations yet</p>
      ) : (
        rows.map((row) => (
          <div key={row.source} className="association-row-card">
            {editingSource === row.source ? (
              <div className="association-edit-form">
                <input
                  value={editSourceValue}
                  onChange={(event) => setEditSourceValue(event.target.value)}
                  placeholder="Source site"
                />
                <input
                  value={editTargetValue}
                  onChange={(event) => setEditTargetValue(event.target.value)}
                  placeholder="Target site"
                />
                <div className="association-row-actions">
                  <button className="link-btn" onClick={saveEdit}>Save</button>
                  <button className="link-btn" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="association-row-text">
                  <p>
                    <strong>{row.source}</strong>{' -> '}<strong>{row.target}</strong>
                  </p>
                  <span>Resolved target: {row.resolvedTarget}</span>
                </div>
                <div className="association-row-actions">
                  <button
                    className="link-btn"
                    title={`Edit association for ${row.source}`}
                    onClick={() => startEdit(row)}
                  >
                    Edit
                  </button>
                  <button
                    className="link-btn"
                    title={`Remove association for ${row.source}`}
                    onClick={() => removeAssociation(row.source)}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  );
}
