import { useRef } from 'react';
import './coldStartOverlay.css';

interface ColdStartOverlayProps {
  /** Contenido real (spinner/texto/progreso/botón cancelar) — este componente sólo pone el fondo. */
  children: React.ReactNode;
}

const GRID_CELLS = 14 * 9;

/**
 * Pantalla de espera a pantalla completa, estilo "cold start" de Render
 * (referencia dada por Samuel, 2026-09-23): cuadrícula de recuadros con un
 * spotlight rojo que sigue al mouse. Reemplaza el spinner chico en los dos
 * momentos de espera real de StudioEngine.tsx: abrir un proyecto
 * (isLoading) y generar uno nuevo (showGeneratingOverlay). Deliberadamente
 * NO se aplicó al indicador "Compiling…" de la esquina (ese es un aviso
 * chico y frecuente tras cada edición, no una espera larga tipo cold-start
 * — ver QUEUE.md).
 *
 * El movimiento del mouse escribe las variables CSS directo al elemento
 * (sin useState) para no disparar un re-render de React en cada frame.
 */
export function ColdStartOverlay({ children }: ColdStartOverlayProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    gridRef.current?.style.setProperty('--cso-mx', `${x}%`);
    gridRef.current?.style.setProperty('--cso-my', `${y}%`);
  };

  return (
    <div className="cso-root" onMouseMove={handleMouseMove}>
      <div className="cso-grid" ref={gridRef} aria-hidden="true">
        {Array.from({ length: GRID_CELLS }).map((_, i) => (
          <span key={i} className="cso-cell" style={{ animationDelay: `${(i % 17) * 0.31}s` }} />
        ))}
      </div>
      <div className="cso-content">{children}</div>
    </div>
  );
}
