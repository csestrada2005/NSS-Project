/**
 * MigrationRunner — el cable que faltaba entre "el pipeline generó una
 * migración" y "la base de datos del proyecto cambió".
 *
 * EL FALLO QUE ESTO REPARA
 * ------------------------
 * El pipeline clasificaba `database_change`, escribía un .sql válido bajo
 * supabase/migrations/ y cerraba el intent en outcome='success'. Nada de eso
 * había tocado la base: no existía ningún camino entre la clasificación y la
 * ejecución. El usuario leía "listo" y su tabla no estaba.
 *
 * LA REGLA CENTRAL: EL CRITERIO DE ÉXITO ES EL DIFF DEL SCHEMA
 * -----------------------------------------------------------
 * La función de ejecución del proyecto devuelve '[]' TANTO cuando el DDL se
 * aplicó como cuando no pasó absolutamente nada — un DDL no produce filas. Leer
 * ese retorno como señal de éxito reconstruye EXACTAMENTE el mismo fallo
 * silencioso que esta cirugía viene a arreglar, sólo que una capa más abajo.
 * Por eso el veredicto se toma comparando el schema ANTES contra el schema
 * DESPUÉS, que es la única evidencia que no puede mentir:
 *
 *   diff vacío = FALLO.
 *
 * Un DDL que se aplicó de verdad mueve information_schema. Si no lo movió, o
 * bien no se ejecutó, o bien la sentencia era un no-op — y ninguna de las dos
 * cosas es un éxito que podamos reportar.
 *
 * LO QUE NO HACE
 *  - No auto-provisiona. Un proyecto sin base de datos no gana una porque haya
 *    una migración pendiente; se registra [DDL_SKIPPED:no_db] y se vuelve.
 *  - No escribe SQL propio ni habla con la base directamente: todo va por
 *    ProjectDBService → POST /api/db/:projectId/query, que lo ejecuta
 *    server-side contra el cliente de ESE proyecto (nunca el principal).
 *  - No decide si una migración DEBE aplicarse. Eso es aprobación humana, y
 *    llega en Cirugía 2.
 */

import { SupabaseService } from './SupabaseService';
import { projectDBService } from './ProjectDBService';
import { AIOrchestrator } from './AIOrchestrator';

