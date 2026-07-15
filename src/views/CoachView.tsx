import { useEffect, useRef, useState } from 'react';
import { db } from '../db';
import { chat } from '../services/llm';
import { extractFromTranscript } from '../services/llm';
import { getSettings, useSettings } from '../settings';
import { PRIORITY_RANK, type ChatMsg, type Goal, type Task } from '../types';
import { MicIcon, StopIcon, SunIcon, TrashIcon, SparklesIcon } from '../components/Icons';

/** How many past messages travel with each request (token control). */
const HISTORY_WINDOW = 40;

const PLAN_PROMPT =
  'Plan my day. Look at my open tasks and goals, give me a concrete order of ' +
  'attack with rough timeboxes, and name one thing I should consciously skip today.';

function fmtTask(t: Task): string {
  const bits = [t.title, `priority:${t.priority}`, `revenue:${'$'.repeat(t.revenueImpact) || '-'}`];
  if (t.due) bits.push(`due:${t.due}`);
  return `- ${bits.join(' · ')}`;
}

async function buildSystemPrompt(): Promise<string> {
  const settings = getSettings();
  const [goals, openTasks] = await Promise.all([
    db.goals.toArray().then((gs) => gs.filter((g) => !g.archived)),
    db.tasks.where('status').anyOf('inbox', 'today').toArray()
  ]);
  const topTasks = openTasks
    .sort(
      (a, b) =>
        b.revenueImpact - a.revenueImpact || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    )
    .slice(0, 25);

  const goalLines = goals.length
    ? goals.map((g: Goal) => `- ${g.title}${g.description ? ` — ${g.description}` : ''}`).join('\n')
    : '(none defined yet)';

  return `You are the user's sharp, warm thinking partner inside "What's Next",
their voice-first task app. They ramble — often via voice — to untangle their
day, priorities, and workflow. Your job:

1. LISTEN through the rambling and reflect back the 2-4 real threads you heard.
2. PUSH toward concrete: vague intentions become specific, timeboxed, finishable
   actions. Suggest an order of attack and what to explicitly NOT do today.
3. COACH lightly: if you spot a recurring time sink, say so — one fix at a time.
4. ASK at most one focused question per reply, only if the answer would change
   your advice. Otherwise commit to a recommendation.
5. When asked to plan the day, rank work that moves their goals and revenue
   first, then by priority and due date. Timebox each item.
6. When a plan or new to-dos take shape and the user agrees, remind them to tap
   "Add to board" under your message so the tasks get extracted onto their board.

Keep replies conversational and short — this is a chat, not an essay.
Today's date is ${new Date().toISOString().slice(0, 10)}.

Their goals:
${goalLines}
${settings.goalContext ? `\nAbout them:\n${settings.goalContext}\n` : ''}
Their current open tasks (top ${topTasks.length} of ${openTasks.length}):
${topTasks.map(fmtTask).join('\n') || '(board is empty)'}`;
}

