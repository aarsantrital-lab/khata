import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { captureInstallPrompt } from '@/lib/install'
import { syncManager } from '@/lib/sync'
import { applyTheme, getThemeChoice } from '@/lib/theme'

applyTheme(getThemeChoice())
captureInstallPrompt()
registerSW({ immediate: true })
// Ask the browser not to clear the offline database when the phone runs low on space.
void navigator.storage?.persist?.().catch(() => false)
syncManager.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
