import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Note } from '../types';
import { timeAgo } from '../utils';

const W = 1000;
const H = 720;

interface ItemNode {
  note: Note;
  x: number;
  y: number;
  r: number;
}

interface Cluster {
  theme: string;
  x: number;
  y: number;
  r: number;
  items: ItemNode[];
}

/**
 * Deterministic layout: theme hubs sit on a golden-angle spiral from the
 * center, items orbit their hub. No physics engine needed for a v1.
 */
function layout(notes: Note[]): Cluster[] {
  const byTheme = new Map<string, Note[]>();
  for (const n of notes) {
    const key = n.theme || 'misc';
    if (!byTheme.has(key)) byTheme.set(key, []);
    byTheme.get(key)!.push(n);
  }
  const themes = [...byTheme.entries()].sort((a, b) => b[1].length - a[1].length);
  const cx = W / 2;
  const cy = H / 2;
  const GOLDEN = 2.399963;

  return themes.map(([theme, items], i) => {
    const hubR = Math.min(52, 30 + items.length * 3);
    const dist = i === 0 ? 0 : 130 + 92 * Math.sqrt(i);
    const angle = i * GOLDEN;
    const x = cx + dist * Math.cos(angle);
    const y = cy + dist * Math.sin(angle) * 0.72; // squash vertically to fit the canvas
    const orbit = hubR + 40;
    const itemNodes = items.slice(0, 10).map((note, j) => {
      const a = (j / Math.min(items.length, 10)) * Math.PI * 2 + i * 0.7;
      const r = 12 + Math.min(10, note.content.length / 60);
      return {
        note,
        x: x + (orbit + (j % 2) * 18) * Math.cos(a),
        y: y + (orbit + (j % 2) * 18) * Math.sin(a) * 0.85,
        r
      };
    });
    return { theme, x, y, r: hubR, items: itemNodes };
  });
}

export default function MindView() {
  const notes = useLiveQuery(() => db.notes.toArray(), []);
  const [selected, setSelected] = useState<Note | null>(null);

  const clusters = useMemo(() => layout(notes ?? []), [notes]);

  if (notes !== undefined && notes.length === 0) {
    return (
      <>
        <h1 className="view-title">Mind</h1>
        <p className="view-sub">A map of what you've been thinking about.</p>
        <div className="empty">
          <strong>Your mind map is empty</strong>
          Record a few brain dumps and your ideas will cluster here by theme.
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="view-title">Mind</h1>
      <p className="view-sub">
        {clusters.length} theme{clusters.length === 1 ? '' : 's'} ·{' '}
        {notes?.length ?? 0} thought{(notes?.length ?? 0) === 1 ? '' : 's'} — tap a bubble to read it.
      </p>
      <svg className="mind-canvas" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Idea map">
        <defs>
          <radialGradient id="hubGrad" cx="35%" cy="30%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.12" />
          </radialGradient>
          <radialGradient id="ideaGrad" cx="35%" cy="30%">
            <stop offset="0%" stopColor="var(--purple)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--purple)" stopOpacity="0.3" />
          </radialGradient>
          <radialGradient id="noteGrad" cx="35%" cy="30%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        {clusters.map((c) => (
          <g key={c.theme}>
            {c.items.map((it) => (
              <line
                key={`l-${it.note.id}`}
                x1={c.x}
                y1={c.y}
                x2={it.x}
                y2={it.y}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
            ))}
            <circle cx={c.x} cy={c.y} r={c.r} fill="url(#hubGrad)" stroke="var(--border-strong)" />
            <text
              x={c.x}
              y={c.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="var(--text)"
              fontSize={15}
              fontWeight={700}
            >
              {c.theme}
            </text>
            <text
              x={c.x}
              y={c.y + 19}
              textAnchor="middle"
              fill="var(--dim)"
              fontSize={11}
            >
              {c.items.length}
            </text>
            {c.items.map((it) => (
              <g
                key={it.note.id}
                onClick={() => setSelected(it.note)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={it.x}
                  cy={it.y}
                  r={it.r}
                  fill={it.note.kind === 'idea' ? 'url(#ideaGrad)' : 'url(#noteGrad)'}
                  stroke={selected?.id === it.note.id ? 'var(--text)' : 'transparent'}
                  strokeWidth={2}
                />
                <text
                  x={it.x}
                  y={it.y + it.r + 14}
                  textAnchor="middle"
                  fill="var(--dim)"
                  fontSize={11}
                >
                  {it.note.title.length > 22 ? `${it.note.title.slice(0, 22)}…` : it.note.title}
                </text>
              </g>
            ))}
          </g>
        ))}
      </svg>
      {selected && (
        <div className="card mind-detail fade-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className={`pill ${selected.kind}`}>{selected.kind}</span>
            <span className="pill status-wait">{selected.theme}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 12 }}>
              {timeAgo(selected.createdAt)}
            </span>
          </div>
          <div className="note-title" style={{ fontWeight: 700, marginBottom: 6 }}>
            {selected.title}
          </div>
          <p style={{ color: 'var(--dim)', fontSize: 14, lineHeight: 1.6 }}>{selected.content}</p>
        </div>
      )}
    </>
  );
}
