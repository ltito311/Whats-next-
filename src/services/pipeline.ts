import { useSyncExternalStore } from 'react';
import { db } from '../db';
import type { Dump } from '../types';
import { canCloudTranscribe, canExtract, getSettings } from '../settings';
import { extractFromTranscript } from './llm';
import { transcribeCloud, transcribeLocal } from './stt';

export interface PipelineState {
  active: boolean;
  message: string;
}

let state: PipelineState = { active: false, message: '' };
const listeners = new Set<() => void>();

function setState(next: PipelineState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

export function usePipelineState(): PipelineState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state
  );
}

/** Reset dumps stuck mid-step by a page reload back to their stable state. */
async function resetStuck(): Promise<void> {
  await db.dumps.where('status').equals('transcribing').modify({ status: 'recorded' });
  await db.dumps.where('status').equals('extracting').modify({ status: 'transcribed' });
}

async function nextActionable(): Promise<Dump | undefined> {
  const pending = await db.dumps
    .where('status')
    .anyOf('recorded', 'transcribed')
    .sortBy('createdAt');
  return pending.find((d) => {
    if (d.status === 'recorded') return !!d.audio;
    return canExtract();
  });
}

async function transcribeStep(dump: Dump): Promise<void> {
  const settings = getSettings();
  await db.dumps.update(dump.id!, { status: 'transcribing', error: undefined });
  const useCloud =
    settings.sttMode === 'cloud' ||
    (settings.sttMode === 'auto' && canCloudTranscribe());
  const onProgress = (message: string) => setState({ active: true, message });
  onProgress(useCloud ? 'Transcribing in the cloud…' : 'Transcribing on device…');
  const text = useCloud
    ? await transcribeCloud(dump.audio!, dump.mimeType ?? 'audio/webm', settings)
    : await transcribeLocal(dump.audio!, settings, onProgress);
  if (!text) throw new Error('Transcription produced no text — was the recording silent?');
  await db.dumps.update(dump.id!, { transcript: text, status: 'transcribed' });
}

async function extractStep(dump: Dump): Promise<void> {
  const settings = getSettings();
  await db.dumps.update(dump.id!, { status: 'extracting', error: undefined });
  setState({ active: true, message: 'Extracting tasks & ideas…' });
  const goals = (await db.goals.toArray()).filter((g) => !g.archived);
  const extraction = await extractFromTranscript(dump.transcript ?? '', goals, settings);
  const now = Date.now();
  await db.transaction('rw', db.tasks, db.notes, db.dumps, async () => {
    await db.tasks.bulkAdd(
      extraction.tasks.map((t) => ({
        dumpId: dump.id,
        goalId: t.goalId,
        title: t.title,
        detail: t.detail,
        status: 'inbox' as const,
        priority: t.priority,
        revenueImpact: t.revenueImpact,
        due: t.due,
        createdAt: now
      }))
    );
    await db.notes.bulkAdd([
      ...extraction.notes.map((n) => ({
        dumpId: dump.id,
        kind: 'note' as const,
        title: n.title,
        content: n.content,
        theme: n.theme,
        createdAt: now
      })),
      ...extraction.ideas.map((n) => ({
        dumpId: dump.id,
        kind: 'idea' as const,
        title: n.title,
        content: n.content,
        theme: n.theme,
        createdAt: now
      }))
    ]);
    await db.dumps.update(dump.id!, {
      title: extraction.title,
      summary: extraction.summary,
      status: 'processed'
    });
  });
}

let running = false;

/** Drain the queue: transcribe recorded dumps, extract transcribed ones. */
export async function kickPipeline(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const dump = await nextActionable();
      if (!dump) break;
      try {
        if (dump.status === 'recorded') await transcribeStep(dump);
        else await extractStep(dump);
      } catch (err) {
        await db.dumps.update(dump.id!, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  } finally {
    running = false;
    const waiting = await db.dumps.where('status').equals('transcribed').count();
    setState({
      active: false,
      message:
        waiting > 0 && !canExtract()
          ? navigator.onLine
            ? 'Add an AI API key in Settings to extract tasks from your dumps.'
            : `${waiting} dump${waiting > 1 ? 's' : ''} waiting for connection…`
          : ''
    });
  }
}

export async function retryDump(dump: Dump): Promise<void> {
  const status = dump.transcript ? 'transcribed' : 'recorded';
  await db.dumps.update(dump.id!, { status, error: undefined });
  void kickPipeline();
}

export function initPipeline(): void {
  void resetStuck().then(kickPipeline);
  window.addEventListener('online', () => void kickPipeline());
}
