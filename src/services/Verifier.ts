import { platformService } from './PlatformService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RetryCallback = (attempt: number, errorSummary: string) => void;

export interface VerifyResult {
  success: boolean;
  error?: string;
  files: Map<string, string>;
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
    let currentFiles = new Map<string, string>(modifiedFiles);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const result = await this.tryCompile(currentFiles);

      if (result.success) {
        return { success: true, files: currentFiles };
      }

      const errorMsg = result.error ?? 'Unknown compilation error';
      onRetry?.(attempt, errorMsg.slice(0, 200));

      if (attempt === MAX_RETRIES) {
        return { success: false, error: errorMsg, files: originalFiles };
      }

      const fixed = await this.fixError(errorMsg, currentFiles);
      if (fixed) {
        currentFiles = fixed;
      }
    }

    return { success: false, error: 'Max retries exceeded', files: originalFiles };
  }

  private static async tryCompile(
    files: Map<string, string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const filesObj: Record<string, string> = {};
      for (const [path, content] of files) {
        filesObj[path] = content;
      }

      const result = await platformService.compileSrc(filesObj);

      if (result.error) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  private static async fixError(
    error: string,
    files: Map<string, string>
  ): Promise<Map<string, string> | null> {
    // Try to identify the offending file from the error message
    const fileMatch = error.match(/(?:src\/[\w/.-]+\.[tj]sx?|[\w/.-]+\.[tj]sx?)/);
    const errorFile = fileMatch?.[0] ?? '';
    const fileContent = errorFile ? (files.get(errorFile) ?? '') : '';

    if (!errorFile || !fileContent) {
      return null;
    }

    const systemPrompt = `You are an expert React + TypeScript engineer fixing a compilation error.
Return ONLY the complete corrected file content. No markdown fences, no explanation. Just the raw file.`;

    const userMessage =
      `COMPILATION ERROR:\n${error.slice(0, 1000)}\n\n` +
      `FILE: ${errorFile}\n` +
      `CURRENT CONTENT:\n${fileContent}\n\n` +
      `Fix the error and return the complete corrected file content:`;

    try {
      const response = await platformService.callChat({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const data = await response.json();

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
