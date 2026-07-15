import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Goal, Task } from '../types';
import { PRIORITY_RANK } from '../types';
import { GOAL_COLORS } from '../utils';
import { PlusIcon, TargetIcon, TrashIcon } from '../components/Icons';
import TaskItem from '../components/TaskItem';

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      b.revenueImpact - a.revenueImpact ||
      a.createdAt - b.createdAt
  );
}

export default function TasksView() {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const goals = useLiveQuery(() => db.goals.toArray(), []);

  const [goalFilter, setGoalFilter] = useState<number | 'all'>('all');
  const [quickTitle, setQuickTitle] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);

  const activeGoals = (goals ?? []).filter((g) => !g.archived);
  const goalById = useMemo(
    () => new Map(activeGoals.map((g) => [g.id!, g])),
    [activeGoals]
  );

  const filtered = useMemo(() => {
    const all = tasks ?? [];
    return goalFilter === 'all' ? all : all.filter((t) => t.goalId === goalFilter);
  }, [tasks, goalFilter]);

  const today = sortTasks(filtered.filter((t) => t.status === 'today'));
  const inbox = sortTasks(filtered.filter((t) => t.status === 'inbox'));
  const done = filtered
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const doneToday = done.filter(
    (t) => t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()
  ).length;
  const planTotal = today.length + doneToday;
  const planPct = planTotal === 0 ? 0 : Math.round((doneToday / planTotal) * 100);

  async function quickAdd() {
    const title = quickTitle.trim();
    if (!title) return;
    await db.tasks.add({
      title,
      status: 'today',
      priority: 'medium',
      revenueImpact: 0,
      goalId: goalFilter === 'all' ? undefined : goalFilter,
      createdAt: Date.now()
    });
    setQuickTitle('');
  }

  async function addGoal() {
    const title = goalTitle.trim();
    if (!title) return;
    await db.goals.add({ title, color: goalColor, createdAt: Date.now() });
    setGoalTitle('');
    setShowGoalForm(false);
  }

  async function removeGoal(goal: Goal) {
    if (!confirm(`Delete goal "${goal.title}"? Its tasks stay, just unlinked.`)) return;
    await db.tasks.where('goalId').equals(goal.id!).modify({ goalId: undefined });
    await db.goals.delete(goal.id!);
    if (goalFilter === goal.id) setGoalFilter('all');
  }

  async function clearDone() {
    if (!confirm(`Clear ${done.length} completed task${done.length === 1 ? '' : 's'}?`)) return;
    await db.tasks.bulkDelete(done.map((t) => t.id!));
  }

  const taskCountByGoal = useMemo(() => {
    const map = new Map<number, number>();
    (tasks ?? []).forEach((t) => {
      if (t.goalId != null && t.status !== 'done') {
        map.set(t.goalId, (map.get(t.goalId) ?? 0) + 1);
      }
    });
    return map;
  }, [tasks]);

  return (
    <>
      <h1 className="view-title">Tasks</h1>
      <p className="view-sub">Extracted from your dumps, sorted by what moves the needle.</p>

      <div className="chip-row">
        <button
          className={`chip ${goalFilter === 'all' ? 'active' : ''}`}
          onClick={() => setGoalFilter('all')}
        >
          All
        </button>
        {activeGoals.map((g) => (
          <button
            key={g.id}
            className={`chip ${goalFilter === g.id ? 'active' : ''}`}
            onClick={() => setGoalFilter(g.id!)}
          >
            <span className="goal-dot" style={{ background: g.color }} />
            {g.title}
          </button>
        ))}
        <button className="chip" onClick={() => setShowGoalForm((v) => !v)}>
          <PlusIcon size={13} /> Goal
        </button>
      </div>

      {showGoalForm && (
        <div className="card fade-in" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
            <TargetIcon size={18} /> New goal
          </div>
          <div className="goal-form">
            <input
              placeholder='e.g. "Grow AI Driver ROI revenue"'
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGoal()}
            />
            <div className="color-row">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  className={`color-swatch ${goalColor === c ? 'selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setGoalColor(c)}
                  aria-label={`color ${c}`}
                />
              ))}
            </div>
            <button className="btn" onClick={addGoal} disabled={!goalTitle.trim()}>
              Add goal
            </button>
            {activeGoals.length > 0 && (
              <div>
                {activeGoals.map((g) => (
                  <div className="goal-row" key={g.id}>
                    <span className="goal-dot" style={{ background: g.color }} />
                    <span>{g.title}</span>
                    <span className="count">{taskCountByGoal.get(g.id!) ?? 0} open</span>
                    <button className="icon-btn" onClick={() => void removeGoal(g)}>
                      <TrashIcon size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="section-label">
        <span>Today's plan</span>
        {planTotal > 0 && (
          <span>
            {doneToday}/{planTotal} · {planPct}%
          </span>
        )}
      </div>
      {planTotal > 0 && (
        <div className="progress-track" style={{ marginBottom: 12 }}>
          <div className="progress-fill" style={{ width: `${planPct}%` }} />
        </div>
      )}
      <div className="quick-add">
        <input
          placeholder="Quick add a task for today…"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && quickAdd()}
        />
        <button className="btn" onClick={quickAdd} disabled={!quickTitle.trim()}>
          <PlusIcon size={16} />
        </button>
      </div>
      {today.length === 0 ? (
        <div className="empty">Nothing planned yet — promote tasks from the inbox below.</div>
      ) : (
        today.map((t) => <TaskItem key={t.id} task={t} goal={t.goalId ? goalById.get(t.goalId) : undefined} />)
      )}

      <div className="section-label">
        <span>Inbox</span>
        <span>{inbox.length}</span>
      </div>
      {inbox.length === 0 ? (
        <div className="empty">Inbox zero. Record a dump and new tasks land here.</div>
      ) : (
        inbox.map((t) => <TaskItem key={t.id} task={t} goal={t.goalId ? goalById.get(t.goalId) : undefined} />)
      )}

      {done.length > 0 && (
        <>
          <div className="section-label">
            <button
              style={{ color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
              onClick={() => setShowDone((v) => !v)}
            >
              Done ({done.length}) {showDone ? '▾' : '▸'}
            </button>
            <button
              style={{ color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit' }}
              onClick={clearDone}
            >
              Clear
            </button>
          </div>
          {showDone &&
            done.map((t) => (
              <TaskItem key={t.id} task={t} goal={t.goalId ? goalById.get(t.goalId) : undefined} />
            ))}
        </>
      )}
    </>
  );
}
