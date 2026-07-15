// What's Next — frontend: task board + voice/text chat with the agent.
// All data (tasks, chat history, focus note) persists in localStorage on
// this device, so redeploys of the server never wipe anything.

const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const quickAdd = document.getElementById("quick-add");
const quickAddInput = document.getElementById("quick-add-input");
const focusBanner = document.getElementById("focus-banner");
const chatLog = document.getElementById("chat-log");
const chatText = document.getElementById("chat-text");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const planBtn = document.getElementById("plan-btn");
const clearChatBtn = document.getElementById("clear-chat-btn");
const micStatus = document.getElementById("mic-status");
const chatError = document.getElementById("chat-error");
const modelBadge = document.getElementById("model-badge");

// ---------- Local persistence ----------
const store = {
  load(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
  save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  },
};

let tasks = store.load("wn.tasks", []);
let profile = store.load("wn.profile", { focus: "" });
let history = store.load("wn.history", []);

function persist() {
  store.save("wn.tasks", tasks);
  store.save("wn.profile", profile);
  store.save("wn.history", history);
}

// ---------- Mode toggle (⚡ Tasks vs 💭 Brainstorm) ----------
let mode = store.load("wn.mode", "tasks");
const modeTasksBtn = document.getElementById("mode-tasks");
const modeBrainstormBtn = document.getElementById("mode-brainstorm");

function setMode(next) {
  mode = next;
  store.save("wn.mode", mode);
  modeTasksBtn.classList.toggle("active", mode === "tasks");
  modeBrainstormBtn.classList.toggle("active", mode === "brainstorm");
  chatText.placeholder =
    mode === "brainstorm"
      ? "Ramble away — what's on your mind?"
      : "Message the assistant…";
}
modeTasksBtn.addEventListener("click", () => setMode("tasks"));
modeBrainstormBtn.addEventListener("click", () => setMode("brainstorm"));

// ---------- Task board ----------
function nextTaskId() {
  return tasks.reduce((m, t) => Math.max(m, t.id || 0), 0) + 1;
}

function renderFocus() {
  if (profile.focus) {
    focusBanner.textContent = `🎯 ${profile.focus}`;
    focusBanner.title = "Your standing priorities — tap to edit. The assistant uses this when planning your day.";
    focusBanner.hidden = false;
  } else {
    focusBanner.textContent = "🎯 Set your standing priorities (tap, or just tell the assistant)";
    focusBanner.title = "Tap to set what always comes first for you.";
    focusBanner.hidden = false;
  }
}

focusBanner.addEventListener("click", () => {
  const next = prompt("What kind of work always comes first for you?", profile.focus || "");
  if (next === null) return;
  profile.focus = next.trim();
  persist();
  renderFocus();
});

function renderTasks() {
  taskList.innerHTML = "";
  emptyState.hidden = tasks.length > 0;

  const sorted = [...tasks].sort((a, b) => a.done - b.done || b.id - a.id);
  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "task" + (t.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = t.done;
    checkbox.addEventListener("change", () => {
      t.done = checkbox.checked;
      persist();
      renderTasks();
    });

    const body = document.createElement("div");
    body.className = "task-body";
    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = t.title;
    body.appendChild(title);

    const metaParts = [];
    if (t.due) metaParts.push(`due ${t.due}`);
    if (t.notes) metaParts.push(t.notes);
    if (metaParts.length) {
      const meta = document.createElement("div");
      meta.className = "task-meta";
      meta.textContent = metaParts.join(" · ");
      body.appendChild(meta);
    }

    const pill = document.createElement("span");
    pill.className = `pill ${t.priority}`;
    pill.textContent = t.priority;

    const del = document.createElement("button");
    del.className = "delete-btn";
    del.textContent = "✕";
    del.title = "Delete task";
    del.addEventListener("click", () => {
      tasks = tasks.filter((x) => x.id !== t.id);
      persist();
      renderTasks();
    });

    li.append(checkbox, body, pill, del);
    taskList.appendChild(li);
  }
}

quickAdd.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = quickAddInput.value.trim();
  if (!title) return;
  quickAddInput.value = "";
  tasks.push({
    id: nextTaskId(),
    title,
    notes: "",
    priority: "medium",
    due: null,
    done: false,
    createdAt: new Date().toISOString(),
  });
  persist();
  renderTasks();
});

