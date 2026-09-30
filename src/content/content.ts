let lastContextInput: HTMLInputElement | null = null;

// ─── Inline autofill popup (Apple Passwords style with multi-tenant & session site support) ───

export interface PasswordEntry {
  id: string;
  site: string;
  tenant?: string;
  username: string;
  password: string;
  notes?: string;
}

interface AutofillDataResponse {
  sessionSite: string;
  activeTarget: string;
  matching: PasswordEntry[];
  allSites: string[];
  isLoginPage: boolean;
  hostname: string;
  allPasswords: PasswordEntry[];
}

const AUTO_SUBMIT_STORAGE_KEY = "autoSubmitEnabled";
const AUTO_SUBMIT_DEFAULT = true;

let autofillPopup: HTMLElement | null = null;
let autofillShadow: ShadowRoot | null = null;
let autofillTriggerInput: HTMLInputElement | null = null;

function removeAutofillPopup() {
  if (autofillPopup) {
    autofillPopup.remove();
    autofillPopup = null;
    autofillShadow = null;
    autofillTriggerInput = null;
  }
}

function normalizeSite(site: string): string {
  return (site || "").trim().toLowerCase();
}

function siteMatches(currentHost: string, configuredSite: string): boolean {
  if (!currentHost || !configuredSite) return false;
  const h = normalizeSite(currentHost);
  const c = normalizeSite(configuredSite);
  return h.includes(c) || c.includes(h);
}

function isLoginUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    const search = parsed.search.toLowerCase();
    const hash = parsed.hash.toLowerCase();

    const loginPattern = /(^|\/)(login|signin|sign-in|log-in|auth|authenticate|sso|cas|saml|logout|signout|sign-out)($|\/|\.|\?)/i;
    if (loginPattern.test(path)) return true;
    if (/[?&#](login|signin|auth|logout)/i.test(search + hash)) return true;
  } catch {
    return false;
  }
  return false;
}

// Watch SPA route changes to auto-reset session site when returning to login
let lastHref = location.href;
function checkSpaUrlChange() {
  if (location.href !== lastHref) {
    lastHref = location.href;
    if (isLoginUrl(location.href)) {
      console.debug("[notes-with-ai] SPA navigated to login page, requesting session site reset");
      chrome.runtime.sendMessage({ type: "RESET_SESSION_SITE" });
    }
  }
}

window.addEventListener("popstate", checkSpaUrlChange);
window.addEventListener("hashchange", checkSpaUrlChange);

try {
  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const res = origPushState.apply(this, args);
    checkSpaUrlChange();
    return res;
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplaceState.apply(this, args);
    checkSpaUrlChange();
    return res;
  };
} catch {
  // history wrapping may be restricted in some strict frame contexts
}

function attemptAutoSubmit(scope: ParentNode, shouldAutoSubmit: boolean) {
  if (!shouldAutoSubmit) {
    return;
  }

  const submitBtn = findSubmitButton(scope);
  if (submitBtn) {
    console.debug("[notes-with-ai] clicking submit button", {
      tag: submitBtn.tagName,
      type: (submitBtn as HTMLButtonElement).type,
      text: submitBtn.textContent?.trim().slice(0, 30),
    });
    setTimeout(() => submitBtn.click(), 120);
  } else {
    console.debug(
      "[notes-with-ai] no submit button found, manual submission required",
    );
  }
}

