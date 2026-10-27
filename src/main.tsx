import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { loadLang, useLang } from './core/i18n';
import './styles.css';

// The first screen waits for its dictionary (a small chunk) so it never flashes in English.
loadLang(useLang.getState().lang).finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
