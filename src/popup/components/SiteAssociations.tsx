import { useAssociationsController } from '../../controllers/useAssociationsController';
import { SiteAssociationsView } from '../../views/associations/SiteAssociationsView';

// Re-export models for backward compatibility
export type { AssociationRow, SiteAssociationsMap } from '../../models/association.model';

export default function SiteAssociations() {
  const controller = useAssociationsController();
  return <SiteAssociationsView controller={controller} />;
}
