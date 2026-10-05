import React from 'react';

interface PasswordSearchBarViewProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onClear: () => void;
}

export const PasswordSearchBarView: React.FC<PasswordSearchBarViewProps> = ({
  searchQuery,
  onSearchChange,
  onClear,
}) => {
  return (
    <div className="search-bar-container">
      <input
        className="search-input"
        placeholder="🔍 Search site, tenant, or user..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {searchQuery && (
        <button className="search-clear-btn" onClick={onClear}>
          ×
        </button>
      )}
    </div>
  );
};
