// ---------------------------------------------------------------------------
// stageTimer — cuánto tarda cada etapa de un pedido (bucket 6, 2026-09-30).
// Samuel midió 72–96 s para una edición simple; sin tiempos por etapa no se
// sabe si es el classifier, el targeting, la edición o el Verifier. Sólo mide
// y lo deja en la consola del navegador; no cambia ningún comportamiento.
// ---------------------------------------------------------------------------

/** @param {() => number} [now] */
export function createStageTimer(now = () => Date.now()) {
  const start = now();
  let last = start;
  /** @type {{ name: string, ms: number }[]} */
  const stages = [];
  return {
    /** Cierra la etapa `name`: el tiempo desde la marca anterior. */
    mark(name) {
      const t = now();
      stages.push({ name, ms: t - last });
      last = t;
    },
    /** "classify 3.2s · target 1.0s · … · total 71.4s" */
    summary() {
      const fmt = (ms) => `${(ms / 1000).toFixed(1)}s`;
      return [...stages.map((s) => `${s.name} ${fmt(s.ms)}`), `total ${fmt(now() - start)}`].join(' · ');
    },
    stages,
  };
}
