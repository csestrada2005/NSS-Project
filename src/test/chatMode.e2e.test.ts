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

  it('pregunta por "el PDF" sin adjuntarlo: usa la copia guardada, sin lector', async () => {
    control.assets = [{
      id: 'b', kind: 'document', public_url: '', mime_type: 'application/pdf', size_bytes: 1, original_size: 1,
      original_name: 'menu_vertigo.pdf', width: null, height: null, created_at: '2026-10-08', has_reading: true,
    }];
    control.readings.set('b', { text: 'Rafting | $850\nRapel | $600', truncated: false });
    await run('¿Están bien los precios con el PDF?', true);
    const answer = control.forgeBodies.find((b) => systemOf(b).includes("Wyrd Forge's AI assistant"))!;
    const text = JSON.stringify(answer.messages);
    expect(text).toContain('SAVED READINGS');
    expect(text).toContain('Rafting | $850');
    expect(control.forgeBodies.some((b) => /You describe an image|You transcribe a document/.test(systemOf(b)))).toBe(false);
    // Regla: la respuesta no promete acciones.
    expect(systemOf(answer)).toContain('This reply CANNOT change files or run anything');
  });

  it('pregunta que no habla de archivos: no se piden copias', async () => {
    control.assets = [{
      id: 'b', kind: 'document', public_url: '', mime_type: 'application/pdf', size_bytes: 1, original_size: 1,
      original_name: 'menu_vertigo.pdf', width: null, height: null, created_at: '2026-10-08', has_reading: true,
    }];
    await run('¿Cómo cambio el color del botón?', true);
    expect(control.calls.some((u) => u.includes('/reading'))).toBe(false);
  });

  it('el mismo pedido en Automático sí pasa por el clasificador y construye', async () => {
    const result = await run('Agrega una sección de testimonios con 3 tarjetas', false);
    expect(result.outcome).toBe('success');
    expect(control.forgeBodies.some((b) => systemOf(b).includes('intent classifier'))).toBe(true);
    expect(result.modifiedFiles.length).toBeGreaterThan(0);
  });
});
