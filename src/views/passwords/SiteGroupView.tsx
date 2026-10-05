import React from 'react';
import { formatSiteDisplay } from '../../models/password.model';

interface SiteGroupViewProps {
  site: string;
  totalCount: number;
  linkedSites: string[];
  isCollapsed: boolean;
  isSessionSiteMatch: boolean;
  isDragOverSite: boolean;
  isRenaming: boolean;
  renameInput: string;
  activeSite: string;
  isAssociated: boolean;
  onToggleCollapse: () => void;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: () => void;
  onRenameInputChange: (val: string) => void;
  onAdd: () => void;
  onAssociate: () => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent) => void;
  children: React.ReactNode;
}

export const SiteGroupView: React.FC<SiteGroupViewProps> = ({
  site,
  totalCount,
  linkedSites,
  isCollapsed,
  isSessionSiteMatch,
  isDragOverSite,
  isRenaming,
  renameInput,
  activeSite,
  isAssociated,
  onToggleCollapse,
  onStartRename,
  onCancelRename,
  onSaveRename,
  onRenameInputChange,
  onAdd,
  onAssociate,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}) => {
  return (
    <div className={`site-group${isSessionSiteMatch ? ' site-group-session' : ''}`}>
      <div
        className={`site-group-header${isDragOverSite ? ' drag-over-site' : ''}`}
        onClick={() => {
          if (isRenaming) return;
          onToggleCollapse();
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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
              placeholder="New site name"
            />
            <button
              className="link-btn primary-btn"
              onClick={onSaveRename}
              title="Save site rename"
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
          <span className="site-group-title">
            <span className={`collapse-arrow${isCollapsed ? ' collapsed' : ''}`}>▼</span>
            <span className="site-name-text" title={site}>
              {formatSiteDisplay(site)}
            </span>
            {isSessionSiteMatch && <span className="session-active-pill">Session</span>}
            {linkedSites.length > 0 && (
              <span className="linked-sites">({linkedSites.map(formatSiteDisplay).join(', ')})</span>
            )}
            <span className="site-group-count">{totalCount}</span>
          </span>
        )}

        <div className="site-group-tools" onClick={(e) => e.stopPropagation()}>
          {!isRenaming && (
            <button
              className="link-btn"
              onClick={onStartRename}
              title={`Rename site ${site}`}
            >
              Rename
            </button>
          )}
          <button
            className="link-btn add-tenant-btn"
            onClick={onAdd}
            title={`Add password or new tenant under ${site}`}
          >
            + Add
          </button>
          {activeSite && (
            <button
              className="link-btn"
              onClick={onAssociate}
              title={`Associate ${activeSite} with ${site}`}
            >
              {isAssociated ? 'Associated' : 'Link'}
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

      {!isCollapsed && children}
    </div>
  );
};
