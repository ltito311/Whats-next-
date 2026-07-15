import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/global.css';

registerSW({ immediate: true });

async function bootstrap() {
  if (import.meta.env.VITE_DEMO === '1') {
    const { seedDemo } = await import('./demo/seed');
    await seedDemo();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
