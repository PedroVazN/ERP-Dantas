import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicOrderPage } from './pages/PublicOrderPage.tsx'

const path = typeof window !== 'undefined' ? window.location.pathname : ''
const isPublicOrder = path === '/pedido' || path.startsWith('/pedido/')

if ('serviceWorker' in navigator && !isPublicOrder) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicOrder ? <PublicOrderPage /> : <App />}
  </StrictMode>,
)
