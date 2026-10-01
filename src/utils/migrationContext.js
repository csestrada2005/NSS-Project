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
  const objects = [...indexMigrationObjects(new Map([[path, sql]])).values()].map((o) => `${o.kind} ${o.name}`);
  return [
    'PENDING MIGRATION — proposed earlier and NOT applied to the database yet (what it creates does NOT exist in the database):',
    `--- ${path} ---`,
    body.trim(),
    '---',
    `It defines: ${objects.length > 0 ? objects.join(', ') : '(no recognizable objects)'}.`,
    'MIGRATION MERGE RULE — decide by the objects the request changes:',
    `- If it changes the SAME objects as the pending migration, do NOT create a new file: plan ONE step with action "modify" on ${path} that rewrites it as a single migration with BOTH its current statements and the change (fold new columns into the CREATE TABLE when the table is created there).`,
    '- If it changes OTHER objects, create a NEW file under supabase/migrations/ for them only. It will be applied together with the pending one, after it. Do NOT put unrelated changes into the pending file.',
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
  const merged = [];
  const alongside = [];
  const touchesApplied = [];
  for (const step of steps ?? []) {
    const path = typeof step?.file_path === 'string' ? step.file_path : '';
    if (!isMigrationPath(path)) continue;
    const existed = files?.has(path) === true;
    // Borrar la pendiente NO es fusionar (2026-10-01: la consola lo contaba así).
    if (pending.has(path) && step.action === 'modify') merged.push(path);
    if (!existed && pending.size > 0) alongside.push(path);
    if (existed && !pending.has(path) && step.action !== 'delete') touchesApplied.push(path);
  }
  return { merged, alongside, touchesApplied };
}

// ---------------------------------------------------------------------------
// Fase 2b — migraciones YA EXISTENTES: "dónde se definió qué". La IA veía sólo
// 400 caracteres del schema (ProjectMemoryService), y el paso que ESCRIBE una
// migración nueva no veía ninguna anterior: corregía a ciegas una función o
// tabla que ya existe (reescribirla perdiendo partes, o re-crearla).
// ---------------------------------------------------------------------------

const NAME = '(?:"?public"?\\.)?"?([A-Za-z_][\\w]*)"?';
const OBJECT_PATTERNS = [
  ['table', new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${NAME}`, 'gi')],
  ['table', new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${NAME}`, 'gi')],
  ['table', new RegExp(`drop\\s+table\\s+(?:if\\s+exists\\s+)?${NAME}`, 'gi')],
  ['table', new RegExp(`create\\s+policy\\s+(?:"[^"]*"|\\w+)\\s+on\\s+${NAME}`, 'gi')],
  ['function', new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${NAME}`, 'gi')],
  ['view', new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+${NAME}`, 'gi')],
  ['trigger', new RegExp(`create\\s+(?:or\\s+replace\\s+)?trigger\\s+${NAME}`, 'gi')],
];

/**
 * Objetos de base de datos → migraciones que los crean o cambian, en orden.
 *
 * @param {Map<string, string>} files
 * @param {Iterable<string>} [exclude] p. ej. la migración pendiente
 * @returns {Map<string, { kind: string, name: string, paths: string[] }>}
 */
export function indexMigrationObjects(files, exclude = []) {
  const skip = new Set(exclude ?? []);
  const index = new Map();
  const paths = [...(files?.keys() ?? [])].filter((p) => isMigrationPath(p) && !skip.has(p)).sort();
  for (const path of paths) {
    const sql = String(files.get(path) ?? '').replace(/--[^\n]*/g, '');
    for (const [kind, re] of OBJECT_PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sql)) !== null) {
        const name = m[1].toLowerCase();
        const key = `${kind} ${name}`;
        const entry = index.get(key) ?? { kind, name, paths: [] };
        if (!entry.paths.includes(path)) entry.paths.push(path);
        index.set(key, entry);
      }
    }
  }
  return index;
}

const fileOf = (path) => path.slice(path.lastIndexOf('/') + 1);

/**
 * Nota para el Architect: la lista de objetos y en qué migración se definió
 * cada uno, más la regla de las migraciones aplicadas. '' si no hay ninguna.
 *
 * @param {Map<string, string>} files
 * @param {string[] | null | undefined} pendingPaths
 * @returns {string}
 */
export function buildMigrationObjectsNote(files, pendingPaths) {
  const index = indexMigrationObjects(files, pendingPaths ?? []);
  if (index.size === 0) return '';
  const lines = [...index.values()]
    .slice(0, 60)
    .map((o) => `- ${o.kind} ${o.name}: ${o.paths.map(fileOf).join(', ')}`);
  return [
    'DATABASE OBJECTS DEFINED BY EXISTING MIGRATIONS (already applied — they are history):',
    ...lines,
    'APPLIED MIGRATION RULE: never modify those files; the database already ran them and editing a file does not change the database.',
    'To change an object listed above, plan a NEW migration file that changes it from its current definition',
    '(ALTER TABLE for columns/constraints, CREATE OR REPLACE FUNCTION with the full current body plus the change, DROP POLICY + CREATE POLICY).',
    'Name the exact object in the step description (e.g. "alters table newsletter_subscribers") so the step can read its current definition.',
  ].join('\n');
}

/**
 * Para el paso que ESCRIBE una migración nueva: el contenido de las
 * migraciones existentes que definen los objetos que su descripción nombra.
 * '' si no nombra ninguno.
 *
 * @param {string} text descripción del paso
 * @param {Map<string, string>} files
 * @param {Iterable<string>} [exclude] el propio archivo del paso
 * @param {{ maxFiles?: number, maxChars?: number }} [opts]
 * @returns {string}
 */
export function relatedMigrationDefinitions(text, files, exclude = [], { maxFiles = 3, maxChars = 4000 } = {}) {
  const haystack = String(text ?? '').toLowerCase();
  const index = indexMigrationObjects(files, exclude);
  const wanted = [];
  for (const o of index.values()) {
    if (!new RegExp(`\\b${o.name}\\b`).test(haystack)) continue;
    // La más reciente primero: es la que describe cómo está HOY.
    for (const p of [...o.paths].reverse()) if (!wanted.includes(p)) wanted.push(p);
  }
  if (wanted.length === 0) return '';
  const blocks = wanted.slice(0, maxFiles).map((p) => {
    const sql = String(files.get(p) ?? '');
    return `--- ${p} ---\n${sql.length > maxChars ? `${sql.slice(0, maxChars)}\n-- (truncated)` : sql}`;
  });
  return [
    'CURRENT DEFINITIONS (existing migrations that define the objects this step changes — already applied, do NOT re-create them):',
    ...blocks,
    'Write this migration as a change ON TOP of these definitions: ALTER what exists, CREATE OR REPLACE functions keeping their current behavior plus the requested change.',
  ].join('\n');
}