export default function CoachView() {
  const settings = useSettings();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extractNote, setExtractNote] = useState('');
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const baseTextRef = useRef('');

  const hasKey = settings.llmApiKey.trim().length > 0;

  useEffect(() => {
    void db.chat.orderBy('createdAt').toArray().then(setMessages);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    stopListening();
    setInput('');
    setError('');
    setExtractNote('');

    const userMsg: ChatMsg = { role: 'user', content: text, createdAt: Date.now() };
    userMsg.id = await db.chat.add(userMsg);
    const history = [...messages, userMsg];
    setMessages(history);
    setBusy(true);

    try {
      const system = await buildSystemPrompt();
      const reply = await chat(
        [
          { role: 'system', content: system },
          ...history.slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, content: m.content }))
        ],
        getSettings()
      );
      const aiMsg: ChatMsg = { role: 'assistant', content: reply, createdAt: Date.now() };
      aiMsg.id = await db.chat.add(aiMsg);
      setMessages((cur) => [...cur, aiMsg]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  /** Run the existing extraction pipeline over the recent conversation. */
  async function addToBoard() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const tail = messages.slice(-12);
      const convo = tail
        .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
        .join('\n\n');
      const goals = (await db.goals.toArray()).filter((g) => !g.archived);
      const extraction = await extractFromTranscript(convo, goals, getSettings());
      const now = Date.now();
      await db.transaction('rw', db.tasks, db.notes, async () => {
        await db.tasks.bulkAdd(
          extraction.tasks.map((t) => ({
            goalId: t.goalId,
            title: t.title,
            detail: t.detail,
            status: 'inbox' as const,
            priority: t.priority,
            revenueImpact: t.revenueImpact,
            due: t.due,
            createdAt: now
          }))
        );
        await db.notes.bulkAdd(
          [...extraction.notes.map((n) => ({ ...n, kind: 'note' as const })),
           ...extraction.ideas.map((n) => ({ ...n, kind: 'idea' as const }))].map((n) => ({
            kind: n.kind,
            title: n.title,
            content: n.content,
            theme: n.theme,
            createdAt: now
          }))
        );
      });
      const parts = [];
      if (extraction.tasks.length) parts.push(`${extraction.tasks.length} task${extraction.tasks.length > 1 ? 's' : ''}`);
      if (extraction.notes.length) parts.push(`${extraction.notes.length} note${extraction.notes.length > 1 ? 's' : ''}`);
      if (extraction.ideas.length) parts.push(`${extraction.ideas.length} idea${extraction.ideas.length > 1 ? 's' : ''}`);
      setExtractNote(parts.length ? `Added ${parts.join(', ')} to your board ✓` : 'Nothing actionable found in the recent chat.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function clearChat() {
    if (!confirm('Clear the whole conversation? Tasks and notes stay.')) return;
    await db.chat.clear();
    setMessages([]);
    setExtractNote('');
  }

  // ---- Voice input: live transcription via the browser's speech engine ----
  const SR: any =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  function startListening() {
    if (!SR || listening) return;
    const rec = new SR();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';
    baseTextRef.current = input ? input + ' ' : '';
    rec.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      setInput((baseTextRef.current + text).trimStart());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      if (recRef.current === rec && listening) {
        try { rec.start(); } catch { setListening(false); }
      }
    };
    setListening(true);
    rec.start();
  }

  function stopListening() {
    const rec = recRef.current;
    recRef.current = null;
    setListening(false);
    try { rec?.stop(); } catch { /* already stopped */ }
  }

  const lastIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'assistant';

  return (
    <div className="coach">
      <div className="coach-head">
        <div>
          <div className="view-title">Coach</div>
          <div className="view-sub">Ramble, untangle, plan — then put it on the board.</div>
        </div>
        {messages.length > 0 && (
          <button className="icon-btn" title="Clear conversation" onClick={() => void clearChat()}>
            <TrashIcon size={18} />
          </button>
        )}
      </div>

      {!hasKey && (
        <div className="card coach-banner">
          Add an AI API key in <a href="#settings">Settings → AI brain</a> to chat.
        </div>
      )}

      <div className="coach-log" ref={logRef}>
        {messages.length === 0 && (
          <div className="coach-msg assistant">
            Hey — I'm your thinking partner. Ramble about your day, your mess, your
            plans. I'll pull out the threads, help you decide what actually matters,
            and when we land on a plan you can add it straight to your board. Hit ☀️
            for a morning kickoff.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id ?? m.createdAt} className={`coach-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="coach-msg assistant thinking">Thinking…</div>}
        {lastIsAssistant && !busy && (
          <div className="coach-actions">
            <button className="btn small ghost" onClick={() => void addToBoard()}>
              <SparklesIcon size={14} /> Add to board
            </button>
            {extractNote && <span className="coach-note">{extractNote}</span>}
          </div>
        )}
      </div>

      {error && <div className="card coach-banner error">{error}</div>}

      <div className="coach-input">
        <button
          className="icon-btn"
          title="Morning kickoff — plan my day"
          disabled={busy || !hasKey}
          onClick={() => void send(PLAN_PROMPT)}
        >
          <SunIcon size={19} />
        </button>
        {SR && (
          <button
            className={`icon-btn ${listening ? 'recording' : ''}`}
            title={listening ? 'Stop listening' : 'Speak — transcribes live'}
            disabled={!hasKey}
            onClick={() => (listening ? stopListening() : startListening())}
          >
            {listening ? <StopIcon size={19} /> : <MicIcon size={19} />}
          </button>
        )}
        <textarea
          rows={1}
          value={input}
          placeholder={listening ? 'Listening…' : "What's on your mind?"}
          disabled={!hasKey}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn coach-send" disabled={busy || !hasKey || !input.trim()} onClick={() => void send()}>
          Send
        </button>
      </div>
    </div>
  );
}
