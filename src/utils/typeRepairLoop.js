// ---------------------------------------------------------------------------
// typeRepairLoop — la "segunda puerta" del Verifier (bucket 6, 2026-09-29).
//
// Corre DESPUÉS de que el proyecto compila en verde: revisa tipos como `tsc`
// en Vercel, aplica el arreglo automático de imports sin usar, y manda lo que
// quede a reparación con el modelo, como mucho `maxRounds` veces.
//
// SALVAGUARDA — esta puerta nunca empeora el resultado:
//   · se parte de una versión que compila (`green`) y sólo se reemplaza por
//     otra que TAMBIÉN compila y tiene MENOS errores de tipos;
//   · una ronda que rompe la compilación, no reduce errores o no puede
//     verificarse se descarta y el ciclo termina con la última versión buena;
//   · si la revisión no está disponible, se devuelve la entrada intacta.
//
// Puro salvo por las dependencias inyectadas (typecheck, compile, repair), así
// que la salvaguarda se prueba con `node --test` sin modelo ni servidor.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ file: string|null, line: number|null, column: number|null, code: number, message: string }} TypeIssue
 * @typedef {{ available: false, reason: string } | { available: true, errors: TypeIssue[], unverifiable: TypeIssue[], fixedFiles: Record<string, string>, autoFixed: number }} TypecheckResult
 */

function merge(files, fixedFiles) {
  const out = new Map(files);
  for (const [path, content] of Object.entries(fixedFiles ?? {})) out.set(path, content);
  return out;
}

const hasFixes = (tc) => Object.keys(tc.fixedFiles ?? {}).length > 0;

/**
 * Sufijo de telemetría para `prompt` en forge_intent_log (mismo patrón que
 * [RESTORED:...] / [DANGLING_REF:...]): ' [TYPE_ERRORS:n]' si quedaron errores
 * de tipos, ' [TYPECHECK_OFF]' si no se pudo revisar, '' si quedó limpio o si
 * el verify no llegó a la segunda puerta.
 *
 * @param {'clean' | 'errors' | 'unavailable' | undefined} status
 * @param {number} errorCount
 */
export function typeCheckTelemetry(status, errorCount) {
  if (status === 'errors') return ` [TYPE_ERRORS:${errorCount}]`;
  if (status === 'unavailable') return ' [TYPECHECK_OFF]';
  return '';
}

/**
 * @param {{
 *   files: Map<string, string>,
 *   typecheck: (files: Map<string, string>, opts?: { autoFix?: boolean }) => Promise<TypecheckResult>,
 *   compile: (files: Map<string, string>) => Promise<boolean>,
 *   repair: (files: Map<string, string>, errors: TypeIssue[]) => Promise<{ files: Map<string, string> | null, calls: number }>,
 *   maxRounds: number,
 *   isAborted?: () => boolean,
 * }} deps
 * @returns {Promise<{
 *   status: 'clean' | 'errors' | 'unavailable',
 *   files: Map<string, string>,
 *   errors: TypeIssue[],
 *   unverifiable: TypeIssue[],
 *   autoFixed: number,
 *   fixCalls: number,
 *   rounds: number,
 * }>}
 */
export async function runTypeRepair({ files, typecheck, compile, repair, maxRounds, isAborted = () => false }) {
  const abortIfNeeded = () => {
    if (isAborted()) throw new DOMException('aborted', 'AbortError');
  };

  /**
   * Revisa `base` y, si hubo arreglo automático, lo acepta sólo si sigue
   * compilando; si no, repite la revisión SIN arreglo sobre `base`.
   * Devuelve null si la revisión no está disponible.
   */
  const check = async (base) => {
    let tc = await typecheck(base);
    if (!tc.available) return null;
    if (!hasFixes(tc)) return { files: base, tc, autoFixed: 0 };
    const fixed = merge(base, tc.fixedFiles);
    abortIfNeeded();
    if (await compile(fixed)) return { files: fixed, tc, autoFixed: tc.autoFixed ?? 0 };
    tc = await typecheck(base, { autoFix: false });
    return tc.available ? { files: base, tc, autoFixed: 0 } : null;
  };

  abortIfNeeded();
  const first = await check(files);
  if (!first) {
    return { status: 'unavailable', files, errors: [], unverifiable: [], autoFixed: 0, fixCalls: 0, rounds: 0 };
  }

  let green = first.files;
  let errors = first.tc.errors;
  let unverifiable = first.tc.unverifiable;
  let autoFixed = first.autoFixed;
  let fixCalls = 0;
  let rounds = 0;

  while (errors.length > 0 && rounds < maxRounds) {
    abortIfNeeded();
    rounds += 1;
    const repaired = await repair(green, errors);
    fixCalls += repaired.calls;
    if (!repaired.files || repaired.files === green) break;

    abortIfNeeded();
    if (!(await compile(repaired.files))) break; // rompió la compilación: se descarta

    abortIfNeeded();
    const next = await check(repaired.files);
    if (!next) break; // no se puede verificar: no se acepta a ciegas
    if (next.tc.errors.length >= errors.length) break; // sin progreso: se descarta

    green = next.files;
    errors = next.tc.errors;
    unverifiable = next.tc.unverifiable;
    autoFixed += next.autoFixed;
  }

  return { status: errors.length > 0 ? 'errors' : 'clean', files: green, errors, unverifiable, autoFixed, fixCalls, rounds };
}
