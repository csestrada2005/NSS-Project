/**
 * migrationGate — el barrido de migraciones se activa por el CONTENIDO del
 * plan, no por la ETIQUETA del clasificador.
 *
 * EL AGUJERO QUE ESTO TAPA (C-D)
 * ------------------------------
 * Las dos guardas de migraciones de AIOrchestrator (el barrido de huérfanos y
 * la normalización de directorio) colgaban de `intent.type === 'database_change'`
 * y de nada más. Es decir: de la salida de un LLM. El clasificador acierta casi
 * siempre, pero "casi" no es una garantía — y cuando falla, un `.sql` que llega
 * al plan bajo `modify_existing` (o cualquier otro tipo) esquiva el barrido
 * ENTERO: no se recoloca, no se renombra, no lleva marca [DDL_PROPOSED:], no
 * aparece el botón de aprobación y no vuelve al modelo como contexto de schema.
 * El mismo silencio que las Cirugías 1, 2 y 2.2 vinieron a matar, entrando por
 * la única puerta que quedaba abierta: la etiqueta.
 *
 * LA REGLA
 * --------
 * La etiqueta se queda (un `database_change` sigue activando el barrido aunque
 * su plan no traiga todavía ningún path reconocible), y al lado se le pone una
 * segunda vía por CONTENIDO: si el lote toca migraciones, el barrido se activa
 * diga lo que diga el clasificador. Las dos son un OR — esto AÑADE activaciones,
 * nunca quita ninguna.
 *
 * FAIL-CLOSED, A PROPÓSITO
 * ------------------------
 * Ante la duda, `true`. Los dos cuerpos que esto activa son idempotentes y
 * conservadores: `resolveMigrationTargets` no toca lo que no es `.sql`, y
 * `orphanMigrationCandidates` sólo recoge `.sql` bajo un segmento `migrations/`.
 * Activar de más sobre un lote sin migraciones no hace nada; activar de menos
 * sobre un lote CON migraciones es exactamente el fallo de arriba. La asimetría
 * decide el default.
 *
 * OJO — ESTO NO ES `isMigrationPath`. Aquel dice "este archivo ES una migración
 * reconocida" (bajo el prefijo real) y decide destinos. Esto dice "en este lote
 * hay algo que HUELE a migración" y sólo decide si se mira o no. Por eso es más
 * ancho: cualquier `.sql` del árbol, y cualquier cosa —`.sql` o no— que cuelgue
 * de `supabase/migrations/`.
 *
 * Plain JS (no TS) para que sea importable desde `node --test`, igual que
 * laneRouting.js, migrationPath.js y deletionGuard.js. El tipado vive en
 * migrationGate.d.ts.
 */

/** El prefijo real de las migraciones, como SEGMENTO buscable en cualquier path. */
export const MIGRATIONS_SEGMENT = 'supabase/migrations/';

/**
 * Un path comparable: separadores de Windows a `/`, `./` inicial fuera, sin
 * espacios de sobra y en minúsculas. Un plan puede emitir
 * `supabase\\migrations\\x.sql` o `./foo/BAR.SQL`; ninguna de las dos formas
 * puede escaparse por escribirse distinto.
 *
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
  return String(path)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .toLowerCase();
}

/**
 * ¿Este path cuelga de `supabase/migrations/`, viva donde viva ese directorio?
 *
 * Segmento completo, no subcadena: `supabase/migrations/x`, y también
 * `apps/web/supabase/migrations/x` — pero no `mysupabase/migrations/x`.
 * Y no exige `.sql`: un README bajo `supabase/migrations/` dice que este lote
 * está trabajando ahí dentro, que es justo lo que la guarda quiere saber.
 *
 * @param {string} normalized ya pasado por normalizePath
 * @returns {boolean}
 */
function underMigrationsPrefix(normalized) {
  return normalized.startsWith(MIGRATIONS_SEGMENT)
    || normalized.includes(`/${MIGRATIONS_SEGMENT}`);
}

/**
 * ¿Toca este lote de paths algo que tenga que pasar por el barrido de
 * migraciones?
 *
 * `true` si CUALQUIER path (a) cuelga de un segmento `supabase/migrations/` en
 * cualquier parte del árbol, o (b) termina en `.sql` en cualquier parte del
 * árbol.
 *
 * Fail-closed: un elemento que no sepamos leer (no es una cadena) devuelve
 * `true` — no podemos descartarlo, y descartarlo es el fallo caro. Una
 * colección ausente (`null`/`undefined`) es "no hay nada que mirar", igual que
 * `[]`: `false`.
 *
 * @param {Iterable<string>|null|undefined} paths
 * @returns {boolean}
 */
export function touchesMigrations(paths) {
  if (paths === null || paths === undefined) return false;
  // Algo que ni siquiera se puede recorrer: duda máxima, fail-closed.
  if (typeof paths[Symbol.iterator] !== 'function') return true;

  for (const raw of paths) {
    if (typeof raw !== 'string') return true;
    const normalized = normalizePath(raw);
    if (normalized === '') continue;
    if (normalized.endsWith('.sql')) return true;
    if (underMigrationsPrefix(normalized)) return true;
  }
  return false;
}
