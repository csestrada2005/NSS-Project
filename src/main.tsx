import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { ViewModeProvider } from './contexts/ViewModeContext'
import { Toaster } from 'sonner'
// PIEZA D — TEMPORAL (Cirugía 1): import por efecto secundario. MigrationRunner
// registra window.__forgeApplyMigration al cargarse, y sin una arista de import
// real el bundler lo elimina como código muerto (nadie más lo referencia
// todavía). Se retira junto con el disparador en Cirugía 2, cuando el botón de
// aprobación del modal importe MigrationRunner de verdad.
import './services/MigrationRunner'

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
