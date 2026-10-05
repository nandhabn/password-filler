import { normalizeSite } from './association.model';

export interface ActiveTabInfo {
  tabId: number | null;
  hostname: string;
}

export const SessionSiteModel = {
  async getActiveTabInfo(): Promise<ActiveTabInfo> {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) {
          resolve({ tabId: null, hostname: '' });
          return;
        }

        let hostname = '';
        if (tab.url) {
          try {
            hostname = new URL(tab.url).hostname.toLowerCase();
          } catch {
            // ignore invalid / internal URLs
          }
        }

        resolve({ tabId: tab.id || null, hostname });
      });
    });
  },

  async getSessionSite(tabId: number): Promise<string> {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_SESSION_SITE', tabId }, (res) => {
        resolve(res?.sessionSite || '');
      });
    });
  },

  async setSessionSite(tabId: number, site: string): Promise<boolean> {
    const res = await chrome.runtime.sendMessage({
      type: 'SET_SESSION_SITE',
      tabId,
      site: normalizeSite(site),
    });
    return Boolean(res?.success);
  },

  async resetSessionSite(tabId: number): Promise<boolean> {
    const res = await chrome.runtime.sendMessage({
      type: 'RESET_SESSION_SITE',
      tabId,
    });
    return Boolean(res?.success);
  },
};
