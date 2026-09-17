import { describe, it, expect, vi } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator } from '@/services/AIOrchestrator';
import { SupabaseService } from '@/services/SupabaseService';
import { ddlProposedMark } from '@/utils/ddlProposalState';
import type { BuildStep } from '@/services/Architect';

// ---------------------------------------------------------------------------
// G-4 — [DDL_PROPOSED:...] en forge_intent_log deja de depender de la
// etiqueta del clasificador.
//
// Antes, AIOrchestrator sólo calculaba la marca cuando `intent.type ===
// 'database_change'` (src/services/AIOrchestrator.ts, PIEZA A). Un
// `modify_existing` o `new_feature` cuyo plan dejaba una migración escrita
// cerraba el intent en 'success' sin ninguna marca en el log, mientras que el
// CHAT sí la mostraba (ddlProposedMark en ChatInterface.tsx / StudioEngine.tsx,
// calculada sobre `result.modifiedFiles` sin ese gate). El log y el chat
// divergían: el usuario veía el botón de aprobación, pero forge_intent_log no
// dejaba rastro de que había DDL propuesto.
//
// Estos tests corren el pipeline real (Architect -> Implementer -> Verifier)
// contra fakeFetch y comprueban lo que AIOrchestrator.logIntent() REALMENTE
// inserta en forge_intent_log — comportamiento, no una lectura de código
// fuente por regex.
//
// fakeFetch.ts deniega toda escritura POST/PATCH a /rest/v1/ (ver su propia
// cabecera): el INSERT de forge_intent_log se deniega ahí igual que
// cualquier otro. Reutilizamos esa infraestructura tal cual — no se toca
// fakeFetch.ts ni el test 'deniega exactamente las 3 escrituras conocidas' de
// preregistro.e2e.test.ts — y le superponemos, SOLO en este archivo, un
// wrapper de fetch que:
//
//   1. Captura el body del INSERT a forge_intent_log ANTES de reenviar la
//      llamada al fetch de fakeFetch, que es quien la deniega (empuja a
//      `denied` y lanza). logIntent() envuelve ese insert en try/catch y
//      hace `console.error` + `return intentLogResult(e)`: el lanzamiento no
//      cambia el outcome del pipeline, sólo el resultado de logIntent, que
//      ningún caller del pipeline principal usa para decidir nada.
//   2. Delega TODO lo demás (compile, embed-and-search, REST GET, el paso del
//      Implementer) en el fetch que installFakeFetch() ya instaló.
//   3. Sólo sustituye dos escalones de /api/chat-forge (el clasificador y el
//      plan del Architect) para fijar intent.type y el plan por test, sin
//      tocar fakeFetch.ts.
//
// Sin sesión, `supabase.auth.getUser()` resuelve `user: null` y logIntent()
// corta ANTES del insert (`if (!user) return intentLogResult('no_session')`)
// — comprobado en vivo: con fakeFetch a secas, forge_intent_log nunca
// aparece ni en `calls` ni en `denied`. Por eso se mockea SOLO aquí, con
// `vi.spyOn` sobre la instancia real de SupabaseService, para que el insert
// llegue a emitirse y haya un body que capturar.
// ---------------------------------------------------------------------------

function claudeTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toUrlString(input: string | Request | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  try {
    return init?.body ? JSON.parse(String(init.body)) : {};
  } catch {
    return {};
  }
}

function extractSystemText(body: Record<string, unknown>): string {
  const system = body.system;
  if (Array.isArray(system)) {
    return system
      .map((block) => (block && typeof block === 'object' ? (block as { text?: string }).text ?? '' : ''))
      .join('\n');
  }
  if (typeof system === 'string') return system;
  return '';
}

interface Rig {
  getIntentLogBody: () => Record<string, unknown> | null;
  restore: () => void;
}

