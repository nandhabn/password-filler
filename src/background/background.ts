const PARENT_MENU_ID = "autofill-password";

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

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    buildContextMenu();
  }
});

async function getActiveTabHostname(): Promise<string> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      return new URL(tab.url).hostname;
    }
  } catch {
    // ignore
  }
  return "";
}

async function buildContextMenu() {
  await chrome.contextMenus.removeAll();

  const result = await chrome.storage.local.get(["passwords", "siteAssociations"]);
  const allPasswords: Array<{ id?: string; site: string; username: string; password: string }> =
    result.passwords || [];
  const siteAssociations: Record<string, string> = result.siteAssociations || {};

  const hostname = await getActiveTabHostname();
  const resolvedHostname = resolveAssociatedSite(hostname, siteAssociations);

  // Filter to entries matching the current site
  const sitePasswords = resolvedHostname
    ? allPasswords.filter((p) => {
        const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
        return siteMatches(resolvedHostname, resolvedSite);
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

  if (passwords.length === 1) {
    chrome.contextMenus.create({
      id: `${PARENT_MENU_ID}::0`,
      title: `Autofill: ${passwords[0].site} (${passwords[0].username})`,
      contexts: ["editable"],
    });
    return;
  }

  // Multiple entries — parent with children
  chrome.contextMenus.create({
    id: PARENT_MENU_ID,
    title: showingAll ? "Autofill Password (all)" : "Autofill Password",
    contexts: ["editable"],
  });

  passwords.forEach((entry, index) => {
    chrome.contextMenus.create({
      id: `${PARENT_MENU_ID}::${index}`,
      parentId: PARENT_MENU_ID,
      title: `${entry.site} — ${entry.username}`,
      contexts: ["editable"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = String(info.menuItemId);
  if (!menuId.startsWith(PARENT_MENU_ID) || !tab?.id) return;

  const parts = menuId.split("::");
  const index = parts.length > 1 ? parseInt(parts[1], 10) : 0;

  const result = await chrome.storage.local.get(["passwords"]);
  const allPasswords: Array<{ site: string; username: string; password: string }> =
    result.passwords || [];
  const associationsResult = await chrome.storage.local.get(["siteAssociations"]);
  const siteAssociations: Record<string, string> = associationsResult.siteAssociations || {};

  const hostname = tab.url ? new URL(tab.url).hostname : "";
  const resolvedHostname = resolveAssociatedSite(hostname, siteAssociations);

  const sitePasswords = resolvedHostname
    ? allPasswords.filter((p) => {
        const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
        return siteMatches(resolvedHostname, resolvedSite);
      })
    : [];

  const passwords = sitePasswords.length > 0 ? sitePasswords : allPasswords;

  if (passwords.length === 0 || index >= passwords.length) return;

  const match = passwords[index];

  const payload = {
    type: "AUTOFILL",
    username: match.username,
    password: match.password,
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
  if (message.type !== "GET_SITE_PASSWORDS") return false;

  const tabUrl = sender.tab?.url;

  chrome.storage.local.get(["passwords", "siteAssociations"], (result) => {
    const allPasswords: Array<{ id: string; site: string; username: string; password: string }> =
      result.passwords || [];
    const siteAssociations: Record<string, string> = result.siteAssociations || {};

    if (!tabUrl) {
      sendResponse([]);
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(tabUrl).hostname.toLowerCase();
    } catch {
      sendResponse([]);
      return;
    }

    const resolvedHostname = resolveAssociatedSite(hostname, siteAssociations);

    const matching = allPasswords.filter((p) => {
      const resolvedSite = resolveAssociatedSite(p.site, siteAssociations);
      return siteMatches(resolvedHostname, resolvedSite);
    });

    sendResponse(matching);
  });

  return true; // keep channel open for async sendResponse
});

async function safeSendMessage(
  tabId: number,
  payload: { type: string; username: string; password: string },
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
