import React from 'react';

interface TenantGroupViewProps {
  tenantName: string;
  count: number;
  tenantKey: string;
  isCollapsed: boolean;
  isDragOverTenant: boolean;
  isDragOverContainer: boolean;
  showTenantBar: boolean;
  isRenaming: boolean;
  renameInput: string;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onRenameInputChange: (val: string) => void;
  onAddUser: () => void;
  onDragOverContainer: (event: React.DragEvent) => void;
  onDragLeaveContainer: (event: React.DragEvent) => void;
  onDropContainer: (event: React.DragEvent) => void;
  onDragOverHeader: (event: React.DragEvent) => void;
  onDragLeaveHeader: () => void;
  onDropHeader: (event: React.DragEvent) => void;
  children: React.ReactNode;
}

export const TenantGroupView: React.FC<TenantGroupViewProps> = ({
  tenantName,
  count,
  isCollapsed,
  isDragOverTenant,
  isDragOverContainer,
  showTenantBar,
  isRenaming,
  renameInput,
  onToggleCollapse,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onRenameInputChange,
  onAddUser,
  onDragOverContainer,
  onDragLeaveContainer,
  onDropContainer,
  onDragOverHeader,
  onDragLeaveHeader,
  onDropHeader,
  children,
}) => {
  return (
    <div
      className={`tenant-container${isDragOverContainer ? ' drag-over-tenant-container' : ''}`}
      onDragOver={onDragOverContainer}
      onDragLeave={onDragLeaveContainer}
      onDrop={onDropContainer}
    >
      {showTenantBar && (
        <div
          className={`tenant-group-header${isDragOverTenant ? ' drag-over-tenant' : ''}`}
          onClick={() => {
            if (isRenaming) return;
            onToggleCollapse();
          }}
          onDragOver={onDragOverHeader}
          onDragLeave={onDragLeaveHeader}
          onDrop={onDropHeader}
        >
          {isRenaming ? (
            <div className="inline-rename-form" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={renameInput}
                onChange={(e) => onRenameInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveRename();
                  if (e.key === 'Escape') onCancelRename();
                }}
                autoFocus
                placeholder="Tenant name (e.g. dev, prod)"
              />
              <button
                className="link-btn primary-btn"
                onClick={onSaveRename}
                title="Save tenant rename"
              >
                Save
              </button>
              <button
                className="link-btn"
                onClick={onCancelRename}
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <span className="tenant-group-title">
              <span className={`collapse-arrow${isCollapsed ? ' collapsed' : ''}`}>▼</span>
              🏢 {tenantName || 'General / Default'}
              <span className="tenant-group-count">{count}</span>
            </span>
          )}
          <div className="tenant-group-tools" onClick={(e) => e.stopPropagation()}>
            {!isRenaming && (
              <button
                className="link-btn"
                onClick={onStartRename}
                title={`Rename tenant ${tenantName || 'General'}`}
              >
                Rename
              </button>
            )}
            <button
              className="link-btn add-user-btn"
              onClick={onAddUser}
              title={`Add another user under tenant ${tenantName || 'General'}`}
            >
              + Add User
            </button>
          </div>
        </div>
      )}

      {!isCollapsed && children}
    </div>
  );
};
