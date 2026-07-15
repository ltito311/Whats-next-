import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { kickPipeline, usePipelineState } from '../services/pipeline';
import { pickRecordingMimeType } from '../services/audio';
import { formatDuration, todayGreeting } from '../utils';
import { KeyboardIcon, MicIcon, StopIcon } from '../components/Icons';
import DumpCard from '../components/DumpCard';

export default function CaptureView() {
  const dumps = useLiveQuery(() => db.dumps.orderBy('createdAt').reverse().limit(30).toArray(), []);
  const pipeline = usePipelineState();

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState('');
  const [showTyper, setShowTyper] = useState(false);
  const [typed, setTyped] = useState('');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => clearInterval(timerRef.current), []);

  async function startRecording() {
    setMicError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const duration = (Date.now() - startedAtRef.current) / 1000;
        if (blob.size > 0 && duration >= 1) {
          await db.dumps.add({
            createdAt: Date.now(),
            duration,
            audio: blob,
            mimeType: type,
            status: 'recorded'
          });
          void kickPipeline();
        }
      };
      recorder.start(1000);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(
        () => setElapsed((Date.now() - startedAtRef.current) / 1000),
        500
      );
    } catch (err) {
      setMicError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings, or type your dump below.'
          : `Could not start recording: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function stopRecording() {
    clearInterval(timerRef.current);
    setRecording(false);
    recorderRef.current?.stop();
    recorderRef.current = null;
  }

  async function submitTyped() {
    const text = typed.trim();
    if (!text) return;
    await db.dumps.add({
      createdAt: Date.now(),
      duration: 0,
      transcript: text,
      status: 'transcribed'
    });
    setTyped('');
    setShowTyper(false);
    void kickPipeline();
  }

  return (
    <>
      <h1 className="view-title">{todayGreeting()}</h1>
      <p className="view-sub">
        {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {' · '}what's on your mind?
      </p>

      <div className="capture-hero">
        <button
          className={`rec-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
        >
          {recording ? <StopIcon size={36} /> : <MicIcon size={38} />}
        </button>
        {recording ? (
          <div className="rec-timer">{formatDuration(elapsed)}</div>
        ) : (
          <p className="rec-hint">
            Tap to record a brain dump.
            <br />
            Ramble as long as you like — the AI sorts it out.
          </p>
        )}
        {!recording && (
          <button className="type-toggle" onClick={() => setShowTyper((v) => !v)}>
            <KeyboardIcon size={17} /> or type it instead
          </button>
        )}
      </div>

      {micError && <div className="pipeline-banner">{micError}</div>}

      {showTyper && !recording && (
        <div className="card fade-in" style={{ marginTop: 4 }}>
          <textarea
            rows={5}
            placeholder="Dump everything on your mind — ideas, todos, worries, plans…"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" onClick={submitTyped} disabled={!typed.trim()}>
              Process it
            </button>
          </div>
        </div>
      )}

      {(pipeline.active || pipeline.message) && (
        <div className="pipeline-banner">
          {pipeline.active && <span className="spinner" />}
          <span>{pipeline.message || 'Processing…'}</span>
        </div>
      )}

      <div className="section-label">
        <span>Recent dumps</span>
      </div>
      {dumps === undefined ? null : dumps.length === 0 ? (
        <div className="empty">
          <strong>Nothing here yet</strong>
          Hit the mic and let it all out. Tasks, notes and ideas will appear automatically.
        </div>
      ) : (
        dumps.map((d) => <DumpCard key={d.id} dump={d} />)
      )}
    </>
  );
}
