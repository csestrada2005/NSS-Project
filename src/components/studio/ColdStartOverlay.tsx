import { useCallback, useEffect, useRef } from 'react';
import './coldStartOverlay.css';

interface ColdStartOverlayProps {
  /** Contenido real (spinner/texto/progreso/botón cancelar) — este componente sólo pone el fondo. */
  children: React.ReactNode;
  /**
   * 0–1: fracción de celdas que quedan "encendidas" de forma persistente,
   * en el orden de `LIGHT_ORDER` — pensado para la generación de un
   * proyecto nuevo (pasos reales). Omitido (el caso de abrir un proyecto
   * existente, sin conteo de pasos que mostrar) → ninguna celda pre-encendida,
   * sólo la reactividad al mouse.
   */
  progress?: number;
}

const COLS = 14;
const ROWS = 9;
const GRID_CELLS = COLS * ROWS;

// Orden fijo (no Math.random real — tiene que ser el MISMO en cada carga, si
// no la animación "saltaría" cada vez que progress cambia y React re-renderiza)
// para que las celdas no se enciendan en una fila prolija de arriba a abajo
// (se ve mecánico) sino repartidas, como si la pantalla cobrara vida de a poco.
const LIGHT_ORDER: number[] = (() => {
  const arr = Array.from({ length: GRID_CELLS }, (_, i) => i);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
})();

/**
 * Pantalla de espera a pantalla completa (2026-09-23, v2 — Samuel: la v1 con
 * un solo spotlight sobre la cuadrícula "no acababa de encantar", quería algo
 * más interactivo). Ahora cada celda reacciona INDIVIDUALMENTE a qué tan
 * cerca está del mouse (estilo dock de macOS / teclado mecánico), en vez de
 * un único reflector suave. Reemplaza el spinner chico en los dos momentos
 * de espera real de StudioEngine.tsx: abrir un proyecto (isLoading) y
 * generar uno nuevo (showGeneratingOverlay) — deliberadamente NO en el
 * indicador "Compiling…" de la esquina (ver QUEUE.md).
 *
 * Perf: la posición de cada celda se mide una vez (mount + resize) y el
 * mousemove sólo escribe una variable CSS por celda directo al DOM
 * (`--cso-t`, 0–1 según distancia), sin pasar por React/setState — un solo
 * requestAnimationFrame por movimiento, nunca más de uno en vuelo.
 */
export function ColdStartOverlay({ children, progress }: ColdStartOverlayProps) {
  const cellRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const centersRef = useRef<{ x: number; y: number }[]>([]);
  const frameRef = useRef<number | null>(null);

  const measureCenters = useCallback(() => {
    centersRef.current = cellRefs.current.map((el) => {
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }, []);

  useEffect(() => {
    measureCenters();
    window.addEventListener('resize', measureCenters);
    return () => window.removeEventListener('resize', measureCenters);
  }, [measureCenters]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const mx = e.clientX;
    const my = e.clientY;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const radius = 170;
      centersRef.current.forEach((c, i) => {
        const el = cellRefs.current[i];
        if (!el) return;
        const d = Math.hypot(c.x - mx, c.y - my);
        const t = Math.max(0, 1 - d / radius);
        el.style.setProperty('--cso-t', t.toFixed(3));
      });
    });
  };

  const litCount = progress !== undefined ? Math.round(Math.min(1, Math.max(0, progress)) * GRID_CELLS) : 0;
  const litSet = litCount > 0 ? new Set(LIGHT_ORDER.slice(0, litCount)) : null;

  return (
    <div className="cso-root" onMouseMove={handleMouseMove}>
      <div className="cso-grid" aria-hidden="true">
        {Array.from({ length: GRID_CELLS }).map((_, i) => (
          <span
            key={i}
            ref={(el) => { cellRefs.current[i] = el; }}
            className={`cso-cell${litSet?.has(i) ? ' cso-lit' : ''}`}
            style={{ animationDelay: `${(i % 17) * 0.31}s` }}
          />
        ))}
      </div>
      <div className="cso-content">{children}</div>
    </div>
  );
}
