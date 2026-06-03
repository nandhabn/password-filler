// Run with: node setup.js
// Creates all directories and source files for the Chrome extension
const fs = require('fs');
const path = require('path');

const root = __dirname;

// Create directories
['src/popup/components', 'src/background', 'src/content', 'icons'].forEach(d => {
  fs.mkdirSync(path.join(root, d), { recursive: true });
});

// All source files
const files = {

// ─── src/popup/index.tsx ───
'src/popup/index.tsx': `import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
`,

// ─── src/popup/App.tsx ───
'src/popup/App.tsx': `import { useState } from 'react';
import Notes from './components/Notes';
import Passwords from './components/Passwords';

type Tab = 'notes' | 'passwords';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('notes');

  return (
    <div className="app">
      <header className="tabs">
        <button
          className={activeTab === 'notes' ? 'active' : ''}
          onClick={() => setActiveTab('notes')}
        >
          \u{1F4DD} Notes
        </button>
        <button
          className={activeTab === 'passwords' ? 'active' : ''}
          onClick={() => setActiveTab('passwords')}
        >
          \u{1F511} Passwords
        </button>
      </header>
      <main>
        {activeTab === 'notes' ? <Notes /> : <Passwords />}
      </main>
    </div>
  );
}
`,

// ─── src/popup/styles.css ───
'src/popup/styles.css': `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 380px;
  min-height: 500px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #eaeaea;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs {
  display: flex;
  border-bottom: 2px solid #16213e;
}

.tabs button {
  flex: 1;
  padding: 12px;
  border: none;
  background: #16213e;
  color: #aaa;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tabs button.active {
  background: #0f3460;
  color: #fff;
  border-bottom: 2px solid #e94560;
}

.tabs button:hover:not(.active) {
  background: #1a1a40;
}

main {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

input, textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #16213e;
  color: #eaeaea;
  font-size: 13px;
  margin-bottom: 8px;
  outline: none;
}

input:focus, textarea:focus {
  border-color: #e94560;
}

textarea {
  resize: vertical;
  min-height: 80px;
}

button.primary {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  background: #e94560;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

button.primary:hover {
  background: #c73e54;
}

.card {
  background: #16213e;
  border-radius: 8px;
  padding: 12px;
  margin-top: 10px;
  position: relative;
}

.card h4 {
  font-size: 13px;
  color: #e94560;
  margin-bottom: 4px;
}

.card p {
  font-size: 12px;
  color: #ccc;
  white-space: pre-wrap;
  word-break: break-word;
}

.card .delete-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: none;
  border: none;
  color: #e94560;
  font-size: 16px;
  cursor: pointer;
}

.card .meta {
  font-size: 11px;
  color: #666;
  margin-top: 6px;
}

.empty {
  text-align: center;
  color: #555;
  margin-top: 40px;
  font-size: 13px;
}

.password-value {
  font-family: monospace;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.password-value button {
  background: none;
  border: none;
  color: #e94560;
  cursor: pointer;
  font-size: 12px;
}
`,

// ─── src/popup/components/Notes.tsx ───
'src/popup/components/Notes.tsx': `import { useState, useEffect } from 'react';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

export default function Notes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    chrome.storage.local.get(['notes'], (result) => {
      setNotes(result.notes || []);
    });
  }, []);

  const saveNotes = (updated: Note[]) => {
    setNotes(updated);
    chrome.storage.local.set({ notes: updated });
  };

  const addNote = () => {
    if (!title.trim() && !content.trim()) return;
    const note: Note = {
      id: crypto.randomUUID(),
      title: title.trim() || 'Untitled',
      content: content.trim(),
      createdAt: Date.now(),
    };
    saveNotes([note, ...notes]);
    setTitle('');
    setContent('');
  };

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  return (
    <div>
      <input
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <textarea
        placeholder="Write your note..."
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      <button className="primary" onClick={addNote}>Add Note</button>

      {notes.length === 0 && <p className="empty">No notes yet</p>}
      {notes.map(note => (
        <div key={note.id} className="card">
          <button className="delete-btn" onClick={() => deleteNote(note.id)}>\u00D7</button>
          <h4>{note.title}</h4>
          <p>{note.content}</p>
          <div className="meta">{new Date(note.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
`,

// ─── src/popup/components/Passwords.tsx ───
'src/popup/components/Passwords.tsx': `import { useState, useEffect } from 'react';

interface PasswordEntry {
  id: string;
  site: string;
  username: string;
  password: string;
}

export default function Passwords() {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [site, setSite] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    chrome.storage.local.get(['passwords'], (result) => {
      setEntries(result.passwords || []);
    });
  }, []);

  const saveEntries = (updated: PasswordEntry[]) => {
    setEntries(updated);
    chrome.storage.local.set({ passwords: updated });
  };

  const addEntry = () => {
    if (!site.trim() || !username.trim() || !password.trim()) return;
    const entry: PasswordEntry = {
      id: crypto.randomUUID(),
      site: site.trim(),
      username: username.trim(),
      password: password.trim(),
    };
    saveEntries([entry, ...entries]);
    setSite('');
    setUsername('');
    setPassword('');
  };

  const deleteEntry = (id: string) => {
    saveEntries(entries.filter(e => e.id !== id));
    visibleIds.delete(id);
    setVisibleIds(new Set(visibleIds));
  };

  const toggleVisibility = (id: string) => {
    const next = new Set(visibleIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setVisibleIds(next);
  };

  return (
    <div>
      <input placeholder="Site (e.g. github.com)" value={site} onChange={e => setSite(e.target.value)} />
      <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button className="primary" onClick={addEntry}>Save Password</button>

      {entries.length === 0 && <p className="empty">No saved passwords</p>}
      {entries.map(entry => (
        <div key={entry.id} className="card">
          <button className="delete-btn" onClick={() => deleteEntry(entry.id)}>\u00D7</button>
          <h4>{entry.site}</h4>
          <p>User: {entry.username}</p>
          <p className="password-value">
            Pass: {visibleIds.has(entry.id) ? entry.password : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
            <button onClick={() => toggleVisibility(entry.id)}>
              {visibleIds.has(entry.id) ? 'Hide' : 'Show'}
            </button>
          </p>
        </div>
      ))}
    </div>
  );
}
`,

// ─── src/background/background.ts ───
'src/background/background.ts': `chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'autofill-password',
    title: 'Autofill Password',
    contexts: ['editable'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'autofill-password' || !tab?.id) return;

  const result = await chrome.storage.local.get(['passwords']);
  const passwords: Array<{ site: string; username: string; password: string }> = result.passwords || [];

  if (passwords.length === 0) return;

  const url = tab.url || '';
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    // ignore invalid URLs
  }

  // Find matching entry for current site, fallback to first entry
  const match = passwords.find(p =>
    hostname.includes(p.site) || p.site.includes(hostname)
  ) || passwords[0];

  chrome.tabs.sendMessage(tab.id, {
    type: 'AUTOFILL',
    username: match.username,
    password: match.password,
  });
});
`,

// ─── src/content/content.ts ───
'src/content/content.ts': `chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'AUTOFILL') return;

  const active = document.activeElement as HTMLInputElement | null;

  if (active && active.tagName === 'INPUT') {
    const type = active.type.toLowerCase();

    if (type === 'password') {
      setNativeValue(active, message.password);
      // Try to fill the username field too (previous input sibling in form)
      const form = active.closest('form');
      if (form) {
        const inputs = Array.from(form.querySelectorAll('input'));
        const pwIdx = inputs.indexOf(active);
        for (let i = pwIdx - 1; i >= 0; i--) {
          const inp = inputs[i];
          const t = inp.type.toLowerCase();
          if (t === 'text' || t === 'email') {
            setNativeValue(inp, message.username);
            break;
          }
        }
      }
    } else if (type === 'text' || type === 'email') {
      setNativeValue(active, message.username);
    }
  }
});

// Set value using native setter to trigger React/Angular change detection
function setNativeValue(el: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
`,

// ─── src/vite-env.d.ts ───
'src/vite-env.d.ts': `/// <reference types="vite/client" />
`,

};

