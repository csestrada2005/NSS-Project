import { useEffect, useState, type MutableRefObject } from 'react';
import { ColdStartOverlay } from './ColdStartOverlay';
import NebuLoader from '../brand/NebuLoader';

/**
 * Pantalla de carga de un proyecto existente, con barra de progreso por
 * ETAPAS REALES (2026-09-27, pedido de Samuel):
 *   download → acceso + descarga de forge_files (una sola petición, sin
 *              avance interno) — banda 0–60 %
 *   compile  → primer compile del preview — banda 60–95 %
 * Dentro de cada etapa el avance es una aproximación suave que se acerca al
 * tope de la banda sin alcanzarlo: nunca marca 100 % antes de terminar. La
 * misma fracción enciende las celdas de la rejilla (prop `progress`).
 *
 * `progressRef` vive en StudioEngine: las dos etapas se pintan con dos
 * instancias distintas de este overlay (ramas distintas del render), y el ref
 * es lo que deja que la barra continúe en vez de volver a 0 al cambiar de
 * etapa — sin re-renderizar StudioEngine en cada tick.
 */
export type LoadStage = 'download' | 'compile';

const BANDS: Record<LoadStage, [number, number]> = {
  download: [0, 0.6],
  compile: [0.6, 0.95],
};

const LABELS: Record<LoadStage, string> = {
  download: 'Descargando archivos…',
  compile: 'Preparando vista previa…',
};

export function StudioLoadOverlay({
  stage,
  progressRef,
}: {
  stage: LoadStage;
  progressRef: MutableRefObject<number>;
}) {
  const [lo, hi] = BANDS[stage];
  const [progress, setProgress] = useState(() => Math.max(progressRef.current, lo));

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((prev) => {
        const base = Math.max(prev, lo);
        const next = base + (hi - base) * 0.04;
        progressRef.current = next;
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [lo, hi, progressRef]);

  return (
    <ColdStartOverlay progress={progress}>
      <NebuLoader size={160} delay={0} />
      <div className="text-sm font-medium text-foreground">Cargando tu proyecto…</div>
      <div className="w-64 h-1 bg-[#2A2A2A] overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[#E8E8E8] transition-[width] duration-200 ease-out" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="text-xs text-muted-foreground font-mono">
        {LABELS[stage]} {Math.round(progress * 100)}%
      </div>
    </ColdStartOverlay>
  );
}