/** Una fila del schema, tal como la sirve GET /api/db/:projectId/schema. */
interface SchemaColumn {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

export type MigrationOutcome = 'applied' | 'failed' | 'skipped';

export interface MigrationResult {
  outcome: MigrationOutcome;
  /** Motivo legible: 'no_db', 'missing_file', 'no_schema_change', … */
  reason?: string;
  /** Tablas que el diff del schema mostró tocadas. Vacío salvo en 'applied'. */
  tables: string[];
}

/** Clave estable de una columna, para diffear dos snapshots por conjunto. */
function columnKey(c: SchemaColumn): string {
  return `${c.table_name}.${c.column_name}|${c.data_type}|${c.is_nullable}`;
}

/** Normaliza la respuesta del endpoint de schema a filas tipadas. */
function asColumns(data: unknown): SchemaColumn[] {
  if (!Array.isArray(data)) return [];
  return data.filter(
    (row): row is SchemaColumn =>
      !!row && typeof row === 'object' && typeof (row as SchemaColumn).table_name === 'string'
  );
}

/** Mensaje corto y estable a partir de un error de cualquier forma. */
function describeError(e: unknown): string {
  if (!e) return 'unknown';
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  const msg = (e as { message?: unknown }).message;
  if (typeof msg === 'string') return msg;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

/** Recorta un motivo para que quepa en el sufijo de telemetría. */
function trimReason(reason: string): string {
  const flat = reason.replace(/[\s\]]+/g, ' ').trim();
  return flat.length > 120 ? `${flat.slice(0, 117)}...` : flat;
}

export class MigrationRunner {
  /**
   * Aplica UNA migración ya persistida en forge_files contra la base del
   * proyecto generado, y registra el veredicto en forge_intent_log.
   *
   * El resultado que devuelve y el que registra son el mismo: si esto dice
   * 'applied', el diff del schema lo respaldó.
   */
  static async applyMigration(projectId: string, migrationPath: string): Promise<MigrationResult> {
    const startTime = Date.now();
    const supabase = SupabaseService.getInstance().client;

    /** Cierra el intento por la única puerta de telemetría que existe. */
    const close = async (
      mark: string,
      outcome: 'success' | 'failed',
      errorMessage: string | null,
      modifiedFiles: string[]
    ): Promise<void> => {
      await AIOrchestrator.logMigrationIntent({
        projectId,
        prompt: `Apply migration ${migrationPath}${mark}`,
        modifiedFiles,
        outcome,
        errorMessage,
        durationMs: Date.now() - startTime,
      });
    };

    // ------------------------------------------------------------------
    // 1. ¿Tiene el proyecto una base de datos propia?
    //
    // NUNCA auto-provisionar. Provisionar es crear un proyecto Supabase real y
    // facturable a nombre del usuario: que exista un .sql pendiente no es
    // consentimiento para eso. Sin base, la migración queda donde está y el
    // log lo dice.
    // ------------------------------------------------------------------
    let projectRef: string | null = null;
    try {
      const { data, error } = await supabase
        .from('forge_projects')
        .select('supabase_project_ref')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      projectRef = (data?.supabase_project_ref as string | null) ?? null;
    } catch (e) {
      const reason = trimReason(describeError(e));
      console.error('[MigrationRunner] no se pudo leer el proyecto:', e);
      await close(` [DDL_FAILED:project_lookup:${reason}]`, 'failed', reason, []);
      return { outcome: 'failed', reason: `project_lookup:${reason}`, tables: [] };
    }

    if (!projectRef) {
      console.warn('[MigrationRunner] el proyecto no tiene base de datos; no se auto-provisiona.');
      // outcome='failed': el DDL no se aplicó. 'skipped' no es un valor del
      // enum de forge_intent_log y R2 prohíbe añadirlo — el matiz vive en el
      // sufijo [DDL_SKIPPED:no_db], que es consultable igual.
      await close(' [DDL_SKIPPED:no_db]', 'failed', 'no_db', []);
      return { outcome: 'skipped', reason: 'no_db', tables: [] };
    }

    // ------------------------------------------------------------------
    // 2. Contenido de la migración, desde forge_files.
    //
    // forge_files es la fuente de verdad del proyecto: el mapa en memoria del
    // Studio puede estar por delante (escritura con debounce) o por detrás, y
    // lo que se ejecuta contra una base tiene que ser lo que está guardado.
    // ------------------------------------------------------------------
    let sql = '';
    try {
      const { data, error } = await supabase
        .from('forge_files')
        .select('content')
        .eq('project_id', projectId)
        .eq('path', migrationPath)
        .single();
      if (error) throw error;
      sql = (data?.content as string | null) ?? '';
    } catch (e) {
      const reason = trimReason(describeError(e));
      console.error('[MigrationRunner] no se pudo leer la migración:', e);
      await close(` [DDL_FAILED:missing_file:${reason}]`, 'failed', reason, []);
      return { outcome: 'failed', reason: `missing_file:${reason}`, tables: [] };
    }

    if (!sql.trim()) {
      await close(' [DDL_FAILED:empty_migration]', 'failed', 'empty_migration', []);
      return { outcome: 'failed', reason: 'empty_migration', tables: [] };
    }

    // ------------------------------------------------------------------
    // 3. Snapshot ANTES.
    //
    // Si no podemos leer el schema previo no tenemos contra qué comparar, y sin
    // comparación no hay veredicto honesto posible. Cortamos ANTES de ejecutar:
    // aplicar un DDL que luego no sabríamos si funcionó es peor que no aplicarlo.
    // ------------------------------------------------------------------
    let before: SchemaColumn[];
    try {
      const snapshot = await projectDBService.getSchema(projectId);
      if (snapshot.error) throw snapshot.error;
      before = asColumns(snapshot.data);
    } catch (e) {
      const reason = trimReason(describeError(e));
      console.error('[MigrationRunner] snapshot previo fallido:', e);
      await close(` [DDL_FAILED:schema_before:${reason}]`, 'failed', reason, []);
      return { outcome: 'failed', reason: `schema_before:${reason}`, tables: [] };
    }

    // ------------------------------------------------------------------
    // 4. Ejecutar el DDL.
    //
    // El retorno se guarda SÓLO para poder citar el error cuando la base
    // rechaza la sentencia (sintaxis, permisos, tabla ya existente). NO se usa
    // como señal de éxito: eso lo decide el paso 6.
    // ------------------------------------------------------------------
    let transportError: string | null = null;
    try {
      const response = await projectDBService.query(projectId, sql);
      if (response.error) transportError = trimReason(describeError(response.error));
    } catch (e) {
      transportError = trimReason(describeError(e));
      console.error('[MigrationRunner] la ejecución lanzó:', e);
    }

    // ------------------------------------------------------------------
    // 5. Snapshot DESPUÉS.
    // ------------------------------------------------------------------
    let after: SchemaColumn[];
    try {
      const snapshot = await projectDBService.getSchema(projectId);
      if (snapshot.error) throw snapshot.error;
      after = asColumns(snapshot.data);
    } catch (e) {
      const reason = trimReason(describeError(e));
      console.error('[MigrationRunner] snapshot posterior fallido:', e);
      await close(` [DDL_FAILED:schema_after:${reason}]`, 'failed', reason, []);
      return { outcome: 'failed', reason: `schema_after:${reason}`, tables: [] };
    }

    // ------------------------------------------------------------------
    // 6. El diff ES el veredicto.
    //
    // LÍMITE CONOCIDO, dicho aquí para que nadie lo descubra en producción: el
    // snapshot es information_schema.columns (la forma que ya sirve
    // GET /api/db/:projectId/schema, y no se abren endpoints nuevos). Eso ve
    // tablas y columnas, que es lo que produce el 99% del DDL generado —
    // CREATE TABLE, ADD COLUMN, ALTER TYPE. NO ve índices, políticas RLS ni
    // grants. Una migración que SÓLO habilita RLS o crea una policy se
    // reportará como [DDL_FAILED:no_schema_change] aunque se haya aplicado.
    // Es el sesgo deliberadamente seguro: preferimos un falso negativo
    // ("revísalo") a un falso positivo, que es el fallo silencioso que esta
    // cirugía existe para matar. Ampliar el snapshot pide ampliar lo que
    // devuelve el endpoint de schema, y eso es otra cirugía.
    // ------------------------------------------------------------------
    const beforeKeys = new Set(before.map(columnKey));
    const afterKeys = new Set(after.map(columnKey));

    const touched = new Set<string>();
    for (const c of after) {
      if (!beforeKeys.has(columnKey(c))) touched.add(c.table_name);
    }
    for (const c of before) {
      if (!afterKeys.has(columnKey(c))) touched.add(c.table_name);
    }
    const tables = [...touched].sort();

    if (tables.length === 0) {
      // Diff vacío = FALLO, siempre, aunque la ejecución no reportara error.
      // Ese es justo el caso del fallo silencioso original: retorno limpio,
      // base intacta.
      const reason = transportError ? `error:${transportError}` : 'no_schema_change';
      console.error('[MigrationRunner] el schema no cambió — la migración NO se aplicó:', reason);
      await close(` [DDL_FAILED:${reason}]`, 'failed', reason, []);
      return { outcome: 'failed', reason, tables: [] };
    }

    // El schema cambió: la migración se aplicó. Si además hubo un error de
    // transporte, el DDL era multi-sentencia y alguna cayó — se aplicó en
    // parte, y el log tiene que decirlo en vez de cantar victoria limpia.
    const mark = transportError
      ? ` [DDL_APPLIED:${tables.join(',')}] [DDL_FAILED:partial:${transportError}]`
      : ` [DDL_APPLIED:${tables.join(',')}]`;
    console.log('[MigrationRunner] migración aplicada, tablas tocadas:', tables.join(', '));
    await close(mark, 'success', transportError, [migrationPath]);
    return { outcome: 'applied', reason: transportError ? 'partial' : undefined, tables };
  }
}

// ---------------------------------------------------------------------------
// PIEZA D — DISPARADOR TEMPORAL.
//
// ⚠ TEMPORAL — SE RETIRA EN CIRUGÍA 2. ⚠
//
// Esto existe SÓLO para que el cable recién construido se pueda ejercitar antes
// de que exista el botón de aprobación en el modal. En cuanto ese botón llegue
// (Cirugía 2, apoyado en src/utils/ddlGuard.js), este bloque se borra entero.
//
// NO abre privilegio nuevo. SQLEditor.tsx ya deja al dueño de un proyecto correr
// SQL arbitrario contra su propia base por la misma ruta
// (projectDBService → POST /api/db/:projectId/query, que valida la propiedad
// server-side con requireProjectOwnership). Esto sólo pone en consola algo que
// ya está a un clic de distancia, y sigue pasando por exactamente los mismos
// controles: sin sesión y sin ser dueño del proyecto, el endpoint responde igual
// de negativamente a esta llamada que a la del editor.
//
// Uso:  await window.__forgeApplyMigration('<projectId>', 'supabase/migrations/<archivo>.sql')
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    /** TEMPORAL (Cirugía 1). Se retira cuando exista el botón de aprobación. */
    __forgeApplyMigration?: (projectId: string, migrationPath: string) => Promise<MigrationResult>;
  }
}

if (typeof window !== 'undefined') {
  window.__forgeApplyMigration = (projectId: string, migrationPath: string) =>
    MigrationRunner.applyMigration(projectId, migrationPath);
}
