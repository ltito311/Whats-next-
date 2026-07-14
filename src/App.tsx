import { useEffect, useState, type ReactElement } from 'react';
import { applyTheme, useSettings } from './settings';
import { initPipeline } from './services/pipeline';
import { CheckSquareIcon, GearIcon, MicIcon, NotesIcon, SparklesIcon } from './components/Icons';
import CaptureView from './views/CaptureView';
import TasksView from './views/TasksView';
import MindView from './views/MindView';
import NotesView from './views/NotesView';
import SettingsView from './views/SettingsView';

type Tab = 'capture' | 'tasks' | 'mind' | 'notes' | 'settings';

const TABS: { id: Tab; label: string; icon: (props: { size?: number }) => ReactElement }[] = [
  { id: 'capture', label: 'Capture', icon: MicIcon },
  { id: 'tasks', label: 'Tasks', icon: CheckSquareIcon },
  { id: 'mind', label: 'Mind', icon: SparklesIcon },
  { id: 'notes', label: 'Notes', icon: NotesIcon },
  { id: 'settings', label: 'Settings', icon: GearIcon }
];

function tabFromHash(): Tab {
  const h = location.hash.replace('#', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'capture';
}

export default function App() {
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    initPipeline();
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
  };

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">
          What's <em>Next</em>
        </div>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => go(id)}>
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <main className="view fade-in" key={tab}>
        {tab === 'capture' && <CaptureView />}
        {tab === 'tasks' && <TasksView />}
        {tab === 'mind' && <MindView />}
        {tab === 'notes' && <NotesView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
