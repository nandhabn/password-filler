import React from 'react';

export type ActiveTab = 'passwords' | 'associations';

interface AppViewProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  children: React.ReactNode;
}

export const AppView: React.FC<AppViewProps> = ({ activeTab, onTabChange, children }) => {
  return (
    <div className="app">
      <header className="tabs">
        <button
          className={activeTab === 'passwords' ? 'active' : ''}
          onClick={() => onTabChange('passwords')}
        >
          🔑 Passwords
        </button>
        <button
          className={activeTab === 'associations' ? 'active' : ''}
          onClick={() => onTabChange('associations')}
        >
          🌐 Associations
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
};
