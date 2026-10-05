import { useState } from 'react';
import { ActiveTab, AppView } from '../views/AppView';
import Passwords from './components/Passwords';
import SiteAssociations from './components/SiteAssociations';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('passwords');

  return (
    <AppView activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'passwords' ? <Passwords /> : <SiteAssociations />}
    </AppView>
  );
}