function showAutofillPopup(
  input: HTMLInputElement,
  data: AutofillDataResponse,
  initialAutoSubmitEnabled: boolean,
) {
  removeAutofillPopup();

  let autoSubmitEnabled = initialAutoSubmitEnabled;
  let currentSessionSite = data.sessionSite || "";
  let selectedSite = currentSessionSite || (data.matching.length > 0 ? (data.matching[0].site || "") : "");
  let allPasswords = data.allPasswords || [];
  let allSites = data.allSites || [];

  const rect = input.getBoundingClientRect();
  const host = document.createElement("div");

  let top = rect.bottom + 4;
  let left = rect.left;
  if (left + 320 > window.innerWidth) {
    left = Math.max(8, window.innerWidth - 328);
  }

  host.style.cssText = `
    position: fixed;
    left: ${left}px;
    top: ${top}px;
    z-index: 2147483647;
    pointer-events: auto;
  `;

  const shadow = host.attachShadow({ mode: "open" });
  autofillPopup = host;
  autofillShadow = shadow;
  autofillTriggerInput = input;

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .pw-popup {
      background: #ffffff;
      border-radius: 13px;
      box-shadow: 0 10px 36px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12);
      padding: 0;
      width: 310px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.1);
      color: #1c1c1e;
    }
    .pw-header {
      background: #f8f9fb;
      padding: 8px 12px;
      border-bottom: 1px solid #eaeaea;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pw-title {
      font-size: 11px;
      font-weight: 700;
      color: #555;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .pw-session-info {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .pw-session-badge {
      font-size: 10px;
      font-weight: 600;
      background: #e1effe;
      color: #1a56db;
      padding: 2px 6px;
      border-radius: 6px;
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pw-reset-btn {
      border: none;
      background: #f1f3f5;
      color: #666;
      border-radius: 4px;
      padding: 2px 5px;
      font-size: 11px;
      cursor: pointer;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
    }
    .pw-reset-btn:hover {
      background: #e9ecef;
      color: #e02424;
    }
    .pw-site-row {
      padding: 6px 12px;
      background: #fafafa;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pw-site-label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      white-space: nowrap;
    }
    .pw-site-select {
      flex: 1;
      font-size: 12px;
      padding: 4px 6px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      color: #111;
      outline: none;
      cursor: pointer;
    }
    .pw-site-select:focus {
      border-color: #007aff;
    }
    .pw-list {
      max-height: 240px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .pw-tenant-header {
      font-size: 10px;
      font-weight: 700;
      color: #718096;
      background: #f7fafc;
      padding: 4px 12px;
      letter-spacing: 0.03em;
      border-top: 1px solid #edf2f7;
      border-bottom: 1px solid #edf2f7;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pw-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
    }
    .pw-item:hover {
      background: #f2f4f8;
    }
    .pw-icon {
      width: 30px;
      height: 30px;
      border-radius: 7px;
      background: linear-gradient(145deg, #007aff, #0056cc);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0,122,255,0.25);
    }
    .pw-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .pw-user-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }
    .pw-username {
      font-size: 13px;
      font-weight: 600;
      color: #111;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pw-tenant-badge {
      font-size: 10px;
      font-weight: 500;
      background: #eef2ff;
      color: #4338ca;
      border: 1px solid #c7d2fe;
      border-radius: 4px;
      padding: 1px 5px;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .pw-site-sub {
      font-size: 11px;
      color: #718096;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 1px;
    }
    .pw-empty {
      padding: 16px 12px;
      text-align: center;
      font-size: 12px;
      color: #718096;
      line-height: 1.4;
    }
    .pw-footer {
      border-top: 1px solid #f0f0f0;
      padding: 7px 12px;
      background: #f8f9fb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .pw-autosubmit-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #4a5568;
      cursor: pointer;
      user-select: none;
    }
    .pw-autosubmit-checkbox {
      width: 13px;
      height: 13px;
      accent-color: #007aff;
      cursor: pointer;
    }
  `;

  const popup = document.createElement("div");
  popup.className = "pw-popup";

  // 1. Header
  const header = document.createElement("div");
  header.className = "pw-header";

  const title = document.createElement("div");
  title.className = "pw-title";
  title.innerHTML = `🔑 Passwords`;
  header.appendChild(title);

  const sessionInfo = document.createElement("div");
  sessionInfo.className = "pw-session-info";
  header.appendChild(sessionInfo);

  popup.appendChild(header);

  // 2. Site selector row
  const siteRow = document.createElement("div");
  siteRow.className = "pw-site-row";

  const siteLabel = document.createElement("label");
  siteLabel.className = "pw-site-label";
  siteLabel.textContent = "Site:";

  const siteSelect = document.createElement("select");
  siteSelect.className = "pw-site-select";

  siteRow.appendChild(siteLabel);
  siteRow.appendChild(siteSelect);
  popup.appendChild(siteRow);

  // 3. Password list container
  const list = document.createElement("div");
  list.className = "pw-list";
  popup.appendChild(list);

  // 4. Footer
  const footer = document.createElement("div");
  footer.className = "pw-footer";

  const autoSubmitLabel = document.createElement("label");
  autoSubmitLabel.className = "pw-autosubmit-label";
  autoSubmitLabel.innerHTML = `
    <span>⚡</span>
    <input type="checkbox" class="pw-autosubmit-checkbox" ${autoSubmitEnabled ? "checked" : ""}>
    <span>Auto submit</span>
  `;

  const autoSubmitCheckbox = autoSubmitLabel.querySelector<HTMLInputElement>("input")!;
  autoSubmitCheckbox.addEventListener("change", () => {
    autoSubmitEnabled = autoSubmitCheckbox.checked;
    chrome.storage.local.set({ [AUTO_SUBMIT_STORAGE_KEY]: autoSubmitEnabled });
  });

  footer.appendChild(autoSubmitLabel);
  popup.appendChild(footer);

  // Render contents
  function render() {
    // Render session badge
    sessionInfo.innerHTML = "";
    if (currentSessionSite) {
      const badge = document.createElement("span");
      badge.className = "pw-session-badge";
      badge.title = `Persisted session site: ${currentSessionSite}`;
      badge.textContent = currentSessionSite;

      const resetBtn = document.createElement("button");
      resetBtn.className = "pw-reset-btn";
      resetBtn.title = "Reset session site";
      resetBtn.textContent = "↺";
      resetBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({ type: "RESET_SESSION_SITE" });
        currentSessionSite = "";
        selectedSite = "";
        render();
      });

      sessionInfo.appendChild(badge);
      sessionInfo.appendChild(resetBtn);
    }

    // Populate site select options
    siteSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = allSites.length > 0 ? "-- Select Site --" : "-- No Saved Sites --";
    siteSelect.appendChild(defaultOption);

    for (const site of allSites) {
      const opt = document.createElement("option");
      opt.value = site;
      opt.textContent = site;
      if (normalizeSite(site) === normalizeSite(selectedSite)) {
        opt.selected = true;
      }
      siteSelect.appendChild(opt);
    }

    // Determine entries for current selection
    let activeEntries: PasswordEntry[] = [];
    if (selectedSite) {
      activeEntries = allPasswords.filter((p) => siteMatches(selectedSite, p.site));
    } else if (currentSessionSite) {
      activeEntries = allPasswords.filter((p) => siteMatches(currentSessionSite, p.site));
    } else if (data.matching.length > 0) {
      activeEntries = data.matching;
    }

    // Render entries
    list.innerHTML = "";
    if (activeEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "pw-empty";
      empty.innerHTML = selectedSite
        ? `No saved passwords for <strong>${escapeHtml(selectedSite)}</strong>`
        : `Select a site above to autofill credentials for this session`;
      list.appendChild(empty);
      return;
    }

    // Group active entries by tenant
    const tenantGroups: Record<string, PasswordEntry[]> = {};
    for (const entry of activeEntries) {
      const tenantKey = (entry.tenant || "").trim();
      if (!tenantGroups[tenantKey]) {
        tenantGroups[tenantKey] = [];
      }
      tenantGroups[tenantKey].push(entry);
    }

    const groupKeys = Object.keys(tenantGroups).sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      return a.localeCompare(b);
    });

    const hasMultipleTenants = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== "");

    for (const tenantKey of groupKeys) {
      const groupEntries = tenantGroups[tenantKey];

      if (hasMultipleTenants) {
        const tenantHeader = document.createElement("div");
        tenantHeader.className = "pw-tenant-header";
        const displayName = tenantKey || "General";
        tenantHeader.innerHTML = `
          <span>🏢 ${escapeHtml(displayName)}</span>
          <span>${groupEntries.length} ${groupEntries.length === 1 ? "user" : "users"}</span>
        `;
        list.appendChild(tenantHeader);
      }

      for (const entry of groupEntries) {
        const item = document.createElement("div");
        item.className = "pw-item";
        item.innerHTML = `
          <div class="pw-icon">🔑</div>
          <div class="pw-info">
            <div class="pw-user-row">
              <span class="pw-username">${escapeHtml(entry.username)}</span>
              ${entry.tenant ? `<span class="pw-tenant-badge">${escapeHtml(entry.tenant)}</span>` : ""}
            </div>
            <span class="pw-site-sub">${escapeHtml(entry.site)}</span>
          </div>
        `;

        item.addEventListener("mousedown", async (e) => {
          e.preventDefault();
          removeAutofillPopup();

          // If session site is not set yet or different, lock it in
          if (!currentSessionSite || normalizeSite(currentSessionSite) !== normalizeSite(entry.site)) {
            await chrome.runtime.sendMessage({
              type: "SET_SESSION_SITE",
              site: entry.site,
            });
          }

          // Autofill form inputs
          const form = input.closest("form") as HTMLFormElement | null;
          const dialog = input.closest(
            '[role="dialog"], [aria-modal="true"], .modal, dialog',
          ) as HTMLElement | null;
          const scope: ParentNode = form || dialog || document;

          const allInputs = Array.from(
            scope.querySelectorAll<HTMLInputElement>("input"),
          ).filter((el) => !el.disabled && el.offsetParent !== null);

          const usernameInput =
            allInputs.find((el) => {
              const t = el.type.toLowerCase();
              return (t === "text" || t === "email") && isUsernameField(el);
            }) || null;

          const passwordInputs = allInputs.filter((el) => isPasswordField(el));

          if (usernameInput) {
            setNativeValue(usernameInput, entry.username);
          }
          for (const pwInput of passwordInputs) {
            setNativeValue(pwInput, entry.password);
          }
          fillCommentFieldRandomly(scope);

          attemptAutoSubmit(scope, autoSubmitEnabled);
        });

        list.appendChild(item);
      }
    }
  }

  // Handle site selection change
  siteSelect.addEventListener("change", async () => {
    const chosen = siteSelect.value;
    selectedSite = chosen;
    if (chosen) {
      await chrome.runtime.sendMessage({
        type: "SET_SESSION_SITE",
        site: chosen,
      });
      currentSessionSite = chosen;
    } else {
      await chrome.runtime.sendMessage({ type: "RESET_SESSION_SITE" });
      currentSessionSite = "";
    }
    render();
  });

  render();

  shadow.appendChild(style);
  shadow.appendChild(popup);
  document.body.appendChild(host);
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function onInputFocus(event: FocusEvent) {
  const input = event.target as HTMLInputElement;
  if (!input || input.disabled || input.readOnly) return;
  const type = input.type.toLowerCase();
  const isPassword = isPasswordField(input);
  const isUsername =
    !isPassword &&
    (type === "text" || type === "email") &&
    isUsernameField(input);
  if (!isPassword && !isUsername) return;

  try {
    const data: AutofillDataResponse = await chrome.runtime.sendMessage({
      type: "GET_AUTOFILL_DATA",
    });

    if (!data) return;

    // Show popup if:
    // 1. There are matching credentials for this site/session, OR
    // 2. We are on a login-type field and there are any saved sites available in storage
    const hasMatching = data.matching && data.matching.length > 0;
    const hasSitesToPick = data.allSites && data.allSites.length > 0;

    if (!hasMatching && !hasSitesToPick) return;

    const settings = await chrome.storage.local.get({
      [AUTO_SUBMIT_STORAGE_KEY]: AUTO_SUBMIT_DEFAULT,
    });
    const autoSubmitEnabled = settings[AUTO_SUBMIT_STORAGE_KEY] !== false;

    showAutofillPopup(input, data, autoSubmitEnabled);
  } catch (err) {
    console.debug("[notes-with-ai] GET_AUTOFILL_DATA error:", err);
  }
}

function onDocumentFocusOut(event: FocusEvent) {
  const related = event.relatedTarget as Node | null;
  // If focus moves outside the popup, dismiss
  if (autofillPopup && (!related || !autofillPopup.contains(related))) {
    // Small delay to allow mousedown on popup item to fire first
    setTimeout(() => {
      if (autofillPopup && document.activeElement !== null) {
        const shadow = autofillShadow;
        if (!shadow || !shadow.contains(document.activeElement)) {
          removeAutofillPopup();
        }
      }
    }, 150);
  }
}

document.addEventListener(
  "focusin",
  onInputFocus as unknown as EventListener,
  true,
);
document.addEventListener(
  "focusout",
  onDocumentFocusOut as EventListener,
  true,
);
document.addEventListener(
  "click",
  (e) => {
    const target = e.target as Node;
    if (
      autofillPopup &&
      !autofillPopup.contains(target) &&
      target !== autofillTriggerInput
    ) {
      removeAutofillPopup();
    }
  },
  true,
);

function isEditableField(target: Element): boolean {
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return !target.disabled && !target.readOnly;
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

document.addEventListener(
  "contextmenu",
  (event) => {
    const target = event.target as Element | null;
    if (!target) {
      return;
    }

    const input = target.closest("input");
    lastContextInput = input instanceof HTMLInputElement ? input : null;

    const editableTarget = target.closest(
      "input, textarea, [contenteditable='true']",
    );
    if (editableTarget && isEditableField(editableTarget)) {
      // Keep native context menu enabled on editable fields by preventing site handlers.
      event.stopImmediatePropagation();
      event.stopPropagation();
    }
  },
  true,
);

chrome.runtime.onMessage.addListener((message) => {
  console.debug("[notes-with-ai] received message", message);
  if (message.type !== "AUTOFILL") return;

  const active = document.activeElement as HTMLInputElement | null;
  const target =
    lastContextInput && document.contains(lastContextInput)
      ? lastContextInput
      : active;

  // Determine the form scope to search for inputs
  // Priority: form > dialog/modal > document
  const form = target?.closest("form") as HTMLFormElement | null;
  const dialog = target?.closest(
    '[role="dialog"], [aria-modal="true"], .MuiDialog-paper, .modal, dialog',
  ) as HTMLElement | null;
  const scope: ParentNode = form || dialog || document;

  // Get all visible, fillable inputs in scope
  const allInputs = Array.from(
    scope.querySelectorAll<HTMLInputElement>("input"),
  ).filter((el) => !el.disabled && el.offsetParent !== null);

  // Separate by type, also check label/placeholder/name/id for "password" hint
  const passwordFields = allInputs.filter((el) => isPasswordField(el));
  const usernameFields = allInputs.filter((el) => {
    if (isPasswordField(el)) return false;
    const t = el.type.toLowerCase();
    if (t !== "text" && t !== "email") return false;
    return isUsernameField(el);
  });

  const usernameInput = usernameFields[0] || null;

  console.debug("[notes-with-ai] autofill targets", {
    usernameInput: usernameInput
      ? {
          id: usernameInput.id,
          name: usernameInput.name,
          type: usernameInput.type,
        }
      : null,
    passwordFields: passwordFields.map((el) => ({
      id: el.id,
      name: el.name,
      type: el.type,
    })),
    messageHasPassword: Boolean(message.password),
  });

  if (usernameInput) {
    setNativeValue(usernameInput, message.username);
  }
  for (const pwInput of passwordFields) {
    setNativeValue(pwInput, message.password);
  }
  fillCommentFieldRandomly(scope);

  chrome.storage.local.get(
    { [AUTO_SUBMIT_STORAGE_KEY]: AUTO_SUBMIT_DEFAULT },
    (settings) => {
      const autoSubmitEnabled = settings[AUTO_SUBMIT_STORAGE_KEY] !== false;
      attemptAutoSubmit(scope, autoSubmitEnabled);
    },
  );

  lastContextInput = null;

  return false;
});

// Detect password fields by type, placeholder, label, name, id, class, or autocomplete
function isPasswordField(el: HTMLInputElement): boolean {
  if (el.type.toLowerCase() === "password") return true;

  // Check if containing wrapper has password-related class
  const parentClasses = el.closest("[class*='password']")?.className || "";
  if (/password/i.test(parentClasses)) return true;

  const hints = [
    el.placeholder,
    el.name,
    el.id,
    el.getAttribute("aria-label") || "",
    el.autocomplete,
  ];

  // Check associated <label> text
  const labelEl =
    el.labels?.[0] ||
    (el.id &&
      document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`));
  if (labelEl) {
    hints.push(labelEl.textContent || "");
  }

  return hints.some((h) => h && /password|passwd|pwd/i.test(h));
}

