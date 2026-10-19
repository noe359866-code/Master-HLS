import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { LocalizedApp } from './App';
import { AppProvider } from './store';
import { registerServiceWorker, setupInstallPrompt } from './pwa';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encuentra el contenedor #root');

// PWA: service worker (app instalable y uso sin conexion).
registerServiceWorker();
setupInstallPrompt();

createRoot(container).render(
  <StrictMode>
    <AppProvider>
      <LocalizedApp />
    </AppProvider>
  </StrictMode>,
);
