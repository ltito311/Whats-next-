import type { AppSettings } from '../settings';
import type { Goal, Priority } from '../types';
import { PRIORITIES } from '../types';

export interface ExtractedTask {
  title: string;
  detail?: string;
  priority: Priority;
  revenueImpact: number;
  goalId?: number;
  due?: string;
}

export interface ExtractedNote {
  title: string;
  content: string;
  theme: string;
}

export interface Extraction {
  title: string;
  summary: string;
  tasks: ExtractedTask[];
  notes: ExtractedNote[];
  ideas: ExtractedNote[];
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(messages: ChatMessage[], settings: AppSettings): Promise<string> {
  const base = settings.llmBaseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.llmApiKey}`,
      // OpenRouter attribution headers; harmless on other providers.
      'HTTP-Referer': 'https://github.com/ltito311/whats-next-',
      'X-Title': "What's Next"
    },
    body: JSON.stringify({
      model: settings.llmModel,
      messages,
      temperature: 0.3
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('LLM returned an unexpected response shape.');
  return text;
}

function buildSystemPrompt(goals: Goal[], goalContext: string): string {
  const goalLines = goals.length
    ? goals.map((g) => `- id ${g.id}: ${g.title}${g.description ? ` — ${g.description}` : ''}`).join('\n')
    : '(none defined yet)';
  return `You turn rambling, unstructured voice-note transcripts into clean, structured output.

The speaker is a founder/operator. Their goals:
${goalLines}
${goalContext ? `\nExtra context about them:\n${goalContext}\n` : ''}
Extract from the transcript:
1. "tasks": concrete, actionable next steps. Rewrite them as short imperative titles ("Email supplier about pricing", not "he was thinking about maybe emailing"). Set:
   - "priority": one of "urgent" | "high" | "medium" | "low"
   - "revenue_impact": 0-3 (3 = directly generates revenue, 0 = no revenue connection)
   - "goal_id": the numeric id of the matching goal above, or null
   - "due": ISO date "YYYY-MM-DD" only when the speaker gave a real time reference, else null
   - "detail": one short sentence of context, or null
2. "notes": factual observations, decisions, or things to remember that are NOT actionable.
3. "ideas": creative sparks, product/business ideas, "what if" thinking.
Both notes and ideas need a "theme": a short lowercase 1-2 word topic label (e.g. "marketing", "pricing", "app idea"). Reuse the same theme wording for related items so they cluster.

Also produce:
- "title": a 3-6 word title for the whole dump
- "summary": 1-2 sentences capturing the gist

Do not invent content that is not in the transcript. If a category is empty, return an empty array.
Respond with ONLY a JSON object, no markdown fences, in exactly this shape:
{"title": "...", "summary": "...", "tasks": [{"title": "...", "detail": null, "priority": "medium", "revenue_impact": 0, "goal_id": null, "due": null}], "notes": [{"title": "...", "content": "...", "theme": "..."}], "ideas": [{"title": "...", "content": "...", "theme": "..."}]}`;
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find JSON in the model response.');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v.trim() : fallback;
}

function normalizeNotes(raw: unknown): ExtractedNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((n: any) => ({
      title: asString(n?.title),
      content: asString(n?.content, asString(n?.title)),
      theme: asString(n?.theme, 'misc').toLowerCase()
    }))
    .filter((n) => n.title || n.content);
}

export async function extractFromTranscript(
  transcript: string,
  goals: Goal[],
  settings: AppSettings
): Promise<Extraction> {
  const raw = await chat(
    [
      { role: 'system', content: buildSystemPrompt(goals, settings.goalContext) },
      { role: 'user', content: `Transcript:\n"""\n${transcript}\n"""` }
    ],
    settings
  );
  const data: any = parseJsonLoose(raw);
  const goalIds = new Set(goals.map((g) => g.id));

  const tasks: ExtractedTask[] = Array.isArray(data?.tasks)
    ? data.tasks
        .map((t: any): ExtractedTask => {
          const priority: Priority = PRIORITIES.includes(t?.priority) ? t.priority : 'medium';
          const impact = Number(t?.revenue_impact);
          const goalId = Number(t?.goal_id);
          const due = asString(t?.due);
          return {
            title: asString(t?.title),
            detail: asString(t?.detail) || undefined,
            priority,
            revenueImpact: Number.isFinite(impact) ? Math.min(3, Math.max(0, Math.round(impact))) : 0,
            goalId: goalIds.has(goalId) ? goalId : undefined,
            due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined
          };
        })
        .filter((t: ExtractedTask) => t.title)
    : [];

  return {
    title: asString(data?.title, 'Brain dump'),
    summary: asString(data?.summary),
    tasks,
    notes: normalizeNotes(data?.notes),
    ideas: normalizeNotes(data?.ideas)
  };
}

/** Small sanity-check call used by the Settings "Test" button. */
export async function testLlmConnection(settings: AppSettings): Promise<string> {
  const reply = await chat(
    [{ role: 'user', content: 'Reply with the single word: ok' }],
    settings
  );
  return reply.slice(0, 80);
}
