import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { ViewModeProvider } from './contexts/ViewModeContext'
import { Toaster } from 'sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ViewModeProvider>
        <Toaster position="bottom-right" richColors />
        <App />
      </ViewModeProvider>
    </AuthProvider>
  </StrictMode>,
)
