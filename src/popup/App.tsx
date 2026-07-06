import { useState } from 'react';
import Notes from './components/Notes';
import Passwords from './components/Passwords';

type Tab = 'notes' | 'passwords';

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
      </header>
      <main>
        {activeTab === 'notes' ? <Notes /> : <Passwords />}
      </main>
    </div>
  );
}
