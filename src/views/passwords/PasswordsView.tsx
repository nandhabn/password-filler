import React from 'react';
import { PasswordsController } from '../../controllers/usePasswordsController';
import { normalizeSite, resolveAssociatedSite } from '../../models/association.model';
import { BulkRenameView } from './BulkRenameView';
import { DeletedPasswordsView } from './DeletedPasswordsView';
import { PasswordCardView } from './PasswordCardView';
import { PasswordSearchBarView } from './PasswordSearchBarView';
import { PasswordsToolbarView } from './PasswordsToolbarView';
import { SessionSiteBannerView } from './SessionSiteBannerView';
import { SiteGroupView } from './SiteGroupView';
import { TenantGroupView } from './TenantGroupView';

interface PasswordsViewProps {
  controller: PasswordsController;
}

export const PasswordsView: React.FC<PasswordsViewProps> = ({ controller }) => {
  const {
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
  } = controller;

  return (
    <div>
      <datalist id={siteDatalistId}>
        {availableSites.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <datalist id={tenantDatalistId}>
        {availableTenantsForSite.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {/* Session Site Banner */}
      <SessionSiteBannerView
        sessionSite={sessionSite}
        availableSites={availableSites}
        onUpdateSessionSite={updateSessionSite}
      />

      {/* Toolbar */}
      <PasswordsToolbarView
        showDeletedView={showDeletedView}
        entriesCount={entries.length}
        deletedEntriesCount={deletedEntries.length}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        menuRef={menuRef}
        onAdd={() => addNewEntry()}
        onExport={exportPasswords}
        onImport={importPasswords}
        onOpenBulkRename={openBulkRenameView}
        onOpenDeletedView={openDeletedView}
        onLock={onLock}
      />

      {/* Search Input */}
      {!showDeletedView && !showBulkRenameView && (
        <PasswordSearchBarView
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      )}

      {showDeletedView ? (
        <DeletedPasswordsView
          deletedEntries={deletedEntries}
          onClose={closeDeletedView}
          onRestore={restoreDeletedEntry}
          onClearAll={clearDeletedEntries}
        />
      ) : showBulkRenameView ? (
        <BulkRenameView
          bulkMode={bulkMode}
          onModeChange={setBulkMode}
          availableSites={availableSites}
          bulkAvailableTenants={bulkAvailableTenants}
          bulkTargetSite={bulkTargetSite}
          onTargetSiteChange={(s) => {
            setBulkTargetSite(s);
            setBulkTargetTenant('');
          }}
          bulkTargetTenant={bulkTargetTenant}
          onTargetTenantChange={(t) => {
            setBulkTargetTenant(t);
            setBulkNewName(t);
          }}
          bulkNewName={bulkNewName}
          onNewNameChange={setBulkNewName}
          findReplaceField={findReplaceField}
          onFindReplaceFieldChange={setFindReplaceField}
          findText={findText}
          onFindTextChange={setFindText}
          replaceText={replaceText}
          onReplaceTextChange={setReplaceText}
          bulkAffectedCount={bulkAffectedCount}
          bulkStatusMsg={bulkStatusMsg}
          onClose={closeBulkRenameView}
          onExecuteBulkTenantRename={executeBulkTenantRename}
          onExecuteBulkSiteRename={executeBulkSiteRename}
          onExecuteFindAndReplace={executeFindAndReplace}
        />
      ) : (
        <>
          {activeSite && (
            <div className="association-banner">
              <span>
                Host: <strong>{activeSite}</strong>
                {associations[normalizeSite(activeSite)]
                  ? ` -> ${resolveAssociatedSite(activeSite, associations)}`
                  : ''}
              </span>
              {associations[normalizeSite(activeSite)] && (
                <button className="link-btn" onClick={clearActiveSiteAssociation}>
                  Clear Link
                </button>
              )}
            </div>
          )}

          {entries.length === 0 && <p className="empty">No saved passwords</p>}
          {entries.length > 0 && filteredEntries.length === 0 && (
            <p className="empty">No passwords match "{searchQuery}"</p>
          )}

          {groupedData.map(({ site, siteEntries, tenants }) => {
            const isCollapsed = collapsedSites.has(site);
            const linkedSites = [
              ...new Set(siteEntries.map((e) => normalizeSite(e.site || 'other'))),
            ].filter((s) => s !== site);

            const isSessionSiteMatch = sessionSite && normalizeSite(site) === normalizeSite(sessionSite);
            const isAssociated = resolveAssociatedSite(activeSite, associations) === normalizeSite(site);

            return (
              <SiteGroupView
                key={site}
                site={site}
                totalCount={siteEntries.length}
                linkedSites={linkedSites}
                isCollapsed={isCollapsed}
                isSessionSiteMatch={Boolean(isSessionSiteMatch)}
                isDragOverSite={dragOverSite === site}
                isRenaming={renamingSite === site}
                renameInput={renameSiteInput}
                activeSite={activeSite}
                isAssociated={isAssociated}
                onToggleCollapse={() => toggleSiteCollapse(site)}
                onStartRename={() => {
                  setRenamingSite(site);
                  setRenameSiteInput(site);
                }}
                onCancelRename={() => setRenamingSite(null)}
                onSaveRename={() => saveSiteRename(site, renameSiteInput)}
                onRenameInputChange={setRenameSiteInput}
                onAdd={() => addNewEntry(site)}
                onAssociate={() => associateActiveSiteTo(site)}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (draggedEntryId) {
                    setDragOverSite(site);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverSite === site) {
                    setDragOverSite(null);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggedEntryId) {
                    moveEntryToTenant(draggedEntryId, site, '');
                  }
                  setDraggedEntryId(null);
                  setDragOverSite(null);
                  setDragOverEntryId(null);
                  setDragOverTenantKey(null);
                }}
              >
                {tenants.map(([tenantName, tenantEntries]) => {
                  const tenantKey = `${site}::${tenantName || '__default__'}`;
                  const isTenantCollapsed = collapsedTenants.has(tenantKey);
                  const showTenantBar = tenants.length > 1 || (tenants.length === 1 && tenantName !== '');

                  return (
                    <TenantGroupView
                      key={tenantKey}
                      tenantName={tenantName}
                      count={tenantEntries.length}
                      tenantKey={tenantKey}
                      isCollapsed={isTenantCollapsed}
                      isDragOverTenant={dragOverTenantKey === tenantKey}
                      isDragOverContainer={dragOverTenantKey === tenantKey}
                      showTenantBar={showTenantBar}
                      isRenaming={renamingTenantKey === tenantKey}
                      renameInput={renameTenantInput}
                      onToggleCollapse={() => toggleTenantCollapse(tenantKey)}
                      onStartRename={() => {
                        setRenamingTenantKey(tenantKey);
                        setRenameTenantInput(tenantName);
                      }}
                      onCancelRename={() => setRenamingTenantKey(null)}
                      onSaveRename={() => saveTenantRename(site, tenantName, renameTenantInput)}
                      onRenameInputChange={setRenameTenantInput}
                      onAddUser={() => addNewEntry(site, tenantName)}
                      onDragOverContainer={(event) => {
                        event.preventDefault();
                        if (draggedEntryId && !dragOverEntryId) {
                          setDragOverTenantKey(tenantKey);
                        }
                      }}
                      onDragLeaveContainer={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          if (dragOverTenantKey === tenantKey) {
                            setDragOverTenantKey(null);
                          }
                        }
                      }}
                      onDropContainer={(event) => {
                        event.preventDefault();
                        if (draggedEntryId) {
                          moveEntryToTenant(draggedEntryId, site, tenantName);
                        }
                        setDraggedEntryId(null);
                        setDragOverTenantKey(null);
                        setDragOverEntryId(null);
                      }}
                      onDragOverHeader={(event) => {
                        event.preventDefault();
                        if (draggedEntryId) {
                          setDragOverTenantKey(tenantKey);
                        }
                      }}
                      onDragLeaveHeader={() => {
                        if (dragOverTenantKey === tenantKey) {
                          setDragOverTenantKey(null);
                        }
                      }}
                      onDropHeader={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (draggedEntryId) {
                          moveEntryToTenant(draggedEntryId, site, tenantName);
                        }
                        setDraggedEntryId(null);
                        setDragOverTenantKey(null);
                        setDragOverEntryId(null);
                      }}
                    >
                      {tenantEntries.map((entry) => (
                        <PasswordCardView
                          key={entry.id}
                          entry={entry}
                          isVisible={visibleIds.has(entry.id)}
                          isEditing={editingId === entry.id}
                          isDragOver={dragOverEntryId === entry.id}
                          editSite={editSite}
                          editTenant={editTenant}
                          editUsername={editUsername}
                          editPassword={editPassword}
                          siteDatalistId={siteDatalistId}
                          tenantDatalistId={tenantDatalistId}
                          onToggleVisibility={() => toggleVisibility(entry.id)}
                          onStartEdit={() => startEdit(entry)}
                          onCancelEdit={cancelEdit}
                          onSaveEdit={saveEdit}
                          onDuplicate={() => duplicateEntry(entry)}
                          onDelete={() => deleteEntry(entry.id)}
                          onEditSiteChange={setEditSite}
                          onEditTenantChange={setEditTenant}
                          onEditUsernameChange={setEditUsername}
                          onEditPasswordChange={setEditPassword}
                          onDragStart={() => setDraggedEntryId(entry.id)}
                          onDragEnd={() => {
                            setDraggedEntryId(null);
                            setDragOverEntryId(null);
                            setDragOverTenantKey(null);
                            setDragOverSite(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (draggedEntryId && draggedEntryId !== entry.id) {
                              setDragOverEntryId(entry.id);
                            }
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (draggedEntryId && draggedEntryId !== entry.id) {
                              reorderEntries(draggedEntryId, entry.id);
                            }
                            setDraggedEntryId(null);
                            setDragOverEntryId(null);
                            setDragOverTenantKey(null);
                          }}
                        />
                      ))}
                    </TenantGroupView>
                  );
                })}
              </SiteGroupView>
            );
          })}
        </>
      )}
    </div>
  );
};
