export type DumpStatus =
  | 'recorded'      // audio saved, waiting for transcription
  | 'transcribing'
  | 'transcribed'   // transcript ready, waiting for AI extraction
  | 'extracting'
  | 'processed'
  | 'error';

export interface Dump {
  id?: number;
  createdAt: number;
  /** seconds; 0 for typed dumps */
  duration: number;
  audio?: Blob;
  mimeType?: string;
  transcript?: string;
  title?: string;
  summary?: string;
  status: DumpStatus;
  error?: string;
}

export type TaskStatus = 'inbox' | 'today' | 'done';
export type Priority = 'urgent' | 'high' | 'medium' | 'low';

export interface Task {
  id?: number;
  dumpId?: number;
  goalId?: number;
  title: string;
  detail?: string;
  status: TaskStatus;
  priority: Priority;
  /** 0 = none … 3 = direct revenue impact */
  revenueImpact: number;
  due?: string;
  createdAt: number;
  completedAt?: number;
}

export type NoteKind = 'note' | 'idea';

export interface Note {
  id?: number;
  dumpId?: number;
  kind: NoteKind;
  title: string;
  content: string;
  /** short lowercase topic label used to cluster items in the Mind view */
  theme: string;
  createdAt: number;
}

export interface Goal {
  id?: number;
  title: string;
  description?: string;
  color: string;
  createdAt: number;
  archived?: boolean;
}

export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low'];

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};
