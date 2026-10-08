import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator } from '@/services/AIOrchestrator';
import { setForgeLang } from '@/i18n/forge/lang';

// Modo Plan (2026-10-09, P2 + L1 de Samuel): "Proponme un plan…" da "Plan
// listo" aunque el clasificador diga pregunta; las preguntas de verdad se
// contestan; y "Build a…" ya no escribe un PLAN.md por un atajo viejo.

let control: FakeFetchControl;

const systemOf = (b: Record<string, unknown>) =>
  Array.isArray(b.system) ? b.system.map((x) => (x as { text?: string }).text ?? '').join('\n') : String(b.system ?? '');

const run = (input: string, planMode: boolean, decide = vi.fn().mockResolvedValue('approved')) =>
  AIOrchestrator.parseUserCommand(
    input, new Map<string, string>(), null, 'plan-mode-project',
    undefined, undefined, undefined, undefined, undefined,
    decide as never, planMode, null, [], [], false
  ).then((result) => ({ result, decide }));

describe('Modo Plan y preguntas', () => {
  beforeEach(() => {
    setForgeLang('es');
    control = installFakeFetch();
  });
  afterEach(() => control.restore());

  it('"Proponme un plan…" en modo Plan: aunque el clasificador diga pregunta, sale el plan para aprobar', async () => {
    control.intentType = 'question';
    const { decide } = await run('Proponme un plan para mejorar el estilo de las tarjetas', true);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(control.forgeBodies.some((b) => systemOf(b).includes("Wyrd Forge's AI assistant"))).toBe(false);
    const classifier = control.forgeBodies.find((b) => systemOf(b).includes('intent classifier'))!;
    expect(JSON.stringify(classifier.messages)).toContain('MODE: PLAN');
  });

  it('una pregunta de verdad en modo Plan se contesta', async () => {
    control.intentType = 'question';
    const { result, decide } = await run('¿Qué fuente usa el sitio?', true);
    expect(decide).not.toHaveBeenCalled();
    expect(result.chatResponse).toBeTruthy();
  });

  it('en Automático el clasificador no recibe la marca de modo Plan', async () => {
    await run('Agrega dos secciones', false);
    const classifier = control.forgeBodies.find((b) => systemOf(b).includes('intent classifier'))!;
    expect(JSON.stringify(classifier.messages)).not.toContain('MODE: PLAN');
  });

  it('"Build a…" ya no escribe un PLAN.md: pasa por el pipeline normal', async () => {
    const { result } = await run('Build a pricing section', false);
    expect(result.modifiedFiles).not.toContain('PLAN.md');
    expect(control.forgeBodies.some((b) => systemOf(b).includes('software architect'))).toBe(true);
  });
});
