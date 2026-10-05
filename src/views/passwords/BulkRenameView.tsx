import React from 'react';
import { normalizeSite } from '../../models/association.model';
import { normalizeTenant } from '../../models/password.model';

interface BulkRenameViewProps {
  bulkMode: 'tenant' | 'site' | 'findReplace';
  onModeChange: (mode: 'tenant' | 'site' | 'findReplace') => void;
  availableSites: string[];
  bulkAvailableTenants: string[];
  bulkTargetSite: string;
  onTargetSiteChange: (site: string) => void;
  bulkTargetTenant: string;
  onTargetTenantChange: (tenant: string) => void;
  bulkNewName: string;
  onNewNameChange: (val: string) => void;
  findReplaceField: 'all' | 'site' | 'tenant' | 'username';
  onFindReplaceFieldChange: (field: 'all' | 'site' | 'tenant' | 'username') => void;
  findText: string;
  onFindTextChange: (val: string) => void;
  replaceText: string;
  onReplaceTextChange: (val: string) => void;
  bulkAffectedCount: number;
  bulkStatusMsg: string;
  onClose: () => void;
  onExecuteBulkTenantRename: () => void;
  onExecuteBulkSiteRename: () => void;
  onExecuteFindAndReplace: () => void;
}

export const BulkRenameView: React.FC<BulkRenameViewProps> = ({
  bulkMode,
  onModeChange,
  availableSites,
  bulkAvailableTenants,
  bulkTargetSite,
  onTargetSiteChange,
  bulkTargetTenant,
  onTargetTenantChange,
  bulkNewName,
  onNewNameChange,
  findReplaceField,
  onFindReplaceFieldChange,
  findText,
  onFindTextChange,
  replaceText,
  onReplaceTextChange,
  bulkAffectedCount,
  bulkStatusMsg,
  onClose,
  onExecuteBulkTenantRename,
  onExecuteBulkSiteRename,
  onExecuteFindAndReplace,
}) => {
  return (
    <div className="bulk-rename-view">
      <div className="deleted-view-header">
        <button className="link-btn" onClick={onClose}>
          Back
        </button>
        <span>Bulk Rename Tool</span>
        <span style={{ width: 40 }}></span>
      </div>

      <div className="bulk-mode-selector">
        <button
          className={`bulk-mode-btn${bulkMode === 'tenant' ? ' active' : ''}`}
          onClick={() => onModeChange('tenant')}
        >
          🏢 Tenant
        </button>
        <button
          className={`bulk-mode-btn${bulkMode === 'site' ? ' active' : ''}`}
          onClick={() => onModeChange('site')}
        >
          🌐 Site
        </button>
        <button
          className={`bulk-mode-btn${bulkMode === 'findReplace' ? ' active' : ''}`}
          onClick={() => onModeChange('findReplace')}
        >
          🔍 Find & Replace
        </button>
      </div>

      {bulkMode === 'tenant' && (
        <div className="bulk-form">
          <label>Filter by Site (optional):</label>
          <select
            value={bulkTargetSite}
            onChange={(e) => onTargetSiteChange(e.target.value)}
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
            onChange={(e) => onTargetTenantChange(e.target.value)}
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
            onChange={(e) => onNewNameChange(e.target.value)}
          />

          <button
            className="primary"
            disabled={
              !bulkTargetTenant ||
              !bulkNewName.trim() ||
              normalizeTenant(bulkTargetTenant) === normalizeTenant(bulkNewName)
            }
            onClick={onExecuteBulkTenantRename}
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
            onChange={(e) => onTargetSiteChange(e.target.value)}
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
            onChange={(e) => onNewNameChange(e.target.value)}
          />

          <button
            className="primary"
            disabled={
              !bulkTargetSite ||
              !bulkNewName.trim() ||
              normalizeSite(bulkTargetSite) === normalizeSite(bulkNewName)
            }
            onClick={onExecuteBulkSiteRename}
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
            onChange={(e) => onFindReplaceFieldChange(e.target.value as any)}
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
            onChange={(e) => onFindTextChange(e.target.value)}
          />

          <label>Replace With:</label>
          <input
            placeholder="Replacement text (e.g. prod-)"
            value={replaceText}
            onChange={(e) => onReplaceTextChange(e.target.value)}
          />

          <button
            className="primary"
            disabled={!findText}
            onClick={onExecuteFindAndReplace}
          >
            Apply Find & Replace ({bulkAffectedCount} matches)
          </button>
        </div>
      )}

      {bulkStatusMsg && <div className="bulk-status">{bulkStatusMsg}</div>}
    </div>
  );
};
