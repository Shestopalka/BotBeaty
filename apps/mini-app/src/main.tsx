import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// tg.ready() та tg.expand() викликаються у App.tsx useEffect
// (після першого рендеру) щоб Telegram ховав loading screen
// тільки тоді, коли React вже відрендерив контент
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
