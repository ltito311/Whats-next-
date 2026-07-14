# What's Next

**Voice brain dumps → actionable tasks, notes and ideas.**

Hit record, ramble as long as you like. What's Next transcribes it, then an AI
sorts the ramble into:

- **Tasks** — rewritten as concrete next steps, scored by revenue impact ($–$$$),
  prioritized, and linked to your goals
- **Notes** — decisions and things to remember
- **Ideas** — creative sparks, clustered by theme in a visual **Mind** map

Everything is stored **on your device** (IndexedDB). No backend, no account.

## Features

- 🎙️ **Capture** — one-tap voice recording, or type a dump instead
- 📴 **Offline-first PWA** — install it on your phone; recording always works,
  queued dumps process automatically when you're back online
- 🧠 **On-device Whisper** — free, private transcription in the browser
  (first use downloads the model, ~40–250 MB depending on size, then cached
  for offline use). Optional cloud transcription (any OpenAI-compatible
  `/audio/transcriptions` endpoint, e.g. Groq) for speed
- 🤖 **Bring your own AI** — task extraction runs on any OpenAI-compatible
  chat API: OpenRouter, DeepSeek, Groq, a local server. Keys live only in
  your browser
- 🎯 **Goals** — define revenue goals; extracted tasks get linked and the list
  sorts by what moves the needle
- ✨ **Mind view** — your notes and ideas clustered by theme as a glowing map
- 🌗 **Two themes** — premium dark with glowing accents (default) and pastel
  light glassmorphism

## Getting started

```bash
npm install
npm run dev      # local dev server
npm run build    # production build to dist/
npm run preview  # serve the production build
```

Deploy `dist/` to any static host (Netlify, Vercel, Cloudflare Pages, GitHub
Pages). HTTPS is required for microphone access and PWA install.

### Hooking up AI

1. Open **Settings → AI brain**, paste an API key
   (e.g. an [OpenRouter](https://openrouter.ai) key) and pick a cheap model —
   DeepSeek/Qwen/GLM class models handle extraction well for pennies.
2. Optionally add a cloud transcription key under **Settings → Transcription**
   (Groq's `whisper-large-v3-turbo` is fast and nearly free). Without one,
   transcription runs on-device.
3. Tell the AI about your business under **Settings → About you** so
   revenue-impact scoring matches reality.

## Stack

React 19 + TypeScript + Vite, Dexie (IndexedDB), `@huggingface/transformers`
(in-browser Whisper via a web worker), `vite-plugin-pwa` (service worker +
offline caching, including model weights). No UI framework — hand-rolled
glassmorphism design system in `src/styles/global.css`.
