import React from 'react';
import { PasswordEntry } from '../../models/password.model';

interface PasswordCardViewProps {
  entry: PasswordEntry;
  isVisible: boolean;
  isEditing: boolean;
  isDragOver: boolean;
  editSite: string;
  editTenant: string;
  editUsername: string;
  editPassword: string;
  siteDatalistId: string;
  tenantDatalistId: string;
  onToggleVisibility: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onEditSiteChange: (val: string) => void;
  onEditTenantChange: (val: string) => void;
  onEditUsernameChange: (val: string) => void;
  onEditPasswordChange: (val: string) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

export const PasswordCardView: React.FC<PasswordCardViewProps> = ({
  entry,
  isVisible,
  isEditing,
  isDragOver,
  editSite,
  editTenant,
  editUsername,
  editPassword,
  siteDatalistId,
  tenantDatalistId,
  onToggleVisibility,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDuplicate,
  onDelete,
  onEditSiteChange,
  onEditTenantChange,
  onEditUsernameChange,
  onEditPasswordChange,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) => {
  return (
    <div
      className={`card draggable-card${isDragOver ? ' drag-over' : ''}${isEditing ? ' editing-card' : ''}`}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {!isEditing && (
        <div className="card-actions">
          <button className="icon-btn" title="Edit" onClick={onStartEdit}>
            ✏️
          </button>
          <button className="icon-btn" title="Duplicate" onClick={onDuplicate}>
            📋
          </button>
          <button className="icon-btn delete" title="Delete" onClick={onDelete}>
            🗑️
          </button>
        </div>
      )}

      {isEditing ? (
        <div className="edit-form">
          <input
            value={editSite}
            onChange={(e) => onEditSiteChange(e.target.value)}
            placeholder="Site (e.g. portal.company.com)"
            list={siteDatalistId}
          />
          <input
            value={editTenant}
            onChange={(e) => onEditTenantChange(e.target.value)}
            placeholder="Tenant (e.g. Acme Corp, Beta LLC)"
            list={tenantDatalistId}
          />
          <input
            value={editUsername}
            onChange={(e) => onEditUsernameChange(e.target.value)}
            placeholder="Username / Email"
          />
          <input
            value={editPassword}
            onChange={(e) => onEditPasswordChange(e.target.value)}
            placeholder="Password"
            type="text"
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button className="primary" onClick={onSaveEdit}>
              Save
            </button>
            <button onClick={onCancelEdit}>Cancel</button>
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
            <strong>Pass:</strong> {isVisible ? entry.password : '••••••••'}
            <button onClick={onToggleVisibility}>{isVisible ? 'Hide' : 'Show'}</button>
          </p>
        </>
      )}
    </div>
  );
};
