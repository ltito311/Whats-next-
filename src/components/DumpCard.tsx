import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Dump } from '../types';
import { retryDump } from '../services/pipeline';
import { formatDuration, timeAgo } from '../utils';
import { RetryIcon, TrashIcon } from './Icons';

function statusPill(dump: Dump) {
  switch (dump.status) {
    case 'recorded':
      return <span className="pill status-wait">queued</span>;
    case 'transcribing':
      return <span className="pill status-busy">transcribing…</span>;
    case 'transcribed':
      return <span className="pill status-wait">awaiting AI</span>;
    case 'extracting':
      return <span className="pill status-busy">extracting…</span>;
    case 'processed':
      return <span className="pill status-done">done</span>;
    case 'error':
      return <span className="pill status-err">error</span>;
  }
}

export default function DumpCard({ dump }: { dump: Dump }) {
  const [open, setOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');

  const counts = useLiveQuery(async () => {
    if (dump.status !== 'processed') return null;
    const [tasks, notes] = await Promise.all([
      db.tasks.where('dumpId').equals(dump.id!).count(),
      db.notes.where('dumpId').equals(dump.id!).count()
    ]);
    return { tasks, notes };
  }, [dump.id, dump.status]);

  useEffect(() => {
    if (open && dump.audio && !audioUrl) {
      setAudioUrl(URL.createObjectURL(dump.audio));
    }
  }, [open, dump.audio, audioUrl]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const title = useMemo(() => {
    if (dump.title) return dump.title;
    if (dump.transcript) {
      const t = dump.transcript.slice(0, 64);
      return t.length < dump.transcript.length ? `${t}…` : t;
    }
    return dump.duration > 0 ? 'Voice dump' : 'Typed dump';
  }, [dump]);

  async function remove() {
    if (!confirm('Delete this dump? Tasks and notes already extracted from it stay.')) return;
    await db.dumps.delete(dump.id!);
  }

  return (
    <div className="card dump-card">
      <button className="dump-head" onClick={() => setOpen((v) => !v)}>
        <div className="dump-head-main">
          <div className="dump-title">{title}</div>
          <div className="dump-meta">
            <span>{timeAgo(dump.createdAt)}</span>
            {dump.duration > 0 && <span>· {formatDuration(dump.duration)}</span>}
            {statusPill(dump)}
            {counts && (
              <span>
                · {counts.tasks} task{counts.tasks === 1 ? '' : 's'}, {counts.notes} note
                {counts.notes === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </button>
      {open && (
        <div className="dump-body fade-in">
          {dump.summary && <p className="dump-summary">{dump.summary}</p>}
          {dump.error && <p className="dump-error">{dump.error}</p>}
          {audioUrl && <audio controls src={audioUrl} preload="metadata" />}
          {dump.transcript && <div className="dump-transcript">{dump.transcript}</div>}
          <div className="dump-actions">
            {(dump.status === 'error' || dump.status === 'processed') && (
              <button className="btn ghost small" onClick={() => void retryDump(dump)}>
                <RetryIcon size={14} /> {dump.status === 'error' ? 'Retry' : 'Re-extract'}
              </button>
            )}
            <button className="btn ghost small" onClick={remove}>
              <TrashIcon size={14} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
