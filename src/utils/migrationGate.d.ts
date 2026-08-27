/**
 * Type surface for the plain-JS migration gate (src/utils/migrationGate.js).
 * Hand-written so the browser build stays typed while la implementación sigue
 * siendo JavaScript importable desde `node --test` — mismo arreglo que
 * laneRouting.d.ts, migrationPath.d.ts y deletionGuard.d.ts.
 */

/** El prefijo real de las migraciones, como segmento buscable en un path. */
export const MIGRATIONS_SEGMENT: string;

/**
 * ¿Toca este lote de paths algo que tenga que pasar por el barrido de
 * migraciones? Fail-closed: ante la duda, true.
 */
export function touchesMigrations(paths: Iterable<string> | null | undefined): boolean;
