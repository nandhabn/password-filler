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

  const result = await chrome.storage.local.get(["passwords"]);
  const allPasswords: Array<{ id?: string; site: string; username: string; password: string }> =
    result.passwords || [];

  const hostname = await getActiveTabHostname();

  // Filter to entries matching the current site
  const sitePasswords = hostname
    ? allPasswords.filter((p) => hostname.includes(p.site) || p.site.includes(hostname))
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

  const hostname = tab.url ? new URL(tab.url).hostname : "";

  const sitePasswords = hostname
    ? allPasswords.filter((p) => hostname.includes(p.site) || p.site.includes(hostname))
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
