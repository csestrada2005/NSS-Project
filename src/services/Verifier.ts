import { platformService } from './PlatformService';
import type { CompileErrorDetail } from './PlatformService';
import { isAbortError } from '../utils/abort';
import { groupCompileErrors, labelForError } from '../utils/groupCompileErrors';
import type { RepairBatch } from '../utils/groupCompileErrors';
import { candidatePathsFor } from '../utils/resolveModulePath';
import { cachedSystemBlocks } from './promptCache';
import { buildProjectContextPrefix, buildBlueprintBlock } from './promptRules';

// ---------------------------------------------------------------------------
// CAMBIO 3 — ruteo de reparación por clase de error.
//
// Los errores de sintaxis y los de nombre import/export son fallos MECÁNICOS:
// un corchete que falta, un `import { Foo }` que no coincide con el export. Un
// modelo pequeño (Haiku) los repara con la misma fiabilidad y a una fracción
// del coste. El resto de clases (módulo no resuelto, referencia indefinida,
// declaración duplicada, error genérico) pueden requerir juicio sobre QUÉ debe
// existir, así que se quedan en Sonnet.
//
// Las etiquetas provienen de groupCompileErrors.labelForError (única fuente de
// clasificación), así que este ruteo se mantiene alineado con el batching.
// ---------------------------------------------------------------------------
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';
const HAIKU_REPAIR_CLASSES = new Set<string>([
  'syntax error',
  'export/import name mismatch',
]);

