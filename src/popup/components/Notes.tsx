import { useState, useEffect } from 'react';

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
          <button className="delete-btn" onClick={() => deleteNote(note.id)}>×</button>
          <h4>{note.title}</h4>
          <p>{note.content}</p>
          <div className="meta">{new Date(note.createdAt).toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
