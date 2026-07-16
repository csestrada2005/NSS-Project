import { platformService } from './PlatformService';
import type { CompileErrorDetail } from './PlatformService';

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
}

// ---------------------------------------------------------------------------
// Verifier — compile-check loop with LLM-powered self-correction
// ---------------------------------------------------------------------------

export class Verifier {
  static async verify(
    modifiedFiles: Map<string, string>,
    originalFiles: Map<string, string>,
    onRetry?: RetryCallback
  ): Promise<VerifyResult> {
    const MAX_RETRIES = 3;
    // Compilar el proyecto COMPLETO con los cambios aplicados encima.
    // Compilar solo modifiedFiles causa "No entrypoint found" porque
    // main.tsx no suele estar entre los archivos modificados.
    let currentFiles = new Map<string, string>(originalFiles);
    for (const [path, content] of modifiedFiles) {
      currentFiles.set(path, content);
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.tryCompile(currentFiles);

      if (result.success) {
        return { success: true, files: currentFiles };
      }

      const errorMsg = result.error ?? 'Unknown compilation error';
      const errorDetail = result.errorDetail ?? null;

      // Resolver de antemano el archivo culpable para poder loguearlo por intento.
      const errorFile = this.identifyErrorFile(errorMsg, errorDetail, currentFiles);
      console.log('[Verifier] attempt', attempt, '| error file:', errorFile ?? 'UNKNOWN');

      onRetry?.(attempt, errorMsg.slice(0, 200));

      if (attempt === MAX_RETRIES) {
        return { success: false, error: errorMsg, files: originalFiles, errorFile };
      }

      const fixed = await this.fixError(errorMsg, errorDetail, currentFiles);
      if (fixed) {
        currentFiles = fixed;
      }
    }

    return { success: false, error: 'Max retries exceeded', files: originalFiles };
  }

  private static async tryCompile(
    files: Map<string, string>
  ): Promise<{ success: boolean; error?: string; errorDetail?: CompileErrorDetail | null }> {
    try {
      console.log('[Verifier] COMPILING KEYS:', [...files.keys()]);
      const filesObj: Record<string, string> = {};
      for (const [path, content] of files) {
        filesObj[path] = content;
      }

      const result = await platformService.compileSrc(filesObj);

      if (result.error) {
        return { success: false, error: result.error, errorDetail: result.errorDetail ?? null };
      }

      return { success: true };
    } catch (e) {
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

  private static async fixError(
    error: string,
    errorDetail: CompileErrorDetail | null,
    files: Map<string, string>
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

    try {
      const response = await platformService.callForgeChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();
      console.log('[Verifier] fixError usage:', data.usage?.input_tokens ?? 0, 'in /',
        data.usage?.output_tokens ?? 0, 'out');

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
