import Dexie, { type Table } from 'dexie';
import type { Dump, Task, Note, Goal, ChatMsg } from './types';

class WhatsNextDB extends Dexie {
  dumps!: Table<Dump, number>;
  tasks!: Table<Task, number>;
  notes!: Table<Note, number>;
  goals!: Table<Goal, number>;
  chat!: Table<ChatMsg, number>;

  constructor() {
    super('whats-next');
    this.version(1).stores({
      dumps: '++id, createdAt, status',
      tasks: '++id, createdAt, status, goalId, dumpId',
      notes: '++id, createdAt, kind, theme, dumpId',
      goals: '++id, createdAt'
    });
    this.version(2).stores({
      chat: '++id, createdAt'
    });
  }
}

export const db = new WhatsNextDB();

export async function exportAllData(): Promise<string> {
  const [dumps, tasks, notes, goals, chat] = await Promise.all([
    db.dumps.toArray(),
    db.tasks.toArray(),
    db.notes.toArray(),
    db.goals.toArray(),
    db.chat.toArray()
  ]);
  // Audio blobs are omitted from the JSON export; transcripts carry the content.
  const dumpsLite = dumps.map(({ audio, ...rest }) => rest);
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), dumps: dumpsLite, tasks, notes, goals, chat },
    null,
    2
  );
}

export async function wipeAllData(): Promise<void> {
  await Promise.all([
    db.dumps.clear(),
    db.tasks.clear(),
    db.notes.clear(),
    db.goals.clear(),
    db.chat.clear()
  ]);
}
