export interface PasswordEntry {
  id?: string;
  site: string;
  tenant?: string;
  username: string;
  password: string;
  notes?: string;
}

const PARENT_MENU_ID = "autofill-password";
const tabSessionSites = new Map<number, string>();

chrome.runtime.onInstalled.addListener(() => {
  buildContextMenu();
});

// Rebuild menu whenever passwords change
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.passwords) {
    buildContextMenu();
  }
});

// Rebuild menu when active tab changes or navigates
chrome.tabs.onActivated.addListener(() => {
  buildContextMenu();
});

// Tab removal: clean up in-memory session cache and storage
chrome.tabs.onRemoved.addListener((tabId) => {
  clearTabSessionSite(tabId);
});

// Rebuild menu and check for login page navigation to reset session
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (url && isLoginUrl(url)) {
    const existing = await getTabSessionSite(tabId);
    if (existing) {
      console.debug(`[notes-with-ai] Tab ${tabId} returned to login (${url}), resetting session site: ${existing}`);
      await clearTabSessionSite(tabId);
      buildContextMenu();
    }
  }

  if (changeInfo.url || changeInfo.status === "complete") {
    buildContextMenu();
  }
});

export function isLoginUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    const hash = parsed.hash.toLowerCase();

    // Check path for common login/auth/logout keywords
    const loginPattern = /(^|\/)(login|signin|sign-in|log-in|auth|authenticate|sso|cas|saml|logout|signout|sign-out)($|\/|\.|\?)/i;
    if (loginPattern.test(path)) return true;

    // Check query params or hash fragments
    if (/[?&#](login|signin|auth|logout)/i.test(search + hash)) return true;
  } catch {
    return false;
  }
  return false;
}

async function getTabSessionSite(tabId: number): Promise<string> {
  if (tabSessionSites.has(tabId)) {
    return tabSessionSites.get(tabId) || "";
  }
  try {
    if (chrome.storage?.session) {
      const key = `session_site_${tabId}`;
      const res = await chrome.storage.session.get(key);
      const site = res[key] || "";
      if (site) tabSessionSites.set(tabId, site);
      return site;
    }
  } catch (e) {
    console.debug("[notes-with-ai] storage.session get error", e);
  }
  return "";
}

async function setTabSessionSite(tabId: number, site: string): Promise<void> {
  const normalized = normalizeSite(site);
  tabSessionSites.set(tabId, normalized);
  try {
    if (chrome.storage?.session) {
      const key = `session_site_${tabId}`;
      await chrome.storage.session.set({ [key]: normalized });
    }
  } catch (e) {
    console.debug("[notes-with-ai] storage.session set error", e);
  }
}

async function clearTabSessionSite(tabId: number): Promise<void> {
  tabSessionSites.delete(tabId);
  try {
    if (chrome.storage?.session) {
      const key = `session_site_${tabId}`;
      await chrome.storage.session.remove(key);
    }
  } catch (e) {
    console.debug("[notes-with-ai] storage.session remove error", e);
  }
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch {
    return null;
  }
}

