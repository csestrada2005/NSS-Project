import type { RefObject } from 'react';

// ---------------------------------------------------------------------------
// NavigatePanel — project route map rendered inside CommandModal.
//
// Extraído desde StudioEngine.tsx a nivel de módulo. Antes se definía inline en
// el cuerpo de StudioEngine (identidad nueva en cada re-render → remount). Como
// componente module-level la identidad es estable. Lo que antes tomaba por
// closure (files, iframeRef y el estado activeRoute del padre) ahora llega como
// props explícitas; la lógica se mueve verbatim.
// ---------------------------------------------------------------------------

interface NavigatePanelProps {
  files: Map<string, string>;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  activeRoute: string;
  setActiveRoute: (route: string) => void;
}

export function NavigatePanel({
  files,
  iframeRef,
  activeRoute,
  setActiveRoute,
}: NavigatePanelProps) {
  const pageFiles = Array.from(files.keys()).filter(path =>
    path.startsWith('src/pages/') &&
    (path.endsWith('.tsx') || path.endsWith('.jsx'))
  );

  const routes = pageFiles.map(path => {
    const name = path.replace('src/pages/', '').replace(/\.tsx?$/, '').replace(/\.jsx?$/, '');
    if (name === 'Index' || name === 'Home') return '/';
    return `/${name.toLowerCase()}`;
  }).sort((a, b) => a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b));

  const handleNavigate = (route: string) => {
    setActiveRoute(route);
    iframeRef.current?.contentWindow?.postMessage({ type: 'navigate', path: route }, '*');
  };

  return (
    <div className="flex flex-col w-full h-full bg-background">
      <div className="p-4 border-b border-border bg-card shrink-0">
        <h3 className="text-sm font-medium text-foreground mb-1">Project Map</h3>
        <p className="text-xs text-muted-foreground">Select a route to navigate the preview.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {routes.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 text-center">No routes found</div>
        ) : (
          routes.map(route => {
            const isActive = activeRoute === route;
            return (
              <button
                key={route}
                onClick={() => handleNavigate(route)}
                className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm transition-colors text-left ${isActive ? 'bg-primary/10 border border-primary/30 text-primary' : 'text-foreground hover:bg-accent border border-transparent'}`}
              >
                <code className={`text-xs px-1.5 py-0.5 rounded ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted'}`}>{route}</code>
                {isActive && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
