export type SiteAssociationsMap = Record<string, string>;

export interface AssociationRow {
  source: string;
  target: string;
  resolvedTarget: string;
}

export function normalizeSite(site: string): string {
  return (site || '').trim().toLowerCase();
}

export function resolveAssociatedSite(site: string, map: SiteAssociationsMap): string {
  let current = normalizeSite(site);
  const visited = new Set<string>();

  while (map[current] && !visited.has(current)) {
    visited.add(current);
    current = normalizeSite(map[current]);
  }

  return current;
}

export function siteMatches(currentHost: string, configuredSite: string): boolean {
  if (!currentHost || !configuredSite) return false;
  const h = normalizeSite(currentHost);
  const c = normalizeSite(configuredSite);
  return h.includes(c) || c.includes(h);
}

export const AssociationModel = {
  async loadAssociations(): Promise<SiteAssociationsMap> {
    const result = await chrome.storage.local.get(['siteAssociations']);
    return result.siteAssociations || {};
  },

  async saveAssociations(updated: SiteAssociationsMap): Promise<void> {
    await chrome.storage.local.set({ siteAssociations: updated });
  },

  buildRows(associations: SiteAssociationsMap): AssociationRow[] {
    return Object.entries(associations)
      .map(([source, target]) => ({
        source,
        target,
        resolvedTarget: resolveAssociatedSite(source, associations),
      }))
      .sort((a, b) => a.source.localeCompare(b.source));
  },

  associateSite(
    associations: SiteAssociationsMap,
    activeSite: string,
    targetSite: string,
  ): SiteAssociationsMap {
    const normalizedActive = normalizeSite(activeSite);
    const normalizedTarget = normalizeSite(targetSite);
    const resolvedTarget = resolveAssociatedSite(normalizedTarget, associations);

    const next = { ...associations };
    if (normalizedActive === resolvedTarget) {
      delete next[normalizedActive];
    } else {
      next[normalizedActive] = resolvedTarget;
    }
    return next;
  },

  clearSiteAssociation(associations: SiteAssociationsMap, activeSite: string): SiteAssociationsMap {
    const normalizedActive = normalizeSite(activeSite);
    if (!associations[normalizedActive]) return associations;
    const next = { ...associations };
    delete next[normalizedActive];
    return next;
  },

  updateSiteRenameInAssociations(
    associations: SiteAssociationsMap,
    oldSite: string,
    newSite: string,
  ): { updated: SiteAssociationsMap; changed: boolean } {
    const normOld = normalizeSite(oldSite);
    const normNew = normalizeSite(newSite);
    const next = { ...associations };
    let changed = false;

    for (const [k, v] of Object.entries(next)) {
      if (k === normOld) {
        delete next[k];
        next[normNew] = v;
        changed = true;
      }
      if (v === normOld) {
        next[k] = normNew;
        changed = true;
      }
    }

    return { updated: next, changed };
  },
};
