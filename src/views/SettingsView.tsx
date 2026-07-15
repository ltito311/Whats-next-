import { useState } from 'react';
import { saveSettings, useSettings, type AppSettings, type SttMode } from '../settings';
import { testLlmConnection } from '../services/llm';
import { kickPipeline } from '../services/pipeline';
import { exportAllData, wipeAllData } from '../db';
import { downloadText } from '../utils';
import { MoonIcon, SunIcon } from '../components/Icons';

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export default function SettingsView() {
  const settings = useSettings();
  const [testState, setTestState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [testMsg, setTestMsg] = useState('');

  const set = (patch: Partial<AppSettings>) => {
    saveSettings(patch);
    // New keys may unblock queued dumps.
    void kickPipeline();
  };

  async function runTest() {
    setTestState('busy');
    setTestMsg('');
    try {
      const reply = await testLlmConnection(settings);
      setTestState('ok');
      setTestMsg(`Connected — model replied: "${reply}"`);
    } catch (err) {
      setTestState('err');
      setTestMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function doExport() {
    downloadText(`whats-next-export-${new Date().toISOString().slice(0, 10)}.json`, await exportAllData());
  }

  async function doWipe() {
    if (!confirm('Delete ALL dumps, tasks, notes and goals on this device? This cannot be undone.')) return;
    await wipeAllData();
  }

  return (
    <>
      <h1 className="view-title">Settings</h1>
      <p className="view-sub">Your keys and data live only on this device.</p>

      <div className="card settings-section">
        <h3>Appearance</h3>
        <div className="theme-toggle">
          <button
            className={settings.theme === 'dark' ? 'active' : ''}
            onClick={() => set({ theme: 'dark' })}
          >
            <MoonIcon size={17} /> Dark
          </button>
          <button
            className={settings.theme === 'light' ? 'active' : ''}
            onClick={() => set({ theme: 'light' })}
          >
            <SunIcon size={17} /> Light
          </button>
        </div>
      </div>

      <div className="card settings-section">
        <h3>AI brain</h3>
        <p className="sub">
          Any OpenAI-compatible API works — OpenRouter, DeepSeek, Groq, a local server. This powers
          task &amp; idea extraction.
        </p>
        <Field label="Base URL">
          <input
            value={settings.llmBaseUrl}
            onChange={(e) => set({ llmBaseUrl: e.target.value })}
            placeholder="https://openrouter.ai/api/v1"
          />
        </Field>
        <Field label="API key">
          <input
            type="password"
            value={settings.llmApiKey}
            onChange={(e) => set({ llmApiKey: e.target.value })}
            placeholder="sk-or-…"
            autoComplete="off"
          />
        </Field>
        <Field label="Model" hint="Cheap + capable works great here (DeepSeek, Qwen, GLM…).">
          <input
            value={settings.llmModel}
            onChange={(e) => set({ llmModel: e.target.value })}
            placeholder="deepseek/deepseek-chat-v3-0324"
          />
        </Field>
        <button className="btn ghost small" onClick={runTest} disabled={testState === 'busy' || !settings.llmApiKey}>
          {testState === 'busy' ? 'Testing…' : 'Test connection'}
        </button>
        {testMsg && <p className={`test-result ${testState === 'ok' ? 'ok' : 'err'}`}>{testMsg}</p>}
      </div>

      <div className="card settings-section">
        <h3>Transcription</h3>
        <p className="sub">
          On-device Whisper is free, private and works offline (first use downloads the model, ~80&nbsp;MB,
          then it's cached). A cloud key makes transcription faster and more accurate when online.
        </p>
        <Field label="Mode">
          <select
            value={settings.sttMode}
            onChange={(e) => set({ sttMode: e.target.value as SttMode })}
          >
            <option value="auto">Auto — cloud when available, on-device otherwise</option>
            <option value="ondevice">Always on-device (private, offline)</option>
            <option value="cloud">Always cloud</option>
          </select>
        </Field>
        <Field label="On-device model">
          <select
            value={settings.localWhisperModel}
            onChange={(e) => set({ localWhisperModel: e.target.value })}
          >
            <option value="onnx-community/whisper-tiny">Whisper tiny — fastest, ~40 MB</option>
            <option value="onnx-community/whisper-base">Whisper base — balanced, ~80 MB</option>
            <option value="onnx-community/whisper-small">Whisper small — best quality, ~250 MB</option>
          </select>
        </Field>
        <Field label="Cloud base URL" hint="OpenAI-compatible /audio/transcriptions endpoint (Groq is fast and near-free).">
          <input
            value={settings.sttBaseUrl}
            onChange={(e) => set({ sttBaseUrl: e.target.value })}
            placeholder="https://api.groq.com/openai/v1"
          />
        </Field>
        <Field label="Cloud API key">
          <input
            type="password"
            value={settings.sttApiKey}
            onChange={(e) => set({ sttApiKey: e.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field label="Cloud model">
          <input
            value={settings.sttModel}
            onChange={(e) => set({ sttModel: e.target.value })}
            placeholder="whisper-large-v3-turbo"
          />
        </Field>
      </div>

      <div className="card settings-section">
        <h3>About you</h3>
        <p className="sub">
          Context the AI reads before extracting tasks — your business, what "revenue" means for you,
          how you like tasks phrased.
        </p>
        <textarea
          rows={4}
          value={settings.goalContext}
          onChange={(e) => set({ goalContext: e.target.value })}
          placeholder="e.g. I run AI Driver ROI. Revenue = new client contracts and retainers. Prefer tasks phrased as small next steps…"
        />
      </div>

      <div className="card settings-section">
        <h3>Data</h3>
        <p className="sub">Everything is stored in this browser (IndexedDB). Export before switching devices.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost small" onClick={doExport}>
            Export JSON
          </button>
          <button className="btn ghost small" style={{ color: 'var(--pink)' }} onClick={doWipe}>
            Erase everything
          </button>
        </div>
      </div>
    </>
  );
}
