import { useSyncExternalStore } from 'react';

export type SttMode = 'auto' | 'ondevice' | 'cloud';

export interface AppSettings {
  theme: 'dark' | 'light';
  /** OpenAI-compatible chat endpoint (OpenRouter, DeepSeek, Groq, local, …) */
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  sttMode: SttMode;
  /** OpenAI-compatible /audio/transcriptions endpoint */
  sttBaseUrl: string;
  sttApiKey: string;
  sttModel: string;
  /** transformers.js model id for in-browser Whisper */
  localWhisperModel: string;
  /** free-text context about the user's goals/business, injected into extraction */
  goalContext: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  llmBaseUrl: 'https://openrouter.ai/api/v1',
  llmApiKey: '',
  llmModel: 'deepseek/deepseek-chat-v3-0324',
  sttMode: 'auto',
  sttBaseUrl: 'https://api.groq.com/openai/v1',
  sttApiKey: '',
  sttModel: 'whisper-large-v3-turbo',
  localWhisperModel: 'onnx-community/whisper-base',
  goalContext: ''
};

const STORAGE_KEY = 'wn.settings';
const listeners = new Set<() => void>();
let current: AppSettings = load();

function load(): AppSettings {
  let merged = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) merged = { ...merged, ...JSON.parse(raw) };
  } catch {
    /* corrupted settings fall back to defaults */
  }
  // Build-time defaults (e.g. from .env.local or the host's env vars) fill
  // empty keys so a personal deploy comes pre-configured; anything the user
  // typed in Settings wins.
  if (!merged.llmApiKey && import.meta.env.VITE_DEFAULT_LLM_API_KEY) {
    merged.llmApiKey = String(import.meta.env.VITE_DEFAULT_LLM_API_KEY);
  }
  if (import.meta.env.VITE_DEFAULT_LLM_MODEL && merged.llmModel === DEFAULT_SETTINGS.llmModel) {
    merged.llmModel = String(import.meta.env.VITE_DEFAULT_LLM_MODEL);
  }
  if (!merged.sttApiKey && import.meta.env.VITE_DEFAULT_STT_API_KEY) {
    merged.sttApiKey = String(import.meta.env.VITE_DEFAULT_STT_API_KEY);
  }
  return merged;
}

export function getSettings(): AppSettings {
  return current;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  current = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  listeners.forEach((fn) => fn());
  return current;
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current
  );
}

export function applyTheme(theme: 'dark' | 'light'): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b0f14' : '#f6f2fa');
}

/** True when the AI extraction step can run right now. */
export function canExtract(): boolean {
  return navigator.onLine && current.llmApiKey.trim().length > 0;
}

/** True when cloud transcription is configured and reachable. */
export function canCloudTranscribe(): boolean {
  return navigator.onLine && current.sttApiKey.trim().length > 0;
}
