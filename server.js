/**
 * What's Next — task app with a built-in multimodal (voice + text) agent.
 *
 * Zero dependencies. Run with:  node server.js
 * Requires Node 18+ (built-in fetch).
 *
 * The agent talks to any OpenAI-compatible API (DeepSeek, GLM/Zhipu, Kimi/
 * Moonshot, Qwen, or even OpenAI/Anthropic-via-gateway). Configure in .env.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// ---------- .env loader (no dotenv dependency) ----------
function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const PORT = process.env.PORT || 3000;

// Provider presets — all OpenAI-compatible chat completion APIs.
const PRESETS = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  glm:      { baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  kimi:     { baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2-0905-preview" },
  qwen:     { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
};

const preset = PRESETS[(process.env.PROVIDER || "deepseek").toLowerCase()] || PRESETS.deepseek;
const BASE_URL = process.env.PROVIDER_BASE_URL || preset.baseUrl;
const MODEL = process.env.PROVIDER_MODEL || preset.model;
const API_KEY = process.env.PROVIDER_API_KEY || "";

// ---------- Task store (JSON file) ----------
const DATA_DIR = path.join(__dirname, "data");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");

function loadTasks() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTasks(tasks) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

let nextId = loadTasks().reduce((m, t) => Math.max(m, t.id), 0) + 1;

// ---------- Agent tools ----------
const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List all tasks with their ids, titles, status, priority and due dates.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a new task to the board.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short task title" },
          notes: { type: "string", description: "Optional details" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Defaults to medium" },
          due: { type: "string", description: "Optional due date, ISO format YYYY-MM-DD" },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update a task: rename it, change notes/priority/due date, or mark it done / not done.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "integer", description: "Task id" },
          title: { type: "string" },
          notes: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          due: { type: "string", description: "ISO date YYYY-MM-DD, or empty string to clear" },
          done: { type: "boolean" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task permanently by id.",
      parameters: {
        type: "object",
        properties: { id: { type: "integer", description: "Task id" } },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_completed",
      description: "Delete all tasks that are marked done.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

function runTool(name, args) {
  const tasks = loadTasks();
  switch (name) {
    case "list_tasks":
      return { tasks };
    case "add_task": {
      const task = {
        id: nextId++,
        title: String(args.title || "").trim() || "Untitled",
        notes: args.notes || "",
        priority: ["low", "medium", "high"].includes(args.priority) ? args.priority : "medium",
        due: args.due || null,
        done: false,
        createdAt: new Date().toISOString(),
      };
      tasks.push(task);
      saveTasks(tasks);
      return { created: task };
    }
    case "update_task": {
      const task = tasks.find((t) => t.id === args.id);
      if (!task) return { error: `No task with id ${args.id}` };
      if (typeof args.title === "string" && args.title.trim()) task.title = args.title.trim();
      if (typeof args.notes === "string") task.notes = args.notes;
      if (["low", "medium", "high"].includes(args.priority)) task.priority = args.priority;
      if (typeof args.due === "string") task.due = args.due || null;
      if (typeof args.done === "boolean") task.done = args.done;
      saveTasks(tasks);
      return { updated: task };
    }
    case "delete_task": {
      const idx = tasks.findIndex((t) => t.id === args.id);
      if (idx === -1) return { error: `No task with id ${args.id}` };
      const [removed] = tasks.splice(idx, 1);
      saveTasks(tasks);
      return { deleted: removed };
    }
    case "clear_completed": {
      const remaining = tasks.filter((t) => !t.done);
      const removedCount = tasks.length - remaining.length;
      saveTasks(remaining);
      return { removedCount };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------- Agent loop ----------
const TODAY = () => new Date().toISOString().slice(0, 10);

const PROMPTS = {
  // Fast, do-what-I-said mode.
  tasks: () => `You are the assistant inside "What's Next", a personal task management app.
You can manage the user's task board with the tools provided. Users often speak
their requests aloud (voice transcription), so messages may be rambly — extract
the intent and act on it. When the user asks for several things at once, make
all the tool calls needed. After acting, reply with a short, friendly summary of
what you did. Today's date is ${TODAY()}.`,

  // Thinking-partner mode.
  brainstorm: () => `You are a sharp, warm thinking partner inside "What's Next",
a personal task management app. The user talks to you in rambly voice notes to
untangle their day, their priorities, and their workflow. Your job:

1. LISTEN through the rambling and reflect back the 2-4 real threads you heard,
   in plain words. Naming the mess is half the value.
2. PUSH toward concrete: vague intentions ("be more efficient") become specific,
   scheduled, finishable actions ("block 9-11am tomorrow for X, phone in the
   other room"). Suggest timeboxes, an order of attack, and what to explicitly
   NOT do today.
3. COACH lightly on workflow: if you spot a recurring time sink or a pattern in
   what they describe, say so and suggest one fix at a time — not a lecture.
4. ASK at most one focused question per reply, and only when the answer would
   change your advice. Otherwise give your best recommendation and commit to it.
5. When a plan takes shape, offer to put it on the board. Only call the task
   tools once the user agrees ("yeah do that", "add those") — then create the
   tasks with sensible priorities and due dates and confirm briefly. You can
   call list_tasks anytime to ground advice in what's actually on their plate.

Keep replies conversational and reasonably short — this is a chat, not an
essay. No bullet-point walls unless laying out a day plan. Today's date is
${TODAY()}.`,
};

function systemPrompt(mode) {
  return (PROMPTS[mode] || PROMPTS.tasks)();
}

async function chatCompletion(messages) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOL_DEFS }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Provider returned ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

async function runAgent(history, mode) {
  const messages = [{ role: "system", content: systemPrompt(mode) }, ...history];
  const MAX_TURNS = 8;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const data = await chatCompletion(messages);
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error("Provider returned no message");

    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return msg.content || "(no response)";
    }

    for (const call of msg.tool_calls) {
      let args = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave args empty */
      }
      const result = runTool(call.function.name, args);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }
  return "I hit my tool-use limit for one message — the actions so far are applied. Ask me to continue if needed.";
}

