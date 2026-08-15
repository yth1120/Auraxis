import React from 'react';
import ReactDOM from 'react-dom/client';
import { IconContext } from '@/components/common/icons';
import App from './App';
import './styles/app.css';
import 'allotment/dist/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Global icon defaults. size:'1em' is REQUIRED — Phosphor has no built-in
        size default, so without it icons render with no width/height and balloon
        to intrinsic size. 1em makes every icon scale to its surrounding text. */}
    <IconContext.Provider value={{ size: '1em', strokeWidth: 1.5 }}>
      <App />
    </IconContext.Provider>
  </React.StrictMode>,
);