// ---------- Chat ----------
const WELCOME =
  "Hey! Two ways to use me: in ⚡ Tasks mode, tell me what to do — " +
  '"add buy groceries for tomorrow, high priority" — and I\'ll do it. ' +
  "Flip to 💭 Brainstorm to ramble about your day and turn it into a plan, " +
  "or hit ☀️ for a morning kickoff.";

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function renderChatLog() {
  chatLog.innerHTML = "";
  addMsg("assistant", WELCOME);
  for (const m of history) addMsg(m.role === "user" ? "user" : "assistant", m.content);
}

function showError(text) {
  chatError.textContent = text;
  chatError.hidden = false;
}

// Cap what we send so long-running histories don't blow up token costs.
const HISTORY_WINDOW = 40;

async function sendMessage(overrideText) {
  const text = (overrideText || chatText.value).trim();
  if (!text) return;

  stopListening();
  chatText.value = "";
  chatText.style.height = "auto";
  chatError.hidden = true;

  addMsg("user", text);
  history.push({ role: "user", content: text });
  persist();

  const thinking = addMsg("assistant thinking", "Thinking…");
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history.slice(-HISTORY_WINDOW),
        mode,
        tasks,
        profile,
      }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok) {
      history.pop();
      persist();
      showError(data.error || `Request failed (${res.status})`);
      return;
    }

    addMsg("assistant", data.reply);
    history.push({ role: "assistant", content: data.reply });
    if (Array.isArray(data.tasks)) tasks = data.tasks;
    if (data.profile && typeof data.profile === "object") profile = data.profile;
    persist();
    renderTasks();
    renderFocus();
  } catch (err) {
    thinking.remove();
    history.pop();
    persist();
    showError(`Could not reach the server: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", () => sendMessage());
chatText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});
chatText.addEventListener("input", () => {
  chatText.style.height = "auto";
  chatText.style.height = Math.min(chatText.scrollHeight, 120) + "px";
});

// ☀️ Morning kickoff — always runs in brainstorm mode.
planBtn.addEventListener("click", () => {
  setMode("brainstorm");
  sendMessage(
    "Plan my day. Look at my board and my standing priorities, give me a concrete order of attack with rough timeboxes, and tell me one thing to skip today."
  );
});

clearChatBtn.addEventListener("click", () => {
  if (!confirm("Clear the whole conversation? Your tasks and focus note stay.")) return;
  history = [];
  persist();
  renderChatLog();
});

// ---------- Voice input (Web Speech API — free, in-browser) ----------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let baseText = ""; // text already in the box before this recording session

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micBtn.title = "Voice input needs Chrome, Edge, or Safari. Tip: your phone keyboard's dictation mic works here too.";
} else {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";

  recognition.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = 0; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk;
      else interimText += chunk;
    }
    chatText.value = (baseText + finalText + interimText).trimStart();
    chatText.dispatchEvent(new Event("input"));
  };

  recognition.onerror = (event) => {
    if (event.error === "not-allowed") {
      showError("Microphone access was blocked. Allow it in your browser and try again.");
    }
    stopListening();
  };

  recognition.onend = () => {
    // Chrome stops recognition after silence; restart while user wants to keep talking.
    if (listening) recognition.start();
  };
}

function startListening() {
  if (!recognition || listening) return;
  baseText = chatText.value ? chatText.value + " " : "";
  listening = true;
  micBtn.classList.add("recording");
  micStatus.hidden = false;
  recognition.start();
}

function stopListening() {
  if (!recognition || !listening) return;
  listening = false;
  micBtn.classList.remove("recording");
  micStatus.hidden = true;
  recognition.stop();
}

micBtn.addEventListener("click", () => {
  listening ? stopListening() : startListening();
});

// ---------- PWA service worker (network-first: reopen = latest version) ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ---------- Init ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    modelBadge.textContent = cfg.model;
    modelBadge.title = cfg.baseUrl;
    if (!cfg.hasKey) {
      showError(
        "No API key set — chat is disabled. Set PROVIDER_API_KEY in .env (local) or in your host's environment settings, then restart. See README for where to get a cheap or free key."
      );
    }
  })
  .catch(() => {});

setMode(mode);
renderChatLog();
renderTasks();
renderFocus();
