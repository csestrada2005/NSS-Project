import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator } from '@/services/AIOrchestrator';
import { setForgeLang } from '@/i18n/forge/lang';

// Modo Chat (2026-10-08): la IA SÓLO responde. Aunque el pedido sea de
// construir (y el clasificador diría new_feature), no se clasifica, no se
// planea y no se escribe nada.

let control: FakeFetchControl;

const run = (input: string, chatOnly: boolean) =>
  AIOrchestrator.parseUserCommand(
    input, new Map<string, string>(), null, 'chat-mode-project',
    undefined, undefined, undefined, undefined, undefined, undefined, false, null, [], [],
    chatOnly
  );

const systemOf = (b: Record<string, unknown>) =>
  Array.isArray(b.system) ? b.system.map((x) => (x as { text?: string }).text ?? '').join('\n') : String(b.system ?? '');

describe('Modo Chat — sólo responde (e2e con LLM falso)', () => {
  beforeEach(() => {
    setForgeLang('es');
    control = installFakeFetch();
  });
  afterEach(() => control.restore());

  it('un pedido de construir en modo Chat se contesta sin clasificar ni escribir', async () => {
    const result = await run('Agrega una sección de testimonios con 3 tarjetas', true);
    expect(result.outcome).toBe('success');
    expect(result.modifiedFiles).toEqual([]);
    expect(result.chatResponse).toContain('Adjúntala con el clip');
    const systems = control.forgeBodies.map(systemOf);
    expect(systems.some((s) => s.includes('intent classifier'))).toBe(false);
    expect(systems.some((s) => s.includes('software architect'))).toBe(false);
    expect(systems.some((s) => s.includes('implementing one specific step'))).toBe(false);
    expect(systems.filter((s) => s.includes("Wyrd Forge's AI assistant"))).toHaveLength(1);
  });

  it('los atajos viejos ("build a…") tampoco construyen en modo Chat', async () => {
    const result = await run('build a landing page for a bakery', true);
    expect(result.modifiedFiles).toEqual([]);
    expect(control.forgeBodies.some((b) => systemOf(b).includes("Wyrd Forge's AI assistant"))).toBe(true);
  });

  it('el mismo pedido en Automático sí pasa por el clasificador y construye', async () => {
    const result = await run('Agrega una sección de testimonios con 3 tarjetas', false);
    expect(result.outcome).toBe('success');
    expect(control.forgeBodies.some((b) => systemOf(b).includes('intent classifier'))).toBe(true);
    expect(result.modifiedFiles.length).toBeGreaterThan(0);
  });
});