// Write all files
Object.entries(files).forEach(([filePath, content]) => {
  const fullPath = path.join(root, filePath);
  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('  Created:', filePath);
});

console.log('\n\u2705 Project scaffolded! Next steps:');
console.log('  1. npm install');
console.log('  2. npm run build');
console.log('  3. Go to chrome://extensions, enable Developer Mode');
console.log('  4. Click "Load unpacked" and select the dist/ folder');

// Generate simple PNG icons (1x1 colored pixel as minimal valid PNG)
// For production, replace with real icons
function createMinimalPng(size) {
  // Create a minimal valid PNG with a solid color
  const { createCanvas } = (() => {
    try { return require('canvas'); } catch { return { createCanvas: null }; }
  })();

  if (createCanvas) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e94560';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${size * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', size/2, size/2);
    return canvas.toBuffer('image/png');
  }
  // Fallback: write a 1x1 red PNG (minimal valid PNG file)
  const header = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
  ]);
  // We'll just create an empty placeholder file
  return header;
}

[16, 48, 128].forEach(size => {
  const iconPath = path.join(root, 'icons', `icon${size}.png`);
  if (!fs.existsSync(iconPath)) {
    fs.writeFileSync(iconPath, createMinimalPng(size));
    console.log(`  Created placeholder: icons/icon${size}.png`);
  }
});

console.log('\n  Note: Replace icons/*.png with proper icons for production.');

