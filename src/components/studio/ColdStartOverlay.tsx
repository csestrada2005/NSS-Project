import './coldStartOverlay.css';

interface ColdStartOverlayProps {
  /** Contenido real (spinner/texto/progreso/botón cancelar) — este componente sólo pone el fondo. */
  children: React.ReactNode;
  /**
   * 0–1: fracción de celdas que quedan "encendidas" de forma persistente,
   * en el orden de `LIGHT_ORDER` — pensado para la generación de un
   * proyecto nuevo (pasos reales). Omitido (el caso de abrir un proyecto
   * existente, sin conteo de pasos que mostrar) → ninguna celda pre-encendida.
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
 * Pantalla de espera a pantalla completa del Studio: cuadrícula de celdas que
 * "respiran" solas y se van encendiendo con el progreso real (`progress`).
 * La usan la carga de un proyecto y la generación de uno nuevo (vía
 * StudioProgressOverlay). La reacción de cada celda al mouse (v2,
 * 2026-09-23) se quitó el 2026-09-27 a pedido de Samuel: "es demasiado".
 */
export function ColdStartOverlay({ children, progress }: ColdStartOverlayProps) {
  const litCount = progress !== undefined ? Math.round(Math.min(1, Math.max(0, progress)) * GRID_CELLS) : 0;
  const litSet = litCount > 0 ? new Set(LIGHT_ORDER.slice(0, litCount)) : null;

  return (
    <div className="cso-root">
      <div className="cso-grid" aria-hidden="true">
        {Array.from({ length: GRID_CELLS }).map((_, i) => (
          <span
            key={i}
            className={`cso-cell${litSet?.has(i) ? ' cso-lit' : ''}`}
            style={{ animationDelay: `${(i % 17) * 0.31}s` }}
          />
        ))}
      </div>
      <div className="cso-content">{children}</div>
    </div>
  );
}
