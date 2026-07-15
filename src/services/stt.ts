import type { AppSettings } from '../settings';
import { blobToPCM } from './audio';

export type SttProgress = (message: string) => void;

/** OpenAI-compatible /audio/transcriptions (works with OpenAI, Groq, etc.). */
export async function transcribeCloud(
  blob: Blob,
  mimeType: string,
  settings: AppSettings
): Promise<string> {
  const base = settings.sttBaseUrl.replace(/\/+$/, '');
  const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', new File([blob], `dump.${ext}`, { type: mimeType }));
  form.append('model', settings.sttModel);
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.sttApiKey}` },
    body: form
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Transcription failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (typeof data?.text !== 'string') throw new Error('Transcription API returned no text.');
  return data.text.trim();
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

/** In-browser Whisper via transformers.js; the pipeline runs jobs one at a time. */
export function transcribeLocal(
  blob: Blob,
  settings: AppSettings,
  onProgress: SttProgress
): Promise<string> {
  return new Promise((resolve, reject) => {
    blobToPCM(blob)
      .then((pcm) => {
        const w = getWorker();
        const files = new Map<string, number>();
        const handler = (e: MessageEvent) => {
          const msg = e.data ?? {};
          if (msg.type === 'progress') {
            files.set(msg.file, msg.progress);
            const values = [...files.values()];
            const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
            onProgress(`Downloading speech model… ${avg}%`);
          } else if (msg.type === 'status') {
            onProgress(msg.message);
          } else if (msg.type === 'result') {
            w.removeEventListener('message', handler);
            resolve(msg.text);
          } else if (msg.type === 'error') {
            w.removeEventListener('message', handler);
            reject(new Error(msg.error));
          }
        };
        w.addEventListener('message', handler);
        w.postMessage(
          { type: 'transcribe', model: settings.localWhisperModel, audio: pcm },
          [pcm.buffer]
        );
      })
      .catch(reject);
  });
}
