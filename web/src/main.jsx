import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter';
import './styles.css';
import App from './App.jsx';
import { ToastProvider } from './toast.jsx';
import { ContextMenuProvider } from './contextmenu.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ContextMenuProvider>
          <App />
        </ContextMenuProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