/** Devuelve el modelo de reparación adecuado para una etiqueta de clase. */
function pickRepairModel(label: string): string {
  return HAIKU_REPAIR_CLASSES.has(label) ? HAIKU_MODEL : SONNET_MODEL;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RetryCallback = (attempt: number, errorSummary: string) => void;

export interface VerifyResult {
  success: boolean;
  error?: string;
  files: Map<string, string>;
  tokensInput?: number;
  tokensOutput?: number;
  /**
   * Archivo culpable del último intento fallido (el resultado de
   * identifyErrorFile en el intento final). Campo aditivo: los callers del
   * heavy lane lo ignoran; el simple lane lo usa para un mensaje honesto.
   */
  errorFile?: string | null;
  /**
   * Total de tryCompile ejecutados en este verify. Una pasada limpia a la
   * primera es 1; cada fixError seguido de recompilación suma 1. Campo aditivo
   * usado por los lanes para distinguir "compiló limpio" de "hubo reparación".
   */
  attempts: number;
  /**
   * Paths cuyo contenido en `files` difiere del original al terminar el verify
   * (steps del plan Y reparaciones fuera del plan). Vacío cuando el verify
   * falla, porque en ese caso `files` es el original intacto.
   */
  repairedFiles: string[];
  /**
   * Telemetría de reparación por lotes (CAMBIO 2). `totalErrors` suma todos los
   * errores que esbuild reportó a lo largo de los compiles fallidos;
   * `fixCalls` cuenta las llamadas LLM de reparación realmente emitidas. El
   * ahorro del batching es totalErrors − fixCalls (una cascada de 3 exports que
   * antes costaba 3 llamadas ahora cuesta 1).
   */
  totalErrors: number;
  fixCalls: number;
  /**
   * Paths que una reparación ESCRIBIÓ estando ausentes del proyecto al empezar
   * ese fix: recreaciones. Un path que además venía en `deletedPaths` es un
   * delete del plan que el repair revirtió — la recreación es la corrección del
   * plan, así que el caller debe sacarlo de sus borrados antes de persistir (si
   * no, el archivo recreado se vuelve a borrar en forge_files).
   */
  recreatedPaths: string[];
  /**
   * Paths que el verify RESTAURÓ de forma determinista desde `originalFiles`,
   * sin pasar por el modelo: el error citaba un módulo ausente que existía
   * antes de este intent, así que el plan lo borró de más y su contenido
   * EXACTO sigue disponible. Se distingue de `recreatedPaths` (contenido
   * inventado por el modelo bajo la regla 4, para módulos que nunca
   * existieron), pero tiene el mismo efecto sobre los borrados del caller: un
   * path restaurado deja de ser un borrado y debe salir de `deletedPaths`
   * antes de persistir.
   */
  restoredPaths: string[];
}

// ---------------------------------------------------------------------------
// Verifier — compile-check loop with LLM-powered self-correction
// ---------------------------------------------------------------------------

export class Verifier {
  static async verify(
    modifiedFiles: Map<string, string>,
    originalFiles: Map<string, string>,
    onRetry?: RetryCallback,
    signal?: AbortSignal,
    // CAMBIO 1 — el tope de intentos es configurable: el plan lane conserva 3
    // (compile inicial + 2 rondas de reparación); el simple lane pasa 2, porque
    // una edición puntual sólo justifica una ronda de reparación por lotes.
    maxRetries: number = 3,
    // CAMBIO 1 (caching) — el design brief y el blueprint de esta generación.
    // Cuando llegan, las reparaciones Sonnet comparten byte-a-byte el prefijo
    // cacheado que escribieron el Architect y el Implementer, así que se sirven
    // desde cache_read en vez de re-facturarse como input fresco. Vacíos por
    // defecto: un caller que no los pase conserva el system prompt de hoy.
    designContext: string = '',
    blueprint: string = '',
    // Paths removed by executed 'delete' steps. Without them the rebuild below
    // resurrects every deleted file (it starts from the ORIGINAL map, where the
    // file still exists), so the compile — and everything downstream — would
    // still see a page the plan just deleted.
    deletedPaths: string[] = []
  ): Promise<VerifyResult> {
    const MAX_RETRIES = Math.max(1, maxRetries);
    // Compilar el proyecto COMPLETO con los cambios aplicados encima.
    // Compilar solo modifiedFiles causa "No entrypoint found" porque
    // main.tsx no suele estar entre los archivos modificados.
    let currentFiles = new Map<string, string>(originalFiles);
    for (const [path, content] of modifiedFiles) {
      currentFiles.set(path, content);
    }
    // Deletions are applied AFTER the merge: they are the one change that is
    // expressed by an absence, which the merge above cannot carry.
    for (const path of deletedPaths) {
      currentFiles.delete(path);
    }

    // CAMBIO 2 — telemetría del batching, acumulada a lo largo de los intentos.
    let totalErrors = 0;
    let fixCalls = 0;
    // Paths que una reparación escribió estando ausentes (recreaciones). Los
    // deletes se aplican UNA sola vez, arriba, y el bucle no vuelve a tocarlos:
    // un archivo recreado por el repair sobrevive dentro del verify. Lo que hay
    // que impedir es que el caller lo re-borre al persistir, y para eso viaja
    // en el resultado.
    const recreatedPaths: string[] = [];
    // Paths restaurados byte-a-byte desde `originalFiles` antes de llamar al
    // modelo (el plan los borró de más). Se acumulan aparte de las
    // recreaciones: el descuento de borrados del caller aplica a ambos, pero
    // la telemetría debe poder decir cuál fue determinista y cuál la escribió
    // el modelo.
    const restoredPaths: string[] = [];

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Cancelación: si el run fue abortado, no arrancamos otro compile ni fix.
      // Propagamos como AbortError para que el caller lo distinga de un fallo de
      // compilación y NO persista ni lance fixes post-cancelación.
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

      const result = await this.tryCompile(currentFiles, signal);

      if (result.success) {
        console.log('[Verifier] telemetry | totalErrors:', totalErrors, '| fixCalls:', fixCalls,
          '| saved:', Math.max(0, totalErrors - fixCalls),
          this.absentFilesTelemetry(restoredPaths, recreatedPaths));
        return {
          success: true,
          files: currentFiles,
          attempts: attempt,
          repairedFiles: this.diffPaths(currentFiles, originalFiles),
          totalErrors,
          fixCalls,
          recreatedPaths,
          restoredPaths,
        };
      }

      // CAMBIO 2 — cancelación durante el compile: si la señal se abortó mientras
      // corría tryCompile, NO contamos el intento como un fallo de compilación ni
      // disparamos el retry-handler (onRetry pinta "Fixing compile error…"). Se
      // intercepta ANTES del conteo de retries y de cualquier mensaje de fallo,
      // propagando el AbortError para que el caller cierre como cancelado.
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

      const errorMsg = result.error ?? 'Unknown compilation error';
      const errorDetail = result.errorDetail ?? null;

      // Lista COMPLETA de errores de este compile (esbuild los entrega todos).
      // Fallback: si el servidor no propagó la lista, usamos el errorDetail
      // singular; y si tampoco existe, sintetizamos uno del texto plano.
      const errorList: CompileErrorDetail[] =
        result.errorDetailList && result.errorDetailList.length > 0
          ? result.errorDetailList
          : errorDetail
            ? [errorDetail]
            : [{ message: errorMsg, file: null, line: null, lineText: null }];
      totalErrors += errorList.length;

      // Resolver de antemano el archivo culpable para poder loguearlo por intento.
      const errorFile = this.identifyErrorFile(errorMsg, errorDetail, currentFiles);
      console.log('[Verifier] attempt', attempt, '| errors:', errorList.length,
        '| first error file:', errorFile ?? 'UNKNOWN');

      onRetry?.(attempt, errorMsg.slice(0, 200));

      if (attempt === MAX_RETRIES) {
        console.log('[Verifier] telemetry | totalErrors:', totalErrors, '| fixCalls:', fixCalls,
          '| saved:', Math.max(0, totalErrors - fixCalls),
          this.absentFilesTelemetry(restoredPaths, recreatedPaths), '| result: FAILED');
        // Fallo definitivo: devolvemos el original intacto, así que no hay
        // reparaciones persistibles (repairedFiles vacío).
        return {
          success: false,
          error: errorMsg,
          files: originalFiles,
          errorFile,
          attempts: attempt,
          repairedFiles: [],
          totalErrors,
          fixCalls,
          recreatedPaths,
          restoredPaths,
        };
      }

      // CAMBIO 2 — reparación POR LOTES: agrupar todos los errores por clase y
      // reparar cada clase en una sola llamada LLM (con los contenidos completos
      // de todos los archivos implicados). Una cascada de 3 exports = 1 llamada.
      const batches = groupCompileErrors(
        errorList,
        (path) => currentFiles.get(path),
      );

      if (batches.length === 0) {
        // Ningún error resolvió a un archivo reparable: caer al fix de archivo
        // único histórico (usa regex sobre el texto) como último recurso.
        const fixed = await this.fixError(errorMsg, errorDetail, currentFiles, signal, designContext, blueprint);
        if (fixed) {
          fixCalls += 1;
          currentFiles = fixed;
        }
        continue;
      }

      for (const batch of batches) {
        // RESTAURACIÓN DETERMINISTA — antes de pedirle nada al modelo.
        //
        // Si el módulo ausente que cita el error existía en `originalFiles`,
        // el plan lo borró de más y su contenido EXACTO sigue a mano: pedirle
        // al modelo que lo "recree" es tirar la fuente de la verdad y aceptar
        // una reinvención (rutas y dependencias que el original no tenía).
        // Lo reponemos tal cual y el fixBatch ya lo ve presente, así que sólo
        // los ausentes que NUNCA existieron llegan al modelo bajo la regla 4.
        const restore = this.restoreErasedFromOriginal(batch, currentFiles, originalFiles);
        if (restore.restored.length > 0) {
          currentFiles = restore.files;
          for (const path of restore.restored) {
            if (!restoredPaths.includes(path)) restoredPaths.push(path);
          }
          console.log('[Verifier] restored_files=[' + restore.restored.join(',') +
            '] (deterministic, exact content from originalFiles)');
        }

        const before = currentFiles;
        const fixed = await this.fixBatch(
          batch, before, originalFiles, signal, designContext, blueprint
        );
        fixCalls += 1;
        if (fixed) {
          const created = [...fixed.keys()].filter((p) => !before.has(p));
          for (const path of created) {
            if (!recreatedPaths.includes(path)) recreatedPaths.push(path);
          }
          if (created.length > 0) {
            console.log('[Verifier] repair recreated absent file(s):', created.join(', '));
          }
          currentFiles = fixed;
        }
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      files: originalFiles,
      attempts: MAX_RETRIES,
      repairedFiles: [],
      totalErrors,
      fixCalls,
      recreatedPaths,
      restoredPaths,
    };
  }

  /**
   * Sufijo de telemetría para los módulos ausentes que el verify repuso.
   * Distingue las dos vías con nombres distintos, porque el coste y la
   * fiabilidad no son los mismos: `restored_files` es contenido EXACTO del
   * proyecto repuesto sin llamar al modelo; `recreated_files` es contenido
   * que escribió el modelo para un módulo que nunca existió. Cadena vacía
   * cuando no hubo ninguno de los dos, así que el log de siempre no cambia.
   */
  private static absentFilesTelemetry(
    restored: string[],
    recreated: string[]
  ): string {
    const parts: string[] = [];
    if (restored.length > 0) parts.push(`restored_files=[${restored.join(',')}]`);
    if (recreated.length > 0) parts.push(`recreated_files=[${recreated.join(',')}]`);
    return parts.length > 0 ? `| ${parts.join(' ')}` : '';
  }

  /**
   * Paths de `files` cuyo contenido difiere del que tenían en `original`
   * (contenido distinto o archivo nuevo). Orden estable de inserción.
   */
  private static diffPaths(
    files: Map<string, string>,
    original: Map<string, string>
  ): string[] {
    const diff: string[] = [];
    for (const [path, content] of files) {
      if (!original.has(path) || original.get(path) !== content) {
        diff.push(path);
      }
    }
    return diff;
  }

  private static async tryCompile(
    files: Map<string, string>,
    signal?: AbortSignal
  ): Promise<{ success: boolean; error?: string; errorDetail?: CompileErrorDetail | null; errorDetailList?: CompileErrorDetail[] | null }> {
    try {
      console.log('[Verifier] COMPILING KEYS:', [...files.keys()]);
      const filesObj: Record<string, string> = {};
      for (const [path, content] of files) {
        filesObj[path] = content;
      }

      const result = await platformService.compileSrc(filesObj, signal);

      if (result.error) {
        return {
          success: false,
          error: result.error,
          errorDetail: result.errorDetail ?? null,
          errorDetailList: result.errorDetailList ?? null,
        };
      }

      return { success: true };
    } catch (e) {
      // Una cancelación durante el compile debe propagarse, no disfrazarse de
      // error de compilación (que dispararía un fixError post-cancelación).
      if (isAbortError(e)) throw e;
      return { success: false, error: String(e) };
    }
  }

  /**
   * Resuelve el archivo culpable de un error de compilación. Prefiere el
   * errorDetail estructurado que propaga esbuild (file exacto); cae al regex
   * sobre el texto del error sólo como fallback cuando no hay location.
   */
  private static identifyErrorFile(
    error: string,
    errorDetail: CompileErrorDetail | null,
    files: Map<string, string>
  ): string | null {
    // 1. Preferir el archivo exacto que reporta esbuild vía errorDetail.
    if (errorDetail?.file && files.has(errorDetail.file)) {
      return errorDetail.file;
    }

    // 2. Fallback: regex sobre el texto del error (comportamiento histórico).
    const fileMatch = error.match(/(?:src\/[\w/.-]+\.[tj]sx?|[\w/.-]+\.[tj]sx?)/);
    const regexFile = fileMatch?.[0];
    if (regexFile && files.has(regexFile)) {
      return regexFile;
    }

    return null;
  }

  /**
   * REFORMA DEL CONTRATO — archivos del proyecto CITADOS en el texto de los
   * errores del lote, distintos de los que esbuild culpó.
   *
   * Para "No matching export in "virtual:src/pages/Foo.tsx" for import
   * "default"", esbuild sitúa el error en el importador y nombra el módulo
   * ofensor dentro del mensaje, con el prefijo del namespace virtual. Esa es la
   * única pista del archivo que DEBE recibir el export; sin resolverla y
   * adjuntar su contenido, la regla de dirección del prompt es inejecutable y
   * la única salida que le queda al modelo es borrar el import.
   *
   * Sólo devuelve paths que existen realmente como key del proyecto — un módulo
   * inexistente (Could not resolve "./nope") no resuelve a nada y cae, por
   * diseño, en la regla 4 (última instancia, con reporte explícito).
   */
  private static referencedProjectFiles(
    batch: RepairBatch,
    files: Map<string, string>
  ): { path: string; content: string }[] {
    const blamed = new Set(batch.files.map((f) => f.path));
    const out: { path: string; content: string }[] = [];
    const seen = new Set<string>();

    for (const err of batch.errors) {
      const message = err.message ?? '';
      // Todo segmento entrecomillado del mensaje es candidato a path.
      for (const m of message.matchAll(/"([^"]+)"|'([^']+)'/g)) {
        const raw = (m[1] ?? m[2] ?? '').trim();
        if (!raw) continue;
        const path = raw.replace(/^virtual:/, '');
        if (blamed.has(path) || seen.has(path)) continue;
        const content = files.get(path);
        if (content == null) continue; // no es un archivo del proyecto
        seen.add(path);
        out.push({ path, content });
      }
    }

    return out;
  }

  /**
   * ARCHIVOS AUSENTES citados por el error — el agujero que dejaba fuera
   * `referencedProjectFiles`.
   *
   * Un delete excesivo del Architect borra un módulo que otros archivos siguen
   * importando; el compile falla con `Cannot resolve "@/components/X" from
   * "src/pages/Index.tsx"`. Ese path NO está en `files`, así que
   * `referencedProjectFiles` lo descartaba (`content == null` → continue) y
   * nunca entraba en el Set `known` del merge: cuando el modelo RECREABA el
   * archivo — que es la reparación correcta, porque la regla 2 le prohíbe
   * borrar el import — su bloque se tiraba en silencio y el siguiente compile
   * repetía el mismo error hasta agotar los intentos.
   *
   * Resolvemos el specifier a los paths que el compilador habría probado y los
   * declaramos ESCRIBIBLES. `universe` es el mapa PREVIO al intent (originalFiles):
   * si el archivo existía antes, sabemos su path exacto — es el que el plan
   * borró — y aceptamos sólo ese; si nunca existió, aceptamos los candidatos
   * derivados del import (no son rutas inventadas por el modelo: salen del
   * código).
   */
  private static missingReferencedPaths(
    batch: RepairBatch,
    files: Map<string, string>,
    universe: Map<string, string>
  ): { path: string; writable: string[]; wasDeleted: boolean }[] {
    const seen = new Set<string>();
    const out: { path: string; writable: string[]; wasDeleted: boolean }[] = [];

    for (const err of batch.errors) {
      const message = err.message ?? '';
      const importer = err.file ?? null;
      for (const m of message.matchAll(/"([^"]+)"|'([^']+)'/g)) {
        const raw = (m[1] ?? m[2] ?? '').trim().replace(/^virtual:/, '');
        const candidates = candidatePathsFor(raw, importer);
        if (candidates.length === 0) continue;
        // El módulo existe (por cualquiera de sus formas): no falta nada.
        if (candidates.some((c) => files.has(c))) continue;
        const historical = candidates.find((c) => universe.has(c));
        const chosen = historical ?? candidates[0];
        if (seen.has(chosen)) continue;
        seen.add(chosen);
        out.push({
          path: chosen,
          writable: historical ? [historical] : candidates,
          wasDeleted: historical != null,
        });
      }
    }

    return out;
  }

  /**
   * RESTAURACIÓN DETERMINISTA de los archivos que el plan borró de más.
   *
   * `missingReferencedPaths` ya distingue los dos casos de módulo ausente:
   * `wasDeleted` marca el que existía en el mapa PREVIO al intent (`universe`
   * = originalFiles) y por tanto tiene contenido conocido, byte a byte. Para
   * ése la reparación correcta no es generativa: se repone el original y se
   * acabó. Pasarlo por el modelo bajo la regla 4 produce un archivo
   * PLAUSIBLE pero distinto — con rutas que no existen y dependencias nuevas —
   * cuando la fuente de la verdad estaba disponible.
   *
   * Los ausentes que nunca existieron (`wasDeleted === false`) NO se tocan
   * aquí: no hay nada que restaurar y siguen su camino al modelo.
   *
   * Devuelve un mapa nuevo sólo si hubo algo que restaurar (si no, el mismo
   * que entró) más la lista de paths repuestos.
   */
  private static restoreErasedFromOriginal(
    batch: RepairBatch,
    files: Map<string, string>,
    universe: Map<string, string>
  ): { files: Map<string, string>; restored: string[] } {
    const restored: string[] = [];
    let out = files;

    for (const ref of this.missingReferencedPaths(batch, files, universe)) {
      if (!ref.wasDeleted) continue; // nunca existió → regla 4, lo escribe el modelo
      const original = universe.get(ref.path);
      if (original == null) continue; // defensivo: wasDeleted implica que está
      if (out === files) out = new Map<string, string>(files);
      out.set(ref.path, original);
      restored.push(ref.path);
    }

    return { files: out, restored };
  }

  /**
   * CAMBIO 2 — reparación por lotes. Repara TODOS los errores de una misma
   * clase en una única llamada LLM, pasando los contenidos completos de cada
   * archivo implicado. El modelo devuelve cada archivo corregido delimitado; los
   * parseamos y los mezclamos sobre `files`. El recompile del bucle valida todo
   * junto.
   */
  private static async fixBatch(
    batch: RepairBatch,
    files: Map<string, string>,
    // Mapa PREVIO al intent: la única fuente que conoce el path exacto de un
    // archivo que el plan borró y que el error sigue citando.
    universe: Map<string, string>,
    signal?: AbortSignal,
    designContext: string = '',
    blueprint: string = ''
  ): Promise<Map<string, string> | null> {
    if (batch.files.length === 0) return null;

    // REFORMA DEL CONTRATO — archivos REFERENCIADOS por el error.
    //
    // esbuild reporta "No matching export in X for import Y" en el archivo
    // IMPORTADOR (location.file = src/App.tsx), no en X. El lote sólo lleva los
    // archivos que esbuild culpó, así que hasta ahora el modelo recibía
    // únicamente el consumidor: la única "reparación" que podía escribir era
    // borrar el import (y con él la ruta). Resolvemos los paths del proyecto
    // citados en el texto del error — esbuild los escribe con el prefijo del
    // namespace virtual ("virtual:src/pages/Foo.tsx") — y los adjuntamos al
    // prompt para que la regla de dirección (corregir X, no sus importadores)
    // sea EJECUTABLE y no una instrucción imposible de cumplir.
    const refFiles = this.referencedProjectFiles(batch, files);
    // Y los citados que NO existen (borrados por un delete excesivo o nunca
    // escritos): sin declararlos escribibles, la recreación que devuelve el
    // modelo se descarta en el merge y el compile repite el mismo error.
    const missingRefs = this.missingReferencedPaths(batch, files, universe);

    const systemPrompt =
      `You are an expert React + TypeScript engineer fixing compilation errors.\n` +
      `Several files share the SAME class of error ("${batch.label}") — apply the ` +
      `same kind of fix to each.\n\n` +
      `NON-DESTRUCTIVE REPAIR CONTRACT — these rules override everything else:\n` +
      `1. PRESERVE INTENT. A repair fixes how the code is WIRED, never what it ` +
      `DOES. Every feature, route, screen and behaviour present in the input must ` +
      `still be present in your output.\n` +
      `2. NEVER DELETE TO SILENCE AN ERROR. You are FORBIDDEN to remove an ` +
      `import, a route, a JSX usage, a prop, a handler or any other reference to ` +
      `a symbol in order to make the compiler stop complaining. Deleting the ` +
      `consumer is never a valid repair — it compiles clean and amputates the ` +
      `feature. If your fix makes a file shorter by dropping functionality, it is ` +
      `the WRONG fix.\n` +
      `3. FIX THE SOURCE, NOT THE CONSUMER. For "No matching export in X for ` +
      `import Y", the file to correct is X: ADD the missing export Y to X (for ` +
      `import "default", add \`export default <Component>\` to X). Do NOT edit the ` +
      `files that import X. Rewriting the import shape in the consumer is only ` +
      `acceptable when X genuinely exports the symbol under another shape (named ` +
      `vs default) — and even then the symbol must keep being imported and used.\n` +
      `4. AN ABSENT MODULE IS RECREATED, NOT UNWIRED. If the module file ` +
      `itself is missing from the project, the repair is to WRITE IT at the ` +
      `exact path given below, with a complete, working implementation ` +
      `consistent with how it is imported and used. Emit it as one more ` +
      `===FILE: <path>=== block.\n` +
      `5. LAST RESORT, AND REPORT IT. Only if the referenced symbol exists ` +
      `NOWHERE in the project AND recreating the module is impossible may you ` +
      `remove the reference. When you do, you MUST ` +
      `emit, before any file block, a line exactly like:\n` +
      `===REPAIR-NOTE=== removed <symbol> from <path>: <module> does not exist in ` +
      `the project\n\n` +
      `OUTPUT: return the COMPLETE corrected content of EVERY file you were ` +
      `given, each wrapped EXACTLY as:\n` +
      `===FILE: <path>===\n<full file content>\n===END===\n` +
      `No markdown fences, no explanation outside the markers. Preserve every ` +
      `file's path exactly. If a file needs no change, still return it unchanged.`;

    const errorLines = batch.errors
      .map((e) => {
        const at = e.line != null ? ` (line ${e.line})` : '';
        const hint = e.lineText ? `\n    → ${e.lineText.trim()}` : '';
        return `- [${e.file ?? 'unknown'}]${at} ${e.message ?? ''}${hint}`;
      })
      .join('\n');

    // Preferir el contenido VIVO del map (un lote previo en este mismo intento
    // pudo tocar un archivo compartido); caer al snapshot del agrupador si falta.
    const fileBlocks = batch.files
      .map((f) => `===FILE: ${f.path}===\n${files.get(f.path) ?? f.content}\n===END===`)
      .join('\n\n');

    // Los archivos citados en el error (el X de "No matching export in X") van
    // en la MISMA lista de bloques editables: son, por la regla de dirección, el
    // destino natural de la corrección.
    const refBlocks = refFiles
      .map((f) => `===FILE: ${f.path}===\n${f.content}\n===END===`)
      .join('\n\n');

    // Los ausentes no pueden llevar bloque (no hay contenido): van nombrados,
    // con la instrucción explícita de recrearlos en ese path exacto.
    const missingNote = missingRefs.length > 0
      ? `The error text references ${missingRefs.length} module(s) that are ` +
        `ABSENT from the project: ${missingRefs.map((r) => r.path).join(', ')}. ` +
        `The code that imports them must keep working, so per rule 4 the fix is ` +
        `to RECREATE each one at that EXACT path — a complete implementation ` +
        `matching how it is imported and used (props, default vs named export, ` +
        `the JSX it renders) — and return it as its own ===FILE: <path>=== ` +
        `block. Do NOT remove the imports or the usages.` +
        (missingRefs.some((r) => r.wasDeleted)
          ? ` ${missingRefs.filter((r) => r.wasDeleted).map((r) => r.path).join(', ')} ` +
            `existed in this project until this change removed it, so restore ` +
            `equivalent content, not a placeholder.`
          : '') +
        `\n\n`
      : '';

    const directionNote = refFiles.length > 0
      ? `The error text points at ${refFiles.length} other project file(s), ` +
        `included below: ${refFiles.map((f) => f.path).join(', ')}. Per rule 3, ` +
        `these are most likely where the fix belongs (add the missing export ` +
        `there) — NOT the file esbuild reported the error in.\n\n`
      : '';

    const userMessage =
      `${batch.errors.length} compilation error(s) of the same class ` +
      `("${batch.label}") across ${batch.files.length} file(s):\n${errorLines}\n\n` +
      `These files all exhibit the same mismatch — fix them all consistently.\n` +
      `Repair by ADDING what is missing, never by removing what is used.\n\n` +
      directionNote +
      missingNote +
      `FILES:\n${fileBlocks}${refBlocks ? `\n\n${refBlocks}` : ''}\n\n` +
      `Return the complete corrected content of every file, each wrapped in its ` +
      `===FILE: <path>=== / ===END=== markers:`;

    // CAMBIO 3 — ruteo por clase: sintaxis/import-mismatch → Haiku; resto → Sonnet.
    const model = pickRepairModel(batch.label);

    // Prompt caching (REMATE): system = [ stablePrefix, blueprintBlock,
    // systemPrompt ]. El stablePrefix (reglas + brief) es idéntico al del
    // Architect y el Implementer y estable ENTRE intents; el blueprintBlock
    // (mutable) va aparte para no romper ese cache_read cruzado. En reparaciones
    // Sonnet se sirve desde cache_read; en Haiku el prefijo se cachea aparte (por
    // modelo). Sólo se antepone cuando el caller aportó brief/blueprint — si no,
    // cachedSystemBlocks colapsa a un solo bloque = system prompt de hoy.
    const stablePrefix = (designContext || blueprint)
      ? buildProjectContextPrefix(designContext)
      : '';
    const blueprintBlock = buildBlueprintBlock(blueprint);

    try {
      // CAMBIO 2 (telemetría de repairs) — los archivos que ORIGINARON el error
      // (los que esbuild culpó) viajan como cabecera; server.js compara la
      // respuesta del modelo contra los bloques enviados y emite en Render el
      // sufijo `[repair] error_files=[...] modified_files=[...]`. Un
      // modified_files con archivos fuera de error_files (o, en el caso que nos
      // ocupa, un modified_files que sólo toca el importador) queda visible sin
      // inspección manual.
      const errorFilePaths = [...new Set(
        batch.errors.map((e) => e.file).filter((f): f is string => !!f)
      )];
      // Los paths ausentes viajan en su propia cabecera: server.js marca como
      // `recreated_files` los bloques que el modelo devuelve para ellos, así que
      // una recreación queda visible en el log de Render igual que un modify.
      const repairHeaders: Record<string, string> = {};
      if (errorFilePaths.length > 0) {
        repairHeaders['x-forge-repair-error-files'] = errorFilePaths.join(',');
      }
      if (missingRefs.length > 0) {
        repairHeaders['x-forge-repair-missing-files'] =
          missingRefs.flatMap((r) => r.writable).join(',');
      }
      const response = await platformService.callForgeChat({
        model,
        max_tokens: 8192,
        system: cachedSystemBlocks(stablePrefix, blueprintBlock, systemPrompt),
        messages: [{ role: 'user', content: userMessage }],
      }, signal, Object.keys(repairHeaders).length > 0 ? repairHeaders : undefined);

      const data = await response.json();
      console.log('[Verifier] fixBatch model=' + model + ' class="' + batch.label + '" usage:',
        data.usage?.input_tokens ?? 0, 'in /',
        data.usage?.output_tokens ?? 0, 'out |',
        'cache_read', data.usage?.cache_read_input_tokens ?? 0, '|',
        batch.files.length, 'file(s),',
        batch.errors.length, 'error(s)');

      if (data.error) {
        console.error('[Verifier] Batch fix API error:', data.error);
        return null;
      }

      const text: string = data.content?.[0]?.text ?? '';
      const parsed = this.parseBatchResponse(text);

      // Fallback: exactamente un archivo y el modelo devolvió el crudo sin
      // marcadores → tratar la respuesta entera como ese archivo.
      // (con refFiles presentes la respuesta cruda es ambigua: podría ser
      // cualquiera de los archivos, así que el fallback se desactiva).
      if (parsed.size === 0 && batch.files.length === 1 && refFiles.length === 0 && missingRefs.length === 0) {
        const only = batch.files[0].path;
        const newFiles = new Map<string, string>(files);
        newFiles.set(only, this.stripCodeFences(text));
        return newFiles;
      }

      if (parsed.size === 0) {
        console.warn('[Verifier] fixBatch: no parseable files in response');
        return null;
      }

      const newFiles = new Map<string, string>(files);
      // Aceptamos los archivos del lote MÁS los referenciados por el error: sin
      // esto último, la corrección dirigida al archivo X (añadir su export) se
      // descartaría en silencio y el repair volvería a quedarse sin salida
      // válida distinta de borrar el import.
      const known = new Set([
        ...batch.files.map((f) => f.path),
        ...refFiles.map((f) => f.path),
        // Los ausentes citados por el error: aceptar su recreación es la única
        // salida que no pasa por amputar el import.
        ...missingRefs.flatMap((r) => r.writable),
      ]);
      for (const [path, content] of parsed) {
        // Sólo aceptamos archivos que estaban en el lote (o citados por el
        // error) — el modelo no debe inventar rutas nuevas.
        if (!known.has(path)) continue;
        // Una recreación vacía no repara nada y deja un módulo sin exports:
        // mejor dejar que el error persista y sea visible.
        if (!files.has(path) && content.trim() === '') continue;
        newFiles.set(path, content);
      }
      return newFiles;
    } catch (e) {
      if (isAbortError(e)) throw e; // cancelación: no seguir intentando.
      console.error('[Verifier] Batch fix attempt failed:', e);
      return null;
    }
  }

  /**
   * Parsea la respuesta multi-archivo del fixBatch. Formato:
   *   ===FILE: <path>===\n<content>\n===END===
   * Tolerante: recorta fences accidentales alrededor del bloque completo.
   */
  private static parseBatchResponse(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const re = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===END===/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const path = m[1].trim();
      const content = this.stripCodeFences(m[2]);
      if (path) out.set(path, content);
    }
    return out;
  }

  private static async fixError(
    error: string,
    errorDetail: CompileErrorDetail | null,
    files: Map<string, string>,
    signal?: AbortSignal,
    designContext: string = '',
    blueprint: string = ''
  ): Promise<Map<string, string> | null> {
    const errorFile = this.identifyErrorFile(error, errorDetail, files);
    const fileContent = errorFile ? (files.get(errorFile) ?? '') : '';

    if (!errorFile || !fileContent) {
      console.warn(
        '[Verifier] fixError: could not identify offending file for error:',
        error.slice(0, 200)
      );
      return null;
    }

    const systemPrompt = `You are an expert React + TypeScript engineer fixing a compilation error.
Return ONLY the complete corrected file content. No markdown fences, no explanation. Just the raw file.`;

    // Incluir línea y lineText exactos cuando esbuild los propaga: le da al
    // modelo el punto preciso del error en lugar de sólo el mensaje.
    const locationHint =
      errorDetail?.line != null && errorDetail.lineText
        ? `ERROR AT LINE ${errorDetail.line}: ${errorDetail.lineText}\n\n`
        : '';

    const userMessage =
      `COMPILATION ERROR:\n${error.slice(0, 1000)}\n\n` +
      locationHint +
      `FILE: ${errorFile}\n` +
      `CURRENT CONTENT:\n${fileContent}\n\n` +
      `Fix the error and return the complete corrected file content:`;

    // CAMBIO 3 — misma política de ruteo que fixBatch, clasificando el mensaje
    // suelto con la misma función que usa el agrupador.
    const model = pickRepairModel(labelForError(error));

    // Mismo prefijo cacheado compartido que fixBatch (REMATE): stable aparte del
    // blueprint mutable para preservar el cache_read entre intents.
    const stablePrefix = (designContext || blueprint)
      ? buildProjectContextPrefix(designContext)
      : '';
    const blueprintBlock = buildBlueprintBlock(blueprint);

    try {
      const response = await platformService.callForgeChat({
        model,
        max_tokens: 8192,
        system: cachedSystemBlocks(stablePrefix, blueprintBlock, systemPrompt),
        messages: [{ role: 'user', content: userMessage }],
      }, signal);

      const data = await response.json();
      console.log('[Verifier] fixError model=' + model + ' usage:',
        data.usage?.input_tokens ?? 0, 'in /',
        data.usage?.output_tokens ?? 0, 'out |',
        'cache_read', data.usage?.cache_read_input_tokens ?? 0);

      if (data.error) {
        console.error('[Verifier] Fix API error:', data.error);
        return null;
      }

      const text: string = data.content?.[0]?.text ?? '';
      const fixedContent = this.stripCodeFences(text);

      const newFiles = new Map<string, string>(files);
      newFiles.set(errorFile, fixedContent);
      return newFiles;
    } catch (e) {
      if (isAbortError(e)) throw e; // cancelación: no seguir intentando.
      console.error('[Verifier] Fix attempt failed:', e);
      return null;
    }
  }

  private static stripCodeFences(text: string): string {
    const fenced = text.match(/```(?:tsx?|jsx?|typescript|javascript)?\s*([\s\S]*?)```/);
    if (fenced) return fenced[1].trim();
    return text.trim();
  }
}
