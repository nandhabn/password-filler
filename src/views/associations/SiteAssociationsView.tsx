import React from 'react';
import { useAssociationsController } from '../../controllers/useAssociationsController';

interface SiteAssociationsViewProps {
  controller: ReturnType<typeof useAssociationsController>;
}

export const SiteAssociationsView: React.FC<SiteAssociationsViewProps> = ({ controller }) => {
  const {
    rows,
    editingSource,
    editSourceValue,
    setEditSourceValue,
    editTargetValue,
    setEditTargetValue,
    startEdit,
    cancelEdit,
    saveEdit,
    removeAssociation,
    clearAllAssociations,
  } = controller;

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
};