// ---------- HTTP server ----------
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
      if (body.length > 1e6) reject(new Error("Body too large"));
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    // --- API routes ---
    if (url.pathname === "/api/tasks" && req.method === "GET") {
      return sendJSON(res, 200, { tasks: loadTasks() });
    }

    if (url.pathname === "/api/tasks" && req.method === "POST") {
      const { title, notes, priority, due } = JSON.parse(await readBody(req));
      return sendJSON(res, 200, runTool("add_task", { title, notes, priority, due }));
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "PATCH") {
      const id = parseInt(url.pathname.split("/")[3], 10);
      const patch = JSON.parse(await readBody(req));
      return sendJSON(res, 200, runTool("update_task", { ...patch, id }));
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "DELETE") {
      const id = parseInt(url.pathname.split("/")[3], 10);
      return sendJSON(res, 200, runTool("delete_task", { id }));
    }

    if (url.pathname === "/api/config" && req.method === "GET") {
      return sendJSON(res, 200, {
        model: MODEL,
        baseUrl: BASE_URL,
        hasKey: Boolean(API_KEY),
      });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      if (!API_KEY) {
        return sendJSON(res, 400, {
          error:
            "No API key configured. Copy .env.example to .env and set PROVIDER_API_KEY. " +
            "See the README for where to get a cheap (or free) key.",
        });
      }
      const { messages, mode } = JSON.parse(await readBody(req));
      if (!Array.isArray(messages) || messages.length === 0) {
        return sendJSON(res, 400, { error: "messages array required" });
      }
      const reply = await runAgent(messages, mode);
      return sendJSON(res, 200, { reply, tasks: loadTasks() });
    }

    // --- Static files ---
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    filePath = path.join(__dirname, "public", path.normalize(filePath).replace(/^(\.\.[/\\])+/, ""));
    if (!filePath.startsWith(path.join(__dirname, "public"))) {
      res.writeHead(403);
      return res.end("Forbidden");
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
      return res.end(fs.readFileSync(filePath));
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`What's Next running at http://localhost:${PORT}`);
  console.log(`Model: ${MODEL} @ ${BASE_URL}`);
  console.log(API_KEY ? "API key: configured ✓" : "API key: MISSING — chat disabled until you set PROVIDER_API_KEY in .env");
});