async function buildContextMenu() {
  await chrome.contextMenus.removeAll();

  const activeTab = await getActiveTab();
  if (!activeTab?.id) return;

  const result = await chrome.storage.local.get(["passwords", "siteAssociations"]);
  const allPasswords: PasswordEntry[] = result.passwords || [];
  const siteAssociations: Record<string, string> = result.siteAssociations || {};

  let hostname = "";
  try {
    if (activeTab.url) hostname = new URL(activeTab.url).hostname.toLowerCase();
  } catch {}

  const resolvedHostname = resolveAssociatedSite(hostname, siteAssociations);
  const sessionSite = await getTabSessionSite(activeTab.id);
  const targetSite = sessionSite || resolvedHostname;

  // Filter to entries matching targetSite
  const sitePasswords = targetSite
    ? allPasswords.filter((p) => {
        const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
        return siteMatches(targetSite, resolvedSite);
      })
    : [];

  // Use site-matched entries if any, otherwise show all
  const passwords = sitePasswords.length > 0 ? sitePasswords : allPasswords;
  const showingAll = sitePasswords.length === 0 && allPasswords.length > 0;

  if (passwords.length === 0) {
    chrome.contextMenus.create({
      id: PARENT_MENU_ID,
      title: "Autofill Password (none saved)",
      contexts: ["editable"],
      enabled: false,
    });
    return;
  }

  const formatTitle = (p: PasswordEntry): string => {
    const tenantStr = p.tenant ? `[${p.tenant}] ` : "";
    if (showingAll) {
      return `${p.site} — ${tenantStr}${p.username}`;
    }
    return `${tenantStr}${p.username}`;
  };

  if (passwords.length === 1) {
    const titlePrefix = sessionSite ? `Autofill (${sessionSite}): ` : "Autofill: ";
    chrome.contextMenus.create({
      id: `${PARENT_MENU_ID}::0`,
      title: `${titlePrefix}${formatTitle(passwords[0])}`,
      contexts: ["editable"],
    });
    return;
  }

  // Multiple entries — parent with children
  const parentTitle = sessionSite
    ? `Autofill (${sessionSite})`
    : showingAll
    ? "Autofill Password (all)"
    : "Autofill Password";

  chrome.contextMenus.create({
    id: PARENT_MENU_ID,
    title: parentTitle,
    contexts: ["editable"],
  });

  passwords.forEach((entry, index) => {
    chrome.contextMenus.create({
      id: `${PARENT_MENU_ID}::${index}`,
      parentId: PARENT_MENU_ID,
      title: formatTitle(entry),
      contexts: ["editable"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = String(info.menuItemId);
  if (!menuId.startsWith(PARENT_MENU_ID) || !tab?.id) return;

  const parts = menuId.split("::");
  const index = parts.length > 1 ? parseInt(parts[1], 10) : 0;

  const result = await chrome.storage.local.get(["passwords", "siteAssociations"]);
  const allPasswords: PasswordEntry[] = result.passwords || [];
  const siteAssociations: Record<string, string> = result.siteAssociations || {};

  let hostname = "";
  try {
    if (tab.url) hostname = new URL(tab.url).hostname.toLowerCase();
  } catch {}

  const resolvedHostname = resolveAssociatedSite(hostname, siteAssociations);
  const sessionSite = await getTabSessionSite(tab.id);
  const targetSite = sessionSite || resolvedHostname;

  const sitePasswords = targetSite
    ? allPasswords.filter((p) => {
        const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
        return siteMatches(targetSite, resolvedSite);
      })
    : [];

  const passwords = sitePasswords.length > 0 ? sitePasswords : allPasswords;

  if (passwords.length === 0 || index >= passwords.length) return;

  const match = passwords[index];

  // If tab didn't have session site yet, persist match.site as session site
  if (!sessionSite && match.site) {
    await setTabSessionSite(tab.id, match.site);
  }

  const payload = {
    type: "AUTOFILL",
    username: match.username,
    password: match.password,
    tenant: match.tenant,
    site: match.site,
  };

  if (typeof info.frameId === "number" && info.frameId >= 0) {
    const sentToFrame = await safeSendMessage(tab.id, payload, info.frameId);
    if (sentToFrame) {
      return;
    }
  }

  await safeSendMessage(tab.id, payload);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_AUTOFILL_DATA" || message.type === "GET_SITE_PASSWORDS") {
    (async () => {
      const tabId = sender.tab?.id;
      const tabUrl = sender.tab?.url || "";

      const result = await chrome.storage.local.get(["passwords", "siteAssociations"]);
      const allPasswords: PasswordEntry[] = result.passwords || [];
      const siteAssociations: Record<string, string> = result.siteAssociations || {};

      let hostname = "";
      try {
        if (tabUrl) hostname = new URL(tabUrl).hostname.toLowerCase();
      } catch {}

      const sessionSite = tabId ? await getTabSessionSite(tabId) : "";
      const isLogin = isLoginUrl(tabUrl);

      // Collect all distinct sites available in storage
      const allSites = Array.from(
        new Set(allPasswords.map((p) => normalizeSite(p.site)).filter(Boolean))
      ).sort();

      const activeTarget = sessionSite || (hostname ? resolveAssociatedSite(hostname, siteAssociations) : "");

      const matching = activeTarget
        ? allPasswords.filter((p) => {
            const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
            return siteMatches(activeTarget, resolvedSite);
          })
        : [];

      // If legacy GET_SITE_PASSWORDS call without full data requested:
      if (message.type === "GET_SITE_PASSWORDS" && !message.wantsFullData) {
        sendResponse(matching);
        return;
      }

      sendResponse({
        sessionSite,
        activeTarget,
        matching,
        allSites,
        isLoginPage: isLogin,
        hostname,
        allPasswords,
      });
    })();
    return true; // Keep channel open for async sendResponse
  }

  if (message.type === "SET_SESSION_SITE") {
    (async () => {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId && message.site) {
        await setTabSessionSite(tabId, message.site);
        buildContextMenu();
        sendResponse({ success: true, site: message.site });
      } else {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  if (message.type === "RESET_SESSION_SITE") {
    (async () => {
      const tabId = message.tabId || sender.tab?.id;
      if (tabId) {
        await clearTabSessionSite(tabId);
        buildContextMenu();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  if (message.type === "GET_SESSION_SITE") {
    (async () => {
      let tabId = message.tabId;
      if (!tabId) {
        const activeTab = await getActiveTab();
        tabId = activeTab?.id;
      }
      const sessionSite = tabId ? await getTabSessionSite(tabId) : "";
      sendResponse({ sessionSite, tabId });
    })();
    return true;
  }

  return false;
});

async function safeSendMessage(
  tabId: number,
  payload: { type: string; username: string; password: string; tenant?: string; site?: string },
  frameId?: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const callback = () => {
      const message = chrome.runtime.lastError?.message;
      if (!message) {
        resolve(true);
        return;
      }

      const isBenign =
        message.includes("Could not establish connection") ||
        message.includes("Receiving end does not exist") ||
        message.includes("message channel closed before a response was received") ||
        message.includes("The message port closed before a response was received");

      if (!isBenign) {
        console.warn("[notes-with-ai] sendMessage failed", { frameId, message });
      }
      resolve(false);
    };

    if (typeof frameId === "number") {
      chrome.tabs.sendMessage(tabId, payload, { frameId }, callback);
    } else {
      chrome.tabs.sendMessage(tabId, payload, callback);
    }
  });
}

function normalizeSite(site: string): string {
  return site.trim().toLowerCase();
}

function resolveAssociatedSite(site: string, map: Record<string, string>): string {
  let current = normalizeSite(site);
  const visited = new Set<string>();

  while (map[current] && !visited.has(current)) {
    visited.add(current);
    current = normalizeSite(map[current]);
  }

  return current;
}

function siteMatches(currentHost: string, configuredSite: string): boolean {
  if (!currentHost || !configuredSite) return false;
  return currentHost.includes(configuredSite) || configuredSite.includes(currentHost);
}
