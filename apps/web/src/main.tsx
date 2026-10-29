import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Remove static fallback metadata tags from index.html once client-side React mounts,
// preventing duplicate <title> and <meta name="description"> in the rendered DOM.
if (typeof document !== 'undefined') {
  document.querySelectorAll('[data-static="true"]').forEach((el) => el.remove());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