// Detect username fields by type, placeholder, label, name, id, or autocomplete
function isUsernameField(el: HTMLInputElement): boolean {
  if (el.type.toLowerCase() === "email") return true;

  const hints = [
    el.placeholder,
    el.name,
    el.id,
    el.getAttribute("aria-label") || "",
    el.autocomplete,
  ];

  // Check associated <label> text
  const labelEl =
    el.labels?.[0] ||
    (el.id &&
      document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`));
  if (labelEl) {
    hints.push(labelEl.textContent || "");
  }

  return hints.some(
    (h) =>
      h &&
      /user.?id|user.?name|username|user|email|login|account|phone|mobile/i.test(
        h,
      ),
  );
}

// Set value using native setter to trigger React/Angular/Vue change detection
function setNativeValue(el: HTMLInputElement, value: string) {
  // Focus the element first so frameworks register the interaction
  el.focus();
  el.click();

  // Use the native setter to bypass framework getters
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else if (nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Also set via attribute for older sites
  el.setAttribute("value", value);

  // Dispatch comprehensive events to cover all frameworks
  el.dispatchEvent(new Event("focus", { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: value,
    }),
  );
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));

  console.debug("[notes-with-ai] setNativeValue done", {
    tag: el.tagName,
    type: el.type,
    name: el.name || el.id,
    valueLength: el.value.length,
    success: el.value === value,
  });
}

// Find the submit button within the given scope
function findSubmitButton(scope: ParentNode): HTMLElement | null {
  // 1. Look for input[type="submit"] or button[type="submit"]
  const submitInput = scope.querySelector<HTMLElement>(
    'input[type="submit"], button[type="submit"]',
  );
  if (submitInput && isVisible(submitInput)) return submitInput;

  // 2. Look for buttons with submit-related text
  const buttons = Array.from(
    scope.querySelectorAll<HTMLElement>(
      "button, [role='button'], a[class*='btn']",
    ),
  ).filter(isVisible);

  const submitPattern =
    /^(sign\s*in|log\s*in|login|submit|continue|next|enter)$/i;
  for (const btn of buttons) {
    const text = (btn.textContent || "").trim();
    if (submitPattern.test(text)) return btn;
  }

  // 3. Fallback: button without explicit type (defaults to submit in forms)
  const defaultButton =
    scope.querySelector<HTMLButtonElement>("button:not([type])");
  if (defaultButton && isVisible(defaultButton)) return defaultButton;

  return null;
}

function isVisible(el: HTMLElement): boolean {
  return (
    el.offsetParent !== null &&
    !el.hidden &&
    getComputedStyle(el).visibility !== "hidden"
  );
}

const RANDOM_COMMENTS = [
  "Looks good!",
  "No comments.",
  "All fine.",
  "Approved.",
  "OK",
  "Nothing to add.",
  "Confirmed.",
];

function isCommentField(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const hints = [
    el.placeholder,
    el.name,
    el.id,
    el.getAttribute("aria-label") || "",
  ];
  const labelEl =
    el.labels?.[0] ||
    (el.id &&
      document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`));
  if (labelEl) {
    hints.push(labelEl.textContent || "");
  }
  return hints.some(
    (h) => h && /comment|comments|remarks|note|notes|feedback|reason/i.test(h),
  );
}

function fillCommentFieldRandomly(scope: ParentNode) {
  const textareas = Array.from(
    scope.querySelectorAll<HTMLTextAreaElement>("textarea"),
  ).filter((el) => !el.disabled && el.offsetParent !== null && isCommentField(el));

  const textInputs = Array.from(
    scope.querySelectorAll<HTMLInputElement>("input[type='text']"),
  ).filter((el) => !el.disabled && el.offsetParent !== null && isCommentField(el));

  const commentFields = [...textareas, ...textInputs];
  if (commentFields.length === 0) return;

  const comment =
    RANDOM_COMMENTS[Math.floor(Math.random() * RANDOM_COMMENTS.length)];
  for (const field of commentFields) {
    setNativeValue(field as unknown as HTMLInputElement, comment);
  }
}
