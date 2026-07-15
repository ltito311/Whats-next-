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

## How it works

```
You 🎤 → browser transcribes (free) → ✔ send
      → server → cheap model w/ tool-calling → add/update/delete tasks
      → reply + refreshed board
```

The server (`server.js`) exposes the task board as **tools** (`add_task`,
`update_task`, `delete_task`, `list_tasks`, `clear_completed`) and runs an
agent loop: the model decides which tools to call, the server executes them
against `data/tasks.json`, and the model replies with a summary. One spoken
sentence can trigger many actions.

You can also use the board directly — quick-add box, checkboxes, delete
buttons — no AI required.
