import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator, type ForgePhase } from '@/services/AIOrchestrator';
import type { ProjectAsset } from '@/services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Tarjeta de progreso (2026-10-08, P2): el orquestador avisa cada etapa real,
// y la frase del clasificador llega limpia.

let control: FakeFetchControl;

const run = (input: string, opts: { chatOnly?: boolean; attachments?: ProjectAsset[] } = {}) => {
  const phases: [ForgePhase, string | undefined][] = [];
  const promise = AIOrchestrator.parseUserCommand(
    input, new Map<string, string>(), null, 'phases-project',
    undefined, undefined, undefined, undefined, undefined, undefined, false, null, [],
    opts.attachments ?? [], opts.chatOnly ?? false,
    (phase, detail) => phases.push([phase, detail])
  );
  return promise.then((result) => ({ result, phases }));
};

const PDF: ProjectAsset = {
  id: 'b', kind: 'document', public_url: '', mime_type: 'application/pdf', size_bytes: 1, original_size: 1,
  original_name: 'menu.pdf', width: null, height: null, created_at: '2026-10-08',
};

describe('Etapas para la tarjeta de progreso', () => {
  beforeEach(() => {
    setForgeLang('es');
    control = installFakeFetch();
  });
  afterEach(() => control.restore());

  it('un cambio: entendiendo → frase → plan → revisión', async () => {
    const { result, phases } = await run('Agrega dos secciones');
    expect(result.outcome).toBe('success');
    expect(phases.map(([p]) => p)).toEqual(['understanding', 'headline', 'planning', 'checking']);
    expect(phases[1][1]).toBe('Agregando las secciones de demostración…');
  });

  it('una pregunta en Automático: entendiendo → frase → pensando la respuesta', async () => {
    control.intentType = 'question';
    const { phases } = await run('¿Crees que esta foto sirve?');
    expect(phases.map(([p]) => p)).toEqual(['understanding', 'headline', 'answering']);
  });

  it('con un PDF adjunto, primero lo lee', async () => {
    const { phases } = await run('Haz el menú con este PDF', { attachments: [PDF] });
    expect(phases[0]).toEqual(['reading', 'menu.pdf']);
  });

  it('modo Chat: directo a pensar la respuesta', async () => {
    const { phases } = await run('¿Están bien los precios?', { chatOnly: true });
    expect(phases.map(([p]) => p)).toEqual(['answering']);
  });
});
