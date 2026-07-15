// What's Next — frontend: task board + voice/text chat with the agent.

const taskList = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const quickAdd = document.getElementById("quick-add");
const quickAddInput = document.getElementById("quick-add-input");
const chatLog = document.getElementById("chat-log");
const chatText = document.getElementById("chat-text");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const micStatus = document.getElementById("mic-status");
const chatError = document.getElementById("chat-error");
const modelBadge = document.getElementById("model-badge");

// Conversation history sent to the agent (user/assistant turns only).
const history = [];

// ---------- Task board ----------
async function refreshTasks() {
  const res = await fetch("/api/tasks");
  const { tasks } = await res.json();
  renderTasks(tasks);
}

function renderTasks(tasks) {
  taskList.innerHTML = "";
  emptyState.hidden = tasks.length > 0;

  const sorted = [...tasks].sort((a, b) => a.done - b.done || b.id - a.id);
  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "task" + (t.done ? " done" : "");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = t.done;
    checkbox.addEventListener("change", async () => {
      await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: checkbox.checked }),
      });
      refreshTasks();
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
    del.addEventListener("click", async () => {
      await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      refreshTasks();
    });

    li.append(checkbox, body, pill, del);
    taskList.appendChild(li);
  }
}

quickAdd.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = quickAddInput.value.trim();
  if (!title) return;
  quickAddInput.value = "";
  await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  refreshTasks();
});

// ---------- Chat ----------
function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

function showError(text) {
  chatError.textContent = text;
  chatError.hidden = false;
}

async function sendMessage() {
  const text = chatText.value.trim();
  if (!text) return;

  stopListening();
  chatText.value = "";
  chatText.style.height = "auto";
  chatError.hidden = true;

  addMsg("user", text);
  history.push({ role: "user", content: text });

  const thinking = addMsg("assistant thinking", "Thinking…");
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    thinking.remove();

    if (!res.ok) {
      history.pop();
      showError(data.error || `Request failed (${res.status})`);
      return;
    }

    addMsg("assistant", data.reply);
    history.push({ role: "assistant", content: data.reply });
    if (data.tasks) renderTasks(data.tasks);
  } catch (err) {
    thinking.remove();
    history.pop();
    showError(`Could not reach the server: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener("click", sendMessage);
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

// ---------- Voice input (Web Speech API — free, in-browser) ----------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
let baseText = ""; // text already in the box before this recording session

if (!SpeechRecognition) {
  micBtn.disabled = true;
  micBtn.title = "Voice input needs Chrome, Edge, or Safari";
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

// ---------- Init ----------
fetch("/api/config")
  .then((r) => r.json())
  .then((cfg) => {
    modelBadge.textContent = cfg.model;
    modelBadge.title = cfg.baseUrl;
    if (!cfg.hasKey) {
      showError(
        "No API key set — chat is disabled. Copy .env.example to .env, add your PROVIDER_API_KEY, and restart the server. See README for where to get a cheap or free key."
      );
    }
  })
  .catch(() => {});

refreshTasks();
