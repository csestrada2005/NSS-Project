import { resolvePatterns } from './patterns/resolver';

export class PatternInjector {
  static inject(patternIds: string[]): string {
    if (!patternIds || patternIds.length === 0) return '';

    const result = resolvePatterns(patternIds);

    if (result.dropped.length > 0) {
      console.log(`[PatternInjector] Dropped patterns: ${result.dropped.join(', ')}`);
    }

    if (!result.context) return '';

    return `\n\nCRITICAL ARCHITECTURE RULES — FOLLOW EXACTLY:\n${result.context}`;
  }
}
