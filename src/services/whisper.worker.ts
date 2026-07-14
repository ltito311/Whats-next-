/// <reference lib="webworker" />
import { pipeline } from '@huggingface/transformers';

const scope = self as unknown as Worker;

let asr: any = null;
let loadedModel = '';

scope.onmessage = async (e: MessageEvent) => {
  const { type, model, audio } = e.data ?? {};
  if (type !== 'transcribe') return;
  try {
    if (!asr || loadedModel !== model) {
      asr = null;
      asr = await pipeline('automatic-speech-recognition', model, {
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && typeof p.progress === 'number') {
            scope.postMessage({
              type: 'progress',
              file: String(p.file ?? ''),
              progress: Math.round(p.progress)
            });
          }
        }
      } as any);
      loadedModel = model;
    }
    scope.postMessage({ type: 'status', message: 'Transcribing on device…' });
    const out: any = await asr(audio, { chunk_length_s: 30, stride_length_s: 5 });
    scope.postMessage({ type: 'result', text: String(out?.text ?? '').trim() });
  } catch (err) {
    scope.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
