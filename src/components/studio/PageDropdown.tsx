import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { derivePageEntries } from '@/utils/projectRoutes.js';

/**
 * PageDropdown — el selector de página del navbar (zona central), estilo
 * tipo navegador: nombre legible + ruta como dato secundario (pedido
 * explícito — antes era sólo "/ ⌄", correcto pero ilegible para un usuario
 * no técnico).
 *
 * Mismo dato y misma navegación que ya tenía `NavigatePanel.tsx` (ahora
 * borrado, ver QUEUE.md ítem 11): `derivePageEntries` deriva de los nombres
 * de archivo en src/pages/, la navegación real es
 * `postMessage({type:'navigate', path})` al iframe.
 */
export function PageDropdown({
  files,
  iframeRef,
  activeRoute,
  setActiveRoute,
  beforeNavigate,
}: {
  files: Map<string, string>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeRoute: string;
  setActiveRoute: (route: string) => void;
  beforeNavigate?: (proceed: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const entries = derivePageEntries(files);
  const active = entries.find((e) => e.route === activeRoute) ?? entries.find((e) => e.route === '/');

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const navigate = (route: string) => {
    const doNavigate = () => {
      setActiveRoute(route);
      iframeRef.current?.contentWindow?.postMessage({ type: 'navigate', path: route }, '*');
    };
    if (beforeNavigate) beforeNavigate(doNavigate);
    else doNavigate();
    setOpen(false);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="wf-page"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className="wf-page-name">{active?.name ?? 'Inicio'}</span>
        <span className="wf-page-route">{active?.route ?? '/'}</span>
        <ChevronDown className="wf-caret" size={12} />
      </button>
      {open && (
        <div className="wf-menu" role="menu">
          {entries.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--ink-dim)' }}>
              No se encontraron páginas
            </div>
          ) : (
            entries.map((entry) => (
              <button key={entry.route} role="menuitem" onClick={() => navigate(entry.route)}>
                <span>{entry.name}</span>
                <span className="wf-menu-route">{entry.route}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
