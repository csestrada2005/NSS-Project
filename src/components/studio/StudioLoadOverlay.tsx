import { useEffect, useState, type MutableRefObject, type ReactNode } from 'react';
import { ColdStartOverlay } from './ColdStartOverlay';
import NebuLoader from '../brand/NebuLoader';
import { useForgeLang } from '@/i18n/forge/useForgeLang';
import type { ForgeKey } from '@/i18n/forge/en';

/**
 * Pantalla de espera del Studio con búho + barra de progreso (2026-09-27,
 * pedido de Samuel). La usan la carga de un proyecto existente
 * (StudioLoadOverlay) y la generación de uno nuevo (StudioEngine, overlay
 * "Generando tu proyecto…"), para que las dos se vean y se sientan igual.
 *
 * `band` = [desde, hasta] (0–1) de la etapa real en curso. Dentro de la banda
 * el avance es una aproximación suave que se acerca al tope sin alcanzarlo:
 * nunca marca 100 % antes de terminar. La misma fracción enciende las celdas
 * de la rejilla (prop `progress` de ColdStartOverlay).
 *
 * `progressRef` (opcional) guarda el avance fuera del componente, para cuando
 * una misma espera se pinta con instancias distintas (ramas distintas del
 * render) y la barra debe continuar en vez de volver a 0.
 */
export function StudioProgressOverlay({
  band,
  title,
  detail,
  progressRef,
  children,
}: {
  band: [number, number];
  title: string;
  detail?: string;
  progressRef?: MutableRefObject<number>;
  children?: ReactNode;
}) {
  const [lo, hi] = band;
  const [progress, setProgress] = useState(() => Math.max(progressRef?.current ?? 0, lo));

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((prev) => {
        const base = Math.max(prev, lo);
        // max(0, …): si la banda baja (p. ej. se limpia el paso actual), la
        // barra se queda quieta en vez de retroceder.
        const next = base + Math.max(0, hi - base) * 0.04;
        if (progressRef) progressRef.current = next;
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [lo, hi, progressRef]);

  const pct = Math.round(progress * 100);
  return (
    <ColdStartOverlay progress={progress}>
      <NebuLoader size={160} delay={0} />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="w-64 h-1 bg-[#2A2A2A] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-[#E8E8E8] transition-[width] duration-200 ease-out" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="text-xs text-muted-foreground font-mono max-w-[80%] truncate">
        {detail ? `${detail} · ` : ''}{pct}%
      </div>
      {children}
    </ColdStartOverlay>
  );
}

/** Carga de un proyecto existente: download (acceso + forge_files) → compile (primer preview). */
export type LoadStage = 'download' | 'compile';

const LOAD_BANDS: Record<LoadStage, [number, number]> = {
  download: [0, 0.6],
  compile: [0.6, 0.95],
};

const LOAD_LABELS: Record<LoadStage, ForgeKey> = {
  download: 'loader.download',
  compile: 'loader.compile',
};

export function StudioLoadOverlay({
  stage,
  progressRef,
}: {
  stage: LoadStage;
  progressRef: MutableRefObject<number>;
}) {
  const { t } = useForgeLang();
  return (
    <StudioProgressOverlay
      band={LOAD_BANDS[stage]}
      title={t('loader.loadingProject')}
      detail={t(LOAD_LABELS[stage])}
      progressRef={progressRef}
    />
  );
}
