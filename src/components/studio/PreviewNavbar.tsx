import type { RefObject } from 'react';
import { MousePointer2, Edit3, Code, Settings, MessageSquare } from 'lucide-react';
import { PageDropdown } from './PageDropdown';
import { ViewportToggle } from './ViewportToggle';

type ViewportMode = 'mobile' | 'tablet' | 'desktop';
type PanelMode = 'preview' | 'code' | 'settings';

/**
 * PreviewNavbar — navbar superior persistente, reemplaza la píldora flotante
 * (`absolute top-4 left-1/2 -translate-x-1/2`) que vivía sobre el preview.
 * Pedido de Samuel, bucket 5 ítem 3 (2026-09-20): un solo botón de viewport
 * (ya no 3 separados), dropdown de páginas tipo navegador, Código/Settings
 * como paneles in-place (reemplazan el preview, no flotan encima) y Chat
 * como la excepción — sigue abriendo el modal flotante con blur de hoy, a
 * propósito (confirmado con Samuel: el preview debe seguir viéndose detrás
 * del chat, no desaparecer).
 *
 * Los tres puntos a la izquierda son la única concesión a "chrome de
 * navegador" que Samuel pidió para el contenedor del preview — se decidió NO
 * duplicar una segunda barra de direcciones bajo ésta (el propio
 * PageDropdown ya cumple ese papel) para no gastar altura vertical en dos
 * barras que dicen lo mismo.
 */
export function PreviewNavbar({
  editMode,
  onPreview,
  onVisual,
  viewportMode,
  onViewportChange,
  files,
  iframeRef,
  activeRoute,
  setActiveRoute,
  beforeNavigate,
  panelMode,
  onOpenCode,
  onOpenSettings,
  onOpenChat,
}: {
  editMode: 'interaction' | 'visual';
  onPreview: () => void;
  onVisual: () => void;
  viewportMode: ViewportMode;
  onViewportChange: (mode: ViewportMode) => void;
  files: Map<string, string>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeRoute: string;
  setActiveRoute: (route: string) => void;
  beforeNavigate?: (proceed: () => void) => void;
  panelMode: PanelMode;
  onOpenCode: () => void;
  onOpenSettings: () => void;
  onOpenChat: () => void;
}) {
  return (
    <div className="relative z-30 flex items-center gap-2 px-3 py-2 border-b border-border bg-card shrink-0">
      {/* Puntos — ver nota de arriba, no es una barra de direcciones aparte. */}
      <div className="flex items-center gap-1.5 pr-1">
        <span className="w-2 h-2 rounded-full bg-muted" />
        <span className="w-2 h-2 rounded-full bg-muted" />
        <span className="w-2 h-2 rounded-full bg-muted" />
      </div>

      <div className="flex items-center gap-0.5 bg-background/50 border border-border rounded-md p-0.5">
        <button
          type="button"
          onClick={onPreview}
          title="Preview"
          className={`p-1.5 rounded transition-colors ${panelMode === 'preview' && editMode === 'interaction' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <MousePointer2 size={13} />
        </button>
        <button
          type="button"
          onClick={onVisual}
          title="Modo visual"
          className={`p-1.5 rounded transition-colors ${panelMode === 'preview' && editMode === 'visual' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Edit3 size={13} />
        </button>
      </div>

      <PageDropdown
        files={files}
        iframeRef={iframeRef}
        activeRoute={activeRoute}
        setActiveRoute={setActiveRoute}
        beforeNavigate={beforeNavigate}
      />

      {panelMode === 'preview' && (
        <ViewportToggle mode={viewportMode} onChange={onViewportChange} />
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenCode}
          title="Código"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${panelMode === 'code' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
        >
          <Code size={13} />
          Código
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${panelMode === 'settings' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
        >
          <Settings size={13} />
          Settings
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          title="Chat"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <MessageSquare size={13} />
          Chat
        </button>
      </div>
    </div>
  );
}
