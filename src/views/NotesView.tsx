import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { NoteKind } from '../types';
import { timeAgo } from '../utils';
import { TrashIcon } from '../components/Icons';

type Filter = 'all' | NoteKind;

export default function NotesView() {
  const notes = useLiveQuery(() => db.notes.orderBy('createdAt').reverse().toArray(), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (filter !== 'all' && n.kind !== filter) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.theme.toLowerCase().includes(q)
      );
    });
  }, [notes, filter, query]);

  return (
    <>
      <h1 className="view-title">Notes & Ideas</h1>
      <p className="view-sub">Everything worth keeping that isn't a task.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <input placeholder="Search notes, ideas, themes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chip-row">
          {(['all', 'idea', 'note'] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'idea' ? 'Ideas' : 'Notes'}
            </button>
          ))}
        </div>
      </div>

      {notes !== undefined && filtered.length === 0 ? (
        <div className="empty">
          <strong>{query ? 'No matches' : 'Nothing captured yet'}</strong>
          {query
            ? 'Try a different search.'
            : 'Notes and ideas extracted from your brain dumps will collect here.'}
        </div>
      ) : (
        <div className="note-grid">
          {filtered.map((n) => (
            <div className="card note-card" key={n.id}>
              <div className="note-title">{n.title}</div>
              <div className="note-content">{n.content}</div>
              <div className="note-foot">
                <span className={`pill ${n.kind}`}>{n.kind}</span>
                <span className="pill status-wait">{n.theme}</span>
                <span className="spacer" />
                <span>{timeAgo(n.createdAt)}</span>
                <button className="icon-btn" onClick={() => void db.notes.delete(n.id!)}>
                  <TrashIcon size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
