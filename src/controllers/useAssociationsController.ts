import { useEffect, useMemo, useState } from 'react';
import {
  AssociationModel,
  AssociationRow,
  SiteAssociationsMap,
  normalizeSite,
} from '../models/association.model';

export function useAssociationsController() {
  const [associations, setAssociations] = useState<SiteAssociationsMap>({});
  const [editingSource, setEditingSource] = useState<string | null>(null);
  const [editSourceValue, setEditSourceValue] = useState('');
  const [editTargetValue, setEditTargetValue] = useState('');

  useEffect(() => {
    AssociationModel.loadAssociations().then(setAssociations);
  }, []);

  const rows = useMemo<AssociationRow[]>(() => {
    return AssociationModel.buildRows(associations);
  }, [associations]);

  const saveAssociations = async (updated: SiteAssociationsMap) => {
    setAssociations(updated);
    await AssociationModel.saveAssociations(updated);
  };

  const removeAssociation = (sourceSite: string) => {
    const next = { ...associations };
    delete next[sourceSite];
    saveAssociations(next);
  };

  const clearAllAssociations = () => {
    if (rows.length === 0) return;
    if (!window.confirm(`Remove all ${rows.length} website association(s)?`)) return;
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

  return {
    associations,
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
  };
}
