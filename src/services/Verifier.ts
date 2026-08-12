import { platformService } from './PlatformService';
import type { CompileErrorDetail } from './PlatformService';
import { isAbortError } from '../utils/abort';
import { groupCompileErrors, labelForError } from '../utils/groupCompileErrors';
import type { RepairBatch } from '../utils/groupCompileErrors';
import { cachedSystem } from './promptCache';

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
    maxRetries: number = 3
  ): Promise<VerifyResult> {
    const MAX_RETRIES = Math.max(1, maxRetries);
    // Compilar el proyecto COMPLETO con los cambios aplicados encima.
    // Compilar solo modifiedFiles causa "No entrypoint found" porque
    // main.tsx no suele estar entre los archivos modificados.
    let currentFiles = new Map<string, string>(originalFiles);
    for (const [path, content] of modifiedFiles) {
      currentFiles.set(path, content);
    }

    // CAMBIO 2 — telemetría del batching, acumulada a lo largo de los intentos.
    let totalErrors = 0;
    let fixCalls = 0;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // Cancelación: si el run fue abortado, no arrancamos otro compile ni fix.
      // Propagamos como AbortError para que el caller lo distinga de un fallo de
      // compilación y NO persista ni lance fixes post-cancelación.
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');

      const result = await this.tryCompile(currentFiles, signal);

      if (result.success) {
        console.log('[Verifier] telemetry | totalErrors:', totalErrors, '| fixCalls:', fixCalls,
          '| saved:', Math.max(0, totalErrors - fixCalls));
        return {
          success: true,
          files: currentFiles,
          attempts: attempt,
          repairedFiles: this.diffPaths(currentFiles, originalFiles),
          totalErrors,
          fixCalls,
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
          '| saved:', Math.max(0, totalErrors - fixCalls), '| result: FAILED');
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
        const fixed = await this.fixError(errorMsg, errorDetail, currentFiles, signal);
        if (fixed) {
          fixCalls += 1;
          currentFiles = fixed;
        }
        continue;
      }

      for (const batch of batches) {
        const fixed = await this.fixBatch(batch, currentFiles, signal);
        fixCalls += 1;
        if (fixed) currentFiles = fixed;
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
    };
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
   * CAMBIO 2 — reparación por lotes. Repara TODOS los errores de una misma
   * clase en una única llamada LLM, pasando los contenidos completos de cada
   * archivo implicado. El modelo devuelve cada archivo corregido delimitado; los
   * parseamos y los mezclamos sobre `files`. El recompile del bucle valida todo
   * junto.
   */
  private static async fixBatch(
    batch: RepairBatch,
    files: Map<string, string>,
    signal?: AbortSignal
  ): Promise<Map<string, string> | null> {
    if (batch.files.length === 0) return null;

    const systemPrompt =
      `You are an expert React + TypeScript engineer fixing compilation errors.\n` +
      `Several files share the SAME class of error ("${batch.label}") — apply the ` +
      `same kind of fix to each. Return the COMPLETE corrected content of EVERY ` +
      `file you were given, each wrapped EXACTLY as:\n` +
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

    const userMessage =
      `${batch.errors.length} compilation error(s) of the same class ` +
      `("${batch.label}") across ${batch.files.length} file(s):\n${errorLines}\n\n` +
      `These files all exhibit the same mismatch — fix them all consistently.\n\n` +
      `FILES:\n${fileBlocks}\n\n` +
      `Return the complete corrected content of every file, each wrapped in its ` +
      `===FILE: <path>=== / ===END=== markers:`;

    // CAMBIO 3 — ruteo por clase: sintaxis/import-mismatch → Haiku; resto → Sonnet.
    const model = pickRepairModel(batch.label);

    try {
      const response = await platformService.callForgeChat({
        model,
        max_tokens: 8192,
        // Prompt caching (CAMBIO 1): el system prompt de reparación es estático
        // salvo la etiqueta de clase; se cachea el prefijo entre lotes.
        system: cachedSystem(systemPrompt),
        messages: [{ role: 'user', content: userMessage }],
      }, signal);

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
      if (parsed.size === 0 && batch.files.length === 1) {
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
      const known = new Set(batch.files.map((f) => f.path));
      for (const [path, content] of parsed) {
        // Sólo aceptamos archivos que estaban en el lote — el modelo no debe
        // inventar rutas nuevas.
        if (known.has(path)) newFiles.set(path, content);
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
    signal?: AbortSignal
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

    try {
      const response = await platformService.callForgeChat({
        model,
        max_tokens: 8192,
        system: cachedSystem(systemPrompt),
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
