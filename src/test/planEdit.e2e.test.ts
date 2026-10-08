import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator, type PlanDecision } from '@/services/AIOrchestrator';
import { setForgeLang } from '@/i18n/forge/lang';

// "Revisar" el plan (2026-10-08, R1 de Samuel): el usuario edita el plan, la IA
// vuelve a planear con su versión y construye directo; sólo pregunta otra vez
// si el plan nuevo borra algo que el anterior no borraba.

let control: FakeFetchControl;

const systemOf = (b: Record<string, unknown>) =>
  Array.isArray(b.system) ? b.system.map((x) => (x as { text?: string }).text ?? '').join('\n') : String(b.system ?? '');

const run = (decide: (steps: unknown[]) => Promise<PlanDecision>) =>
  AIOrchestrator.parseUserCommand(
    'Proponme un plan para mejorar el estilo de las tarjetas',
    new Map<string, string>(), null, 'plan-edit-project',
    undefined, undefined, undefined, undefined, undefined,
    decide as never, true, null, [], [], false
  );

describe('Revisar el plan', () => {
  beforeEach(() => {
    setForgeLang('es');
    control = installFakeFetch();
  });
  afterEach(() => control.restore());

  it('editado: vuelve a planear con la versión del usuario y construye sin volver a preguntar', async () => {
    const decide = vi.fn().mockResolvedValueOnce({ kind: 'edited', text: '1. Primera sección\nDe las 3 opciones aplica A' });
    const result = await run(decide);
    expect(result.outcome).toBe('success');
    expect(decide).toHaveBeenCalledTimes(1);
    const architects = control.forgeBodies.filter((b) => systemOf(b).includes('software architect'));
    expect(architects).toHaveLength(2);
    const second = JSON.stringify(architects[1].messages);
    expect(second).toContain('EDITED PLAN (by the user)');
    expect(second).toContain('De las 3 opciones aplica A');
    expect(result.modifiedFiles.length).toBeGreaterThan(0);
  });

  it('si el plan nuevo borra algo que el anterior no borraba, vuelve a preguntar', async () => {
    control.planQueue = [
      [{ order: 1, description: 'Rediseñar tarjetas', file_path: 'src/components/sections/A.tsx', action: 'create', requires_steps: [] }],
      [
        { order: 1, description: 'Rediseñar tarjetas', file_path: 'src/components/sections/A.tsx', action: 'create', requires_steps: [] },
        { order: 2, description: 'Quitar la sección vieja', file_path: 'src/components/sections/Old.tsx', action: 'delete', requires_steps: [] },
      ],
    ];
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: 'edited', text: 'Quita también la sección vieja' })
      .mockResolvedValueOnce('rejected');
    const result = await run(decide);
    expect(decide).toHaveBeenCalledTimes(2);
    expect(result.modifiedFiles).toEqual([]);
  });
});
