// ---------------------------------------------------------------------------
// migrationContext — lo que la IA planificadora tiene que saber de las
// migraciones del proyecto antes de proponer otra (2026-10-01, decisiones de
// Samuel).
//
// Fase 2a — migración PENDIENTE (propuesta y nunca aplicada): si el pedido
// toca la base, se MODIFICA esa misma migración para que quede UNA con todo,
// en vez de crear otra que quizá dé por hecha la anterior.
//
// Una migración APLICADA nunca se edita: la base ya la ejecutó, y cambiar el
// archivo no cambia la base (quedarían desincronizados). Lo que cambie algo
// que ella creó va en una migración NUEVA de corrección.
// ---------------------------------------------------------------------------

import { isMigrationPath } from './migrationPath.js';

const MAX_SQL_CHARS = 6000;

/**
 * Nota para el Architect sobre la migración pendiente, o '' si no hay una
 * que se pueda fusionar (sin propuesta, varias migraciones en la propuesta, o
 * el archivo ya no está en el proyecto).
 *
 * @param {string[] | null | undefined} pendingPaths paths de la propuesta ejecutable
 * @param {Map<string, string>} files
 * @returns {string}
 */
export function buildPendingMigrationNote(pendingPaths, files) {
  const paths = (pendingPaths ?? []).filter((p) => isMigrationPath(p));
  // Sólo una: con un lote de varias, "cuál absorbe a cuál" no es obvio y
  // fusionar a ciegas podría romper el orden entre ellas.
  if (paths.length !== 1) return '';
  const path = paths[0];
  const sql = files?.get(path);
  if (typeof sql !== 'string') return '';
  const body = sql.length > MAX_SQL_CHARS ? `${sql.slice(0, MAX_SQL_CHARS)}\n-- (truncated)` : sql;
  return [
    'PENDING MIGRATION — proposed earlier and NOT applied to the database yet:',
    `--- ${path} ---`,
    body.trim(),
    '---',
    'MIGRATION MERGE RULE: if this request changes the database, do NOT create a new file under supabase/migrations/.',
    `Instead plan ONE step with action "modify" on ${path}, whose description says it rewrites that file as a single migration`,
    'containing BOTH its current statements and the new change (fold new columns into the CREATE TABLE when the table is created there).',
    'Never modify any OTHER file under supabase/migrations/: those are already applied to the database.',
  ].join('\n');
}

/**
 * Revisión del plan contra la regla: ¿creó una migración nueva habiendo una
 * pendiente, o modifica una migración que NO es la pendiente (ya aplicada)?
 * Sólo diagnostica; quien llama decide qué registrar.
 *
 * @param {{ action?: string, file_path?: string }[]} steps
 * @param {string[] | null | undefined} pendingPaths
 * @param {Map<string, string>} files proyecto ANTES del pedido
 * @returns {{ notMerged: string[], touchesApplied: string[] }}
 */
export function checkMigrationPlan(steps, pendingPaths, files) {
  const pending = new Set((pendingPaths ?? []).filter((p) => isMigrationPath(p)));
  const notMerged = [];
  const touchesApplied = [];
  for (const step of steps ?? []) {
    const path = typeof step?.file_path === 'string' ? step.file_path : '';
    if (!isMigrationPath(path)) continue;
    const existed = files?.has(path) === true;
    if (!existed && pending.size > 0) notMerged.push(path);
    if (existed && !pending.has(path) && step.action !== 'delete') touchesApplied.push(path);
  }
  return { notMerged, touchesApplied };
}
