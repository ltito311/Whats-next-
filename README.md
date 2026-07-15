# What's Next

A personal task management app with a built-in **voice + text AI agent** that
manages your board for you. Talk to it ("add buy groceries for tomorrow, high
priority, and clear everything I've finished") and it makes the changes.

- **Zero dependencies** — plain Node.js, nothing to `npm install`.
- **Voice input is free** — transcription uses the browser's built-in
  Web Speech API (Chrome / Edge / Safari). Hit the mic, talk, watch it
  transcribe live, then hit ✔ to send.
- **Bring any cheap model** — works with any OpenAI-compatible API.
  Presets included for DeepSeek, GLM (Zhipu), Kimi (Moonshot), and Qwen.
- **Two chat modes** — ⚡ Tasks (do what I said) and 💭 Brainstorm
  (thinking partner: untangle a rambly voice note into a plan, then put
  it on the board when you say go). ☀️ gives you a morning kickoff that
  ranks your day by your standing priorities (🎯 focus note).
- **Your data lives on your device** — tasks, chat history, and focus
  note persist in the browser (localStorage). The server is stateless,
  so redeploys never wipe anything.
- **Installable PWA** — add it to your phone home screen; a network-first
  service worker means every reopen shows the latest deployed version.

## Quick start

```bash
cp .env.example .env      # then paste your API key into it
node server.js            # requires Node 18+
```

Open http://localhost:3000 in Chrome (best voice support).

## Getting an API key (the only thing you need)

Pick one — they all work the same way as Claude's API: sign up, create a
key, paste it into `.env`.

| Provider | Model | Cost | Where |
|---|---|---|---|
| **DeepSeek** (recommended) | `deepseek-chat` | ~$0.27 / M input tokens, ~$2 min top-up | [platform.deepseek.com](https://platform.deepseek.com) |
| **GLM / Zhipu** | `glm-4-flash` | **Free tier** | [open.bigmodel.cn](https://open.bigmodel.cn) |
| **Kimi / Moonshot** | `kimi-k2-0905-preview` | Cheap, strong agentic model | [platform.moonshot.cn](https://platform.moonshot.cn) |
| **Qwen / Alibaba** | `qwen-plus` | Cheap, free trial credits | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) |

Set `PROVIDER=deepseek` (or `glm`, `kimi`, `qwen`) and `PROVIDER_API_KEY=...`
in `.env`. To use anything else (OpenRouter, SiliconFlow, a local model via
Ollama/LM Studio), set `PROVIDER_BASE_URL` and `PROVIDER_MODEL` directly.

## Put it on your phone (free, auto-updates on every push)

1. **Host it on Render (free):** go to [render.com](https://render.com),
   sign in with GitHub, click **New + → Blueprint**, and pick this repo —
   `render.yaml` configures everything. When prompted, paste your
   `PROVIDER_API_KEY`. (Or use **New + → Web Service** manually: start
   command `node server.js`, free plan, add the env var.)
2. **Auto-deploy is on by default:** every `git push` to the connected
   branch redeploys within a couple of minutes.
3. **Install on iPhone:** open your Render URL in Safari → Share →
   **Add to Home Screen**. Because data lives on the device and the
   service worker is network-first, reopening the app after a push shows
   the new version — nothing else to do.

Notes:
- The free tier sleeps after ~15 min idle; the first open afterwards takes
  ~30–60 s to wake. Your tasks and chat are already on-device, so the board
  shows instantly — only the AI needs the server awake.
- Voice note for iOS: the in-app 🎤 uses Safari speech recognition, which
  can be unavailable inside home-screen apps on older iOS versions. If so,
  just tap the text box and use the keyboard's built-in dictation mic —
  same result.

## How it works

```
You 🎤 → browser transcribes (free) → ✔ send
      → server → cheap model w/ tool-calling → add/update/delete tasks
      → reply + refreshed board
```

The server (`server.js`) exposes the task board as **tools** (`add_task`,
`update_task`, `delete_task`, `list_tasks`, `clear_completed`, `set_focus`)
and runs an agent loop: the browser sends its tasks + focus note with each
message, the model decides which tools to call, the server applies them to
that state and returns it, and the browser persists the result. One spoken
sentence can trigger many actions.

You can also use the board directly — quick-add box, checkboxes, delete
buttons — no AI required.