/** Instala fakeFetch y le superpone, sólo en este archivo, lo que este grupo de tests necesita. */
function installRig(intentType: string, planSteps: BuildStep[]): Rig {
  const control: FakeFetchControl = installFakeFetch();
  const fakeFetchFn = globalThis.fetch;
  let intentLogBody: Record<string, unknown> | null = null;

  const getUserSpy = vi
    .spyOn(SupabaseService.getInstance().client.auth, 'getUser')
    .mockResolvedValue({
      data: {
        user: { id: 'g4-test-user' },
      },
      error: null,
    } as unknown as Awaited<ReturnType<typeof SupabaseService.prototype.client.auth.getUser>>);

  globalThis.fetch = (async (input: string | Request | URL, init?: RequestInit) => {
    const url = toUrlString(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    // (1) Captura el body del insert a forge_intent_log ANTES de reenviarlo al
    // fetch de fakeFetch, que es quien lo deniega y lanza.
    if (url.includes('/rest/v1/forge_intent_log') && method === 'POST') {
      intentLogBody = parseBody(init);
      return fakeFetchFn(input, init);
    }

    // (3) Clasificador y plan fijados por test; todo lo demás de chat-forge
    // (el paso del Implementer) sigue siendo el fixture de fakeFetch.
    if (url.includes('/api/chat-forge')) {
      const body = parseBody(init);
      const systemText = extractSystemText(body);

      if (systemText.includes('intent classifier for a React web builder AI')) {
        return jsonResponse(
          claudeTextResponse(
            JSON.stringify({
              type: intentType,
              affected_files: [],
              needs_new_files: true,
              risk: 'medium',
              reasoning: 'G-4 fixture — clasificación fijada por el test, no por el LLM.',
              requiredPatternIds: [],
              domain: 'data',
              needs_server: false,
            })
          )
        );
      }

      if (systemText.includes('software architect for a React + TypeScript + Tailwind web builder')) {
        return jsonResponse(
          claudeTextResponse(JSON.stringify({ deletion_targets: [], steps: planSteps }))
        );
      }
    }

    // (2) Todo lo demás, al fetch de fakeFetch.
    return fakeFetchFn(input, init);
  }) as typeof fetch;

  return {
    getIntentLogBody: () => intentLogBody,
    restore: () => {
      getUserSpy.mockRestore();
      control.restore();
    },
  };
}

async function runG4(intentType: string, planSteps: BuildStep[]) {
  const rig = installRig(intentType, planSteps);
  try {
    const files = new Map<string, string>();
    const result = await AIOrchestrator.parseUserCommand(
      'Agrega la tabla de pedidos',
      files,
      null,
      'g4-test-project',
      () => {},
      undefined,
      () => {}
    );
    return { result, intentLogBody: rig.getIntentLogBody() };
  } finally {
    rig.restore();
  }
}

const MIGRATION_STEP: BuildStep = {
  order: 1,
  description: 'Crea la tabla de pedidos',
  file_path: 'supabase/migrations/20200101000000_create_pedidos.sql',
  action: 'create',
  requires_steps: [],
};

const NO_MIGRATION_STEP: BuildStep = {
  order: 1,
  description: 'Ajusta el hero de la landing',
  file_path: 'src/components/sections/Hero.tsx',
  action: 'create',
  requires_steps: [],
};

describe('G-4 — [DDL_PROPOSED:] en forge_intent_log ya no depende de intent.type', () => {
  it(
    'T1: modify_existing con migración escrita → el user_prompt insertado lleva [DDL_PROPOSED:<path>]',
    async () => {
      const { result, intentLogBody } = await runG4('modify_existing', [MIGRATION_STEP]);

      expect(result.outcome).toBe('success');
      const persistedSqlPath = result.modifiedFiles.find((p) => p.endsWith('.sql'));
      expect(persistedSqlPath).toBeDefined();

      expect(intentLogBody).not.toBeNull();
      expect(String(intentLogBody!.user_prompt)).toContain(`[DDL_PROPOSED:${persistedSqlPath}]`);
    },
    15000
  );

  it(
    'T2: new_feature con migración escrita → el user_prompt insertado lleva [DDL_PROPOSED:<path>]',
    async () => {
      const { result, intentLogBody } = await runG4('new_feature', [MIGRATION_STEP]);

      expect(result.outcome).toBe('success');
      const persistedSqlPath = result.modifiedFiles.find((p) => p.endsWith('.sql'));
      expect(persistedSqlPath).toBeDefined();

      expect(intentLogBody).not.toBeNull();
      expect(String(intentLogBody!.user_prompt)).toContain(`[DDL_PROPOSED:${persistedSqlPath}]`);
    },
    15000
  );

  it(
    'T3: modify_existing SIN migraciones → el user_prompt insertado NO lleva DDL_PROPOSED',
    async () => {
      const { result, intentLogBody } = await runG4('modify_existing', [NO_MIGRATION_STEP]);

      expect(result.outcome).toBe('success');
      expect(result.modifiedFiles.some((p) => p.endsWith('.sql'))).toBe(false);

      expect(intentLogBody).not.toBeNull();
      expect(String(intentLogBody!.user_prompt)).not.toContain('DDL_PROPOSED');
    },
    15000
  );

  it(
    'T4: la marca insertada es IDÉNTICA a ddlProposedMark(result.modifiedFiles)',
    async () => {
      const { result, intentLogBody } = await runG4('modify_existing', [MIGRATION_STEP]);

      const expectedMark = ddlProposedMark(result.modifiedFiles);
      expect(expectedMark).not.toBe('');

      expect(intentLogBody).not.toBeNull();
      expect(String(intentLogBody!.user_prompt)).toBe(`Agrega la tabla de pedidos${expectedMark}`);
    },
    15000
  );

  it(
    'T5 (no-regresión): database_change con migración sigue emitiendo la marca en el log',
    async () => {
      // Complementa, no duplica, migrationDirNormalization.test.js ('el caso
      // del bakery: antes no había marca, ahora sí'): aquel prueba las
      // funciones puras de migrationPath.js contra un helper local; este
      // corre el pipeline real y mira lo que AIOrchestrator.logIntent()
      // inserta de verdad en forge_intent_log.
      const { result, intentLogBody } = await runG4('database_change', [MIGRATION_STEP]);

      expect(result.outcome).toBe('success');
      const persistedSqlPath = result.modifiedFiles.find((p) => p.endsWith('.sql'));
      expect(persistedSqlPath).toBeDefined();

      expect(intentLogBody).not.toBeNull();
      expect(String(intentLogBody!.user_prompt)).toContain(`[DDL_PROPOSED:${persistedSqlPath}]`);
    },
    15000
  );
});
