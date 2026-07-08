import { useState } from 'react';
import Notes from './components/Notes';
import Passwords from './components/Passwords';
import SiteAssociations from './components/SiteAssociations';

type Tab = 'notes' | 'passwords' | 'associations';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('passwords');

  return (
    <div className="app">
      <header className="tabs">
        <button
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => setActiveTab('notes')}
        >
          📝 Notes
        </button>
        <button
          className={activeTab === 'passwords' ? 'active' : ''}
          onClick={() => setActiveTab('passwords')}
        >
          🔑 Passwords
        </button>
        <button
          className={activeTab === 'associations' ? 'active' : ''}
          onClick={() => setActiveTab('associations')}
        >
          🌐 Associations
        </button>
      </header>
      <main>
        {activeTab === 'notes' ? <Notes /> : activeTab === 'passwords' ? <Passwords /> : <SiteAssociations />}
      </main>
    </div>
  );
}
