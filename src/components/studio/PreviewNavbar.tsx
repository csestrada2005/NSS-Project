import type { RefObject } from 'react';
import { Menu, Eye, Edit3, Code, Settings, MessageSquare } from 'lucide-react';
import { PageDropdown } from './PageDropdown';
import { ViewportToggle } from './ViewportToggle';
import type { ViewportMode, PanelMode } from './types';
import './previewNavbar.css';

/**
 * PreviewNavbar — navbar superior persistente sobre el preview. Reescrito
 * 2026-09-21 sobre el HTML de referencia que pasó Samuel (título "Wyrd Forge
 * — navbar"), con dos correcciones deliberadas: el rojo oficial (#D62828, no
 * el #E54D5B pre-brandbook del HTML) y el bug de alineación del selector de
 * página (align-items:baseline mezclando texto+ícono → center). Ver
 * previewNavbar.css para el resto de las decisiones de diseño (tres zonas,
 * tres niveles de color, el rojo reservado sólo para Publicar).
 *
 * El menú hamburguesa (Back to Nebu / Version History / Export / Share /
 * Invite) se RELOCALIZÓ aquí desde su posición flotante vieja
 * (`absolute top-4 left-4`) — misma funcionalidad, ahora vive en la zona
 * izquierda del navbar en vez de un ícono suelto sobre el preview.
 *
 * "Preview"/"Editor" son la etiqueta nueva del toggle `editMode` de siempre
 * (interaction/visual) — el valor interno no cambió, sólo el texto: "Editor"
 * es más claro que "Visual" para quien no es desarrollador.
 *
 * El botón Chat abre el mismo modal flotante con blur de siempre (ítem 10) —
 * sustituye a `CommandBubble`, que ya no se monta (confirmado con Samuel: el
 * chat en sí no se tocó, sólo de dónde se dispara).
 */
export function PreviewNavbar({
  onOpenMenu,
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
  onPublish,
}: {
  onOpenMenu: () => void;
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
  onPublish: () => void;
}) {
  return (
    <div className="wf-navbar">
      <div className="wf-zone wf-left">
        <button type="button" className="wf-btn wf-icon-only" aria-label="Menú" onClick={onOpenMenu}>
          <Menu size={16} />
        </button>
        <div className="wf-divider" />
        <div className="wf-seg" role="group" aria-label="Modo">
          <button
            type="button"
            className="wf-btn"
            aria-pressed={panelMode === 'preview' && editMode === 'interaction'}
            onClick={onPreview}
          >
            <Eye size={15} />
            <span>Preview</span>
          </button>
          <button
            type="button"
            className="wf-btn"
            aria-pressed={panelMode === 'preview' && editMode === 'visual'}
            onClick={onVisual}
          >
            <Edit3 size={15} />
            <span>Editor</span>
          </button>
        </div>
      </div>

      <div className="wf-zone wf-center">
        <PageDropdown
          files={files}
          iframeRef={iframeRef}
          activeRoute={activeRoute}
          setActiveRoute={setActiveRoute}
          beforeNavigate={beforeNavigate}
        />
      </div>

      <div className="wf-zone wf-right">
        {panelMode === 'preview' && (
          <ViewportToggle mode={viewportMode} onChange={onViewportChange} />
        )}
        <div className="wf-divider" />
        <button
          type="button"
          className={`wf-btn ${panelMode === 'code' ? 'wf-active' : ''}`}
          onClick={onOpenCode}
        >
          <Code size={15} />
          <span>Código</span>
        </button>
        <button
          type="button"
          className={`wf-btn ${panelMode === 'settings' ? 'wf-active' : ''}`}
          onClick={onOpenSettings}
        >
          <Settings size={15} />
          <span>Ajustes</span>
        </button>
        <button type="button" className="wf-btn" onClick={onOpenChat}>
          <MessageSquare size={15} />
          <span>Chat</span>
        </button>
        <button type="button" className="wf-publish" onClick={onPublish}>
          Publicar
        </button>
      </div>
    </div>
  );
}
