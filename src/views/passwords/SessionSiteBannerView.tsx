import React from 'react';

interface SessionSiteBannerViewProps {
  sessionSite: string;
  availableSites: string[];
  onUpdateSessionSite: (site: string) => void;
}

export const SessionSiteBannerView: React.FC<SessionSiteBannerViewProps> = ({
  sessionSite,
  availableSites,
  onUpdateSessionSite,
}) => {
  return (
    <div className="session-site-banner">
      <div className="session-site-status">
        <span className="session-site-label">Tab Session:</span>
        {sessionSite ? (
          <span className="session-site-active" title="Credentials for this site persist for this tab">
            ⚡ <strong>{sessionSite}</strong>
          </span>
        ) : (
          <span className="session-site-none">None (using host / login)</span>
        )}
      </div>
      <div className="session-site-actions">
        <select
          className="session-site-select"
          value={sessionSite}
          onChange={(e) => onUpdateSessionSite(e.target.value)}
          title="Lock credentials for this tab session"
        >
          <option value="">-- Change Site --</option>
          {availableSites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {sessionSite && (
          <button
            className="link-btn reset-btn"
            onClick={() => onUpdateSessionSite('')}
            title="Reset session site for this tab"
          >
            ↺ Reset
          </button>
        )}
      </div>
    </div>
  );
};
