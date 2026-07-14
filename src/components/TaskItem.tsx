import { db } from '../db';
import type { Goal, Task } from '../types';
import { TrashIcon } from './Icons';

export default function TaskItem({ task, goal }: { task: Task; goal?: Goal }) {
  const isDone = task.status === 'done';

  async function toggleDone() {
    await db.tasks.update(task.id!,
      isDone
        ? { status: 'inbox', completedAt: undefined }
        : { status: 'done', completedAt: Date.now() }
    );
  }

  async function toggleToday() {
    await db.tasks.update(task.id!, { status: task.status === 'today' ? 'inbox' : 'today' });
  }

  async function remove() {
    await db.tasks.delete(task.id!);
  }

  return (
    <div className="card task-item">
      <button className={`task-check ${isDone ? 'done' : ''}`} onClick={toggleDone} aria-label="toggle done">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4.5 4.5L19 7" />
        </svg>
      </button>
      <div className="task-main">
        <div className={`task-title ${isDone ? 'done' : ''}`}>{task.title}</div>
        {task.detail && !isDone && <div className="task-detail">{task.detail}</div>}
        <div className="task-meta">
          <span className={`pill ${task.priority}`}>{task.priority}</span>
          {task.revenueImpact > 0 && (
            <span className="pill revenue">{'$'.repeat(task.revenueImpact)}</span>
          )}
          {goal && (
            <span className="goal-tag">
              <span className="goal-dot" style={{ background: goal.color }} />
              {goal.title}
            </span>
          )}
          {task.due && (
            <span className="goal-tag">
              due {new Date(`${task.due}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
      <div className="task-actions">
        {!isDone && (
          <button className="icon-btn" onClick={toggleToday} title={task.status === 'today' ? 'Move to inbox' : 'Plan for today'}>
            {task.status === 'today' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 19V5M5 12l7-7 7 7" transform="rotate(180 12 12)" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        )}
        <button className="icon-btn" onClick={remove} title="Delete">
          <TrashIcon size={16} />
        </button>
      </div>
    </div>
  );
}
