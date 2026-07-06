let lastContextInput: HTMLInputElement | null = null;

// ─── Inline autofill popup (Apple Passwords style) ───────────────────────────

interface PasswordEntry {
  id: string;
  site: string;
  username: string;
  password: string;
}

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

function showAutofillPopup(input: HTMLInputElement, entries: PasswordEntry[]) {
  removeAutofillPopup();

  const rect = input.getBoundingClientRect();
  const host = document.createElement("div");
  host.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 4}px;
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
    .pw-popup {
      background: #fff;
      border-radius: 13px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 1.5px 6px rgba(0,0,0,0.10);
      padding: 6px 0;
      min-width: 240px;
      max-width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .pw-header {
      font-size: 11px;
      font-weight: 600;
      color: #888;
      padding: 4px 14px 6px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .pw-item {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 14px;
      cursor: pointer;
      transition: background 0.1s;
      user-select: none;
    }
    .pw-item:hover {
      background: #f2f2f7;
    }
    .pw-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: linear-gradient(145deg, #007AFF, #0056cc);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 17px;
      flex-shrink: 0;
      box-shadow: 0 1px 4px rgba(0,122,255,0.3);
    }
    .pw-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .pw-username {
      font-size: 14px;
      font-weight: 500;
      color: #111;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .pw-site {
      font-size: 12px;
      color: #888;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  const popup = document.createElement("div");
  popup.className = "pw-popup";

  const header = document.createElement("div");
  header.className = "pw-header";
  header.innerHTML = `🔑 Passwords`;
  popup.appendChild(header);

  for (const entry of entries) {
    const item = document.createElement("div");
    item.className = "pw-item";
    item.innerHTML = `
      <div class="pw-icon">🔑</div>
      <div class="pw-info">
        <span class="pw-username">${escapeHtml(entry.username)}</span>
        <span class="pw-site">${escapeHtml(entry.site)}</span>
      </div>
    `;
    item.addEventListener("mousedown", (e) => {
      // mousedown before blur so we can still fill
      e.preventDefault();
      removeAutofillPopup();
      // Find form scope and fill
      const form = input.closest("form") as HTMLFormElement | null;
      const dialog = input.closest('[role="dialog"], [aria-modal="true"], .modal, dialog') as HTMLElement | null;
      const scope: ParentNode = form || dialog || document;
      const allInputs = Array.from(scope.querySelectorAll<HTMLInputElement>("input"))
        .filter((el) => !el.disabled && el.offsetParent !== null);
      const usernameInput = allInputs.find((el) => {
        const t = el.type.toLowerCase();
        return (t === "text" || t === "email") && isUsernameField(el);
      }) || null;
      const passwordInput = allInputs.find((el) => isPasswordField(el)) || null;
      if (usernameInput) setNativeValue(usernameInput, entry.username);
      if (passwordInput) setNativeValue(passwordInput, entry.password);

      const submitBtn = findSubmitButton(scope);
      if (submitBtn) {
        setTimeout(() => submitBtn.click(), 100);
      }
    });
    popup.appendChild(item);
  }

  shadow.appendChild(style);
  shadow.appendChild(popup);
  document.body.appendChild(host);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function onInputFocus(event: FocusEvent) {
  const input = event.target as HTMLInputElement;
  if (!input || input.disabled || input.readOnly) return;
  const type = input.type.toLowerCase();
  const isPassword = isPasswordField(input);
  const isUsername = !isPassword && (type === "text" || type === "email") && isUsernameField(input);
  if (!isPassword && !isUsername) return;

  const matching: PasswordEntry[] = await chrome.runtime.sendMessage({ type: "GET_SITE_PASSWORDS" });

  if (!matching || matching.length === 0) return;

  showAutofillPopup(input, matching);
}

function onDocumentFocusOut(event: FocusEvent) {
  const related = event.relatedTarget as Node | null;
  // If focus moves outside the popup, dismiss
  if (autofillPopup && (!related || !autofillPopup.contains(related))) {
    // small delay to allow mousedown on popup item to fire first
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

document.addEventListener("focusin", onInputFocus as unknown as EventListener, true);
document.addEventListener("focusout", onDocumentFocusOut as EventListener, true);
document.addEventListener("click", (e) => {
  const target = e.target as Node;
  if (autofillPopup && !autofillPopup.contains(target) && target !== autofillTriggerInput) {
    removeAutofillPopup();
  }
}, true);

function isEditableField(target: Element): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
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

    const editableTarget = target.closest("input, textarea, [contenteditable='true']");
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
  const dialog = target?.closest('[role="dialog"], [aria-modal="true"], .MuiDialog-paper, .modal, dialog') as HTMLElement | null;
  const scope: ParentNode = form || dialog || document;

  // Get all visible, fillable inputs in scope
  const allInputs = Array.from(scope.querySelectorAll<HTMLInputElement>("input"))
    .filter((el) => !el.disabled && el.offsetParent !== null);

  // Separate by type, also check label/placeholder/name/id for "password" hint
  const passwordFields = allInputs.filter((el) => isPasswordField(el));
  const usernameFields = allInputs.filter((el) => {
    if (isPasswordField(el)) return false;
    const t = el.type.toLowerCase();
    if (t !== "text" && t !== "email") return false;
    return isUsernameField(el);
  });

  // Only fill within the form scope — do NOT widen to document
  const usernameInput = usernameFields[0] || null;
  const passwordInput = passwordFields[0] || null;

  console.debug("[notes-with-ai] autofill targets", {
    usernameInput: usernameInput ? { id: usernameInput.id, name: usernameInput.name, type: usernameInput.type } : null,
    passwordInput: passwordInput ? { id: passwordInput.id, name: passwordInput.name, type: passwordInput.type } : null,
    messageHasPassword: Boolean(message.password),
  });

  if (usernameInput) {
    setNativeValue(usernameInput, message.username);
  }
  if (passwordInput) {
    setNativeValue(passwordInput, message.password);
  }

  // Try to click the submit button if available
  const submitBtn = findSubmitButton(scope);
  if (submitBtn) {
    console.debug("[notes-with-ai] clicking submit button", {
      tag: submitBtn.tagName,
      type: (submitBtn as HTMLButtonElement).type,
      text: submitBtn.textContent?.trim().slice(0, 30),
    });
    setTimeout(() => submitBtn.click(), 100);
  } else {
    console.debug("[notes-with-ai] no submit button found, manual submission required");
  }

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
  const labelEl = el.labels?.[0] || (el.id && document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`));
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
  const labelEl = el.labels?.[0] || (el.id && document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`));
  if (labelEl) {
    hints.push(labelEl.textContent || "");
  }

  return hints.some((h) => h && /user.?id|user.?name|username|user|email|login|account|phone|mobile/i.test(h));
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
    new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }),
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
    'input[type="submit"], button[type="submit"]'
  );
  if (submitInput && isVisible(submitInput)) return submitInput;

  // 2. Look for buttons with submit-related text
  const buttons = Array.from(
    scope.querySelectorAll<HTMLElement>("button, [role='button'], a[class*='btn']")
  ).filter(isVisible);

  const submitPattern = /^(sign\s*in|log\s*in|login|submit|continue|next|enter)$/i;
  for (const btn of buttons) {
    const text = (btn.textContent || "").trim();
    if (submitPattern.test(text)) return btn;
  }

  // 3. Fallback: button without explicit type (defaults to submit in forms)
  const defaultButton = scope.querySelector<HTMLButtonElement>(
    "button:not([type])"
  );
  if (defaultButton && isVisible(defaultButton)) return defaultButton;

  return null;
}

function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null && !el.hidden && getComputedStyle(el).visibility !== "hidden";
}
