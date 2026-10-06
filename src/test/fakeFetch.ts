export interface FakeFetchControl {
  denied: string[];
  calls: string[];
  /** Cuerpos de cada /api/chat-forge, en orden (bloque 3: qué recibió cada pieza). */
  forgeBodies: Record<string, unknown>[];
  /** Bloque 3: el lector de adjuntos responde con error (mundo 3A). */
  failAttachmentReads: boolean;
  restore: () => void;
}

// Plan de 2 pasos — fixture mínima para probar que el bucle Architect ->
// Implementer recorre y termina, sin necesidad de generar código real (el
// fixture de /api/compile siempre "compila", así que el contenido no importa).
const PLAN_STEPS = [
  {
    order: 1,
    description: 'Primera sección de demostración del pre-registro',
    file_path: 'src/components/sections/PreRegistroDemo1.tsx',
    action: 'create',
    requires_steps: [],
  },
  {
    order: 2,
    description: 'Segunda sección de demostración del pre-registro',
    file_path: 'src/components/sections/PreRegistroDemo2.tsx',
    action: 'create',
    requires_steps: [],
  },
];

const COMPILE_FIXTURE = { ok: true, source: 'fakeFetch', route: 'compile' };
const TYPECHECK_CLEAN_FIXTURE = { available: true, errors: [], unverifiable: [], fixedFiles: {}, autoFixed: 0, durationMs: 0 };
const EMBED_SEARCH_FIXTURE = { patterns: [] };
const SUPABASE_REST_EMPTY_FIXTURE: unknown[] = [];

function toUrlString(input: string | Request | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function claudeTextResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  try {
    return init?.body ? JSON.parse(String(init.body)) : {};
  } catch {
    return {};
  }
}

/** Concatena el texto de todos los bloques de `system` (array cacheado o string plano). */
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

export function installFakeFetch(): FakeFetchControl {
  const originalFetch = globalThis.fetch;
  const denied: string[] = [];
  const calls: string[] = [];
  const forgeBodies: Record<string, unknown>[] = [];
  const control = { failAttachmentReads: false };

  globalThis.fetch = (async (input: string | Request | URL, init?: RequestInit) => {
    const url = toUrlString(input);
    calls.push(url);

    // --- /api/compile — siempre compila limpio; el Verifier no necesita reparar ---
    if (url.includes('/api/compile')) {
      return jsonResponse(COMPILE_FIXTURE);
    }

    // --- /api/typecheck — segunda puerta del Verifier (bucket 6): siempre
    // limpio, igual que el compile fixture; así estos tests siguen midiendo el
    // pipeline sin depender del entorno de tipos del servidor. ---
    if (url.includes('/api/typecheck')) {
      return jsonResponse(TYPECHECK_CLEAN_FIXTURE);
    }

    // --- GET /api/projects/:id/assets — lista de archivos subidos (2026-10-05):
    // una LECTURA que el orquestador hace en paralelo; proyecto sin archivos. ---
    if ((init?.method ?? 'GET').toUpperCase() === 'GET' && /\/api\/projects\/[^/]+\/assets$/.test(url)) {
      return jsonResponse([]);
    }

    // --- /api/embed-and-search — PatternRetriever, vector search vacía ---
    if (url.includes('/api/embed-and-search')) {
      return jsonResponse(EMBED_SEARCH_FIXTURE);
    }

    // --- Supabase REST (DesignContextService) — sin filas, cae a los defaults ---
    if (url.includes('/rest/v1/')) {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') {
        return jsonResponse(SUPABASE_REST_EMPTY_FIXTURE);
      }
      denied.push(`${method} ${url}`);
      throw new Error('[fakeFetch] escritura a Supabase denegada: ' + method + ' ' + url);
    }

    // --- /api/chat-forge — escalera por contenido del `system` prompt ---
    if (url.includes('/api/chat-forge')) {
      const body = parseBody(init);
      const systemText = extractSystemText(body);
      forgeBodies.push(body);

      // Escalón 0 (bloque 3): el lector de adjuntos — foto descrita, PDF copiado
      // (recortado por tope, para probar el aviso).
      if (systemText.includes('You describe an image') || systemText.includes('You transcribe a document')) {
        if (control.failAttachmentReads) {
          return jsonResponse({ type: 'error', error: { type: 'invalid_request_error', message: 'Unable to download the file' } }, 400);
        }
        return systemText.includes('You describe an image')
          ? jsonResponse(claudeTextResponse('A bakery counter with warm light.\nALT: Mostrador de la panadería'))
          : jsonResponse({ ...claudeTextResponse('Concha | $25\nBolillo | $8'), stop_reason: 'max_tokens' });
      }

      // Escalón 1: IntentClassifier clasifica el prompt del usuario.
      if (systemText.includes('intent classifier for a React web builder AI')) {
        return jsonResponse(
          claudeTextResponse(
            JSON.stringify({
              type: 'new_feature',
              affected_files: [],
              needs_new_files: true,
              risk: 'medium',
              reasoning: 'fakeFetch fixture — clasificación determinista para el e2e.',
              requiredPatternIds: [],
              domain: 'ui',
            })
          )
        );
      }

      // Escalón 2: Architect.plan pide el plan de pasos.
      if (systemText.includes('software architect for a React + TypeScript + Tailwind web builder')) {
        return jsonResponse(
          claudeTextResponse(JSON.stringify({ deletion_targets: [], steps: PLAN_STEPS }))
        );
      }

      // Escalón 3: Implementer.executeStep escribe el contenido de un step del plan.
      if (systemText.includes('implementing one specific step in a build plan')) {
        return jsonResponse(
          claudeTextResponse('export default function PreRegistroDemo() {\n  return null;\n}\n')
        );
      }

      // Escalón sin cubrir todavía: se deniega y se nombra para la próxima vuelta.
      denied.push(url);
      throw new Error('[fakeFetch] red saliente denegada (chat-forge sin ruta): ' + url);
    }

    denied.push(url);
    throw new Error('[fakeFetch] red saliente denegada: ' + url);
  }) as typeof fetch;

  return {
    denied,
    calls,
    forgeBodies,
    get failAttachmentReads() { return control.failAttachmentReads; },
    set failAttachmentReads(v: boolean) { control.failAttachmentReads = v; },
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
