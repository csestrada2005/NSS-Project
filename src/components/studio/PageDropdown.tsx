import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ChevronDown } from 'lucide-react';
import { deriveProjectRoutes } from '@/utils/projectRoutes.js';

/**
 * PageDropdown — el dropdown "tipo navegador" del navbar nuevo (2026-09-20).
 *
 * Mismo dato y misma navegación que ya tenía `NavigatePanel.tsx` (route
 * derivado de los nombres de archivo en src/pages/, postMessage al iframe) —
 * no hace falta parsear <Route> de App.tsx, esa convención de nombre YA es
 * la fuente de verdad real que usa el generador. `NavigatePanel.tsx` quedó
 * sin uso tras este cambio (la pestaña "Navigate" de CommandModal se quitó,
 * promovida aquí) y se borró en vez de dejarlo muerto en el repo.
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
  const routes = deriveProjectRoutes(files);

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
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-accent"
        title="Páginas del proyecto"
      >
        <span className="max-w-[140px] truncate">{activeRoute || '/'}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 z-50 bg-card border border-border rounded-lg shadow-xl overflow-hidden py-1">
          {routes.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No se encontraron páginas</div>
          ) : (
            routes.map((route) => (
              <button
                key={route}
                onClick={() => navigate(route)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-mono text-left transition-colors ${
                  activeRoute === route ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                }`}
              >
                {route}
                {activeRoute === route && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
