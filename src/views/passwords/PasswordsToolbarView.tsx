import React from 'react';

interface PasswordsToolbarViewProps {
  showDeletedView: boolean;
  entriesCount: number;
  deletedEntriesCount: number;
  showMenu: boolean;
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onAdd: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenBulkRename: () => void;
  onOpenDeletedView: () => void;
  onLock: () => void;
}

export const PasswordsToolbarView: React.FC<PasswordsToolbarViewProps> = ({
  showDeletedView,
  entriesCount,
  deletedEntriesCount,
  showMenu,
  setShowMenu,
  menuRef,
  onAdd,
  onExport,
  onImport,
  onOpenBulkRename,
  onOpenDeletedView,
  onLock,
}) => {
  return (
    <div className="passwords-toolbar">
      {!showDeletedView && (
        <div className="import-export-actions">
          <button className="primary" onClick={onAdd}>
            ➕ Add
          </button>
          <button
            onClick={onExport}
            disabled={entriesCount === 0}
            title="Export passwords to JSON file"
          >
            ⬇️ Export
          </button>
          <button onClick={onImport} title="Import passwords from JSON file">
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
            <button onClick={onOpenBulkRename}>✏️ Bulk Rename...</button>
            <button onClick={onOpenDeletedView}>Recently Deleted ({deletedEntriesCount})</button>
            <button
              onClick={() => {
                setShowMenu(false);
                onLock();
              }}
            >
              🔒 Lock
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
