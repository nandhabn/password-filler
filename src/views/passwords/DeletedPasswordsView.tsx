import React from 'react';
import { DeletedPasswordEntry } from '../../models/password.model';

interface DeletedPasswordsViewProps {
  deletedEntries: DeletedPasswordEntry[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onClearAll: () => void;
}

export const DeletedPasswordsView: React.FC<DeletedPasswordsViewProps> = ({
  deletedEntries,
  onClose,
  onRestore,
  onClearAll,
}) => {
  return (
    <div className="deleted-view">
      <div className="deleted-view-header">
        <button className="link-btn" onClick={onClose}>
          Back
        </button>
        <span>Recently Deleted ({deletedEntries.length})</span>
        <button
          className="link-btn"
          onClick={onClearAll}
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
            <button className="link-btn" onClick={() => onRestore(entry.id)}>
              Restore
            </button>
          </div>
        ))
      )}
    </div>
  );
};
