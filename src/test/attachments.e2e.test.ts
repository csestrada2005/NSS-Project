import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installFakeFetch, type FakeFetchControl } from './fakeFetch';
import { AIOrchestrator } from '@/services/AIOrchestrator';
import type { ProjectAsset } from '@/services/PlatformService';
import { setForgeLang } from '@/i18n/forge/lang';

// Bloque 3 (2026-10-07) — adjuntos del chat, contra el LLM falso: una lectura
// con Haiku por foto/PDF, la nota llega al Architect y a CADA paso del
// Implementer, y si una lectura falla el pedido se detiene ahí (3A).

let control: FakeFetchControl;

const asset = (over: Partial<ProjectAsset>): ProjectAsset => ({
  id: 'a', kind: 'image', public_url: 'https://cdn/p/hero.webp', mime_type: 'image/webp', size_bytes: 1,
  original_size: 1, original_name: 'hero.jpg', width: 800, height: 600, created_at: '2026-10-07', ...over,
});
const photo = asset({});
// Documento privado (2026-10-08): sin dirección pública.
const pdf = asset({ id: 'b', kind: 'document', public_url: '', mime_type: 'application/pdf', original_name: 'menu.pdf', width: null, height: null });
const svg = asset({ id: 'c', public_url: 'https://cdn/p/logo.svg', mime_type: 'image/svg+xml', original_name: 'logo.svg' });

const run = (attachments: ProjectAsset[]) =>
  AIOrchestrator.parseUserCommand(
    'Haz la sección del menú con este PDF y pon esta foto arriba',
    new Map<string, string>(),
    null,
    'attachments-test-project',
    undefined, undefined, undefined, undefined, undefined, undefined, false, null, [],
    attachments
  );

const systemOf = (b: Record<string, unknown>) =>
  Array.isArray(b.system) ? b.system.map((x) => (x as { text?: string }).text ?? '').join('\n') : String(b.system ?? '');
const userText = (b: Record<string, unknown>) => JSON.stringify(b.messages);

describe('Bloque 3 — adjuntos del chat (e2e con LLM falso)', () => {
  beforeEach(() => {
    setForgeLang('es');
    control = installFakeFetch();
  });
  afterEach(() => control.restore());

  it('lee foto y PDF una vez con Haiku; la nota llega al Architect y a cada paso; avisa del recorte', async () => {
    const result = await run([photo, pdf, svg]);
    expect(result.outcome).toBe('success');

    const readers = control.forgeBodies.filter((b) => /You describe an image|You transcribe a document/.test(systemOf(b)));
    // El SVG no se "mira": sólo dos lecturas.
    expect(readers).toHaveLength(2);
    for (const r of readers) expect(r.model).toBe('claude-haiku-4-5-20251001');
    expect(userText(readers[0])).toContain('"source":{"type":"url","url":"https://cdn/p/hero.webp"}');
    expect(userText(readers[1])).toContain('"type":"document"');
    // El PDF privado se lee con la dirección temporal que da el servidor.
    expect(control.calls).toContain('/api/projects/attachments-test-project/assets/b/url');
    expect(userText(readers[1])).toContain('https://signed.example/b.pdf?token=temporal');

    const architect = control.forgeBodies.find((b) => systemOf(b).includes('software architect'))!;
    const steps = control.forgeBodies.filter((b) => systemOf(b).includes('implementing one specific step'));
    expect(steps).toHaveLength(2);
    for (const body of [architect, ...steps]) {
      const text = userText(body);
      expect(text).toContain('ATTACHED TO THIS MESSAGE');
      expect(text).toContain('Concha | $25');
      expect(text).toContain('ALT: Mostrador de la panadería');
      expect(text).toContain('https://cdn/p/logo.svg');
      // La dirección temporal nunca llega a quien escribe el sitio.
      expect(text).not.toContain('signed.example');
      expect(text).toContain('PRIVATE');
    }

    expect(result.warning).toMatch(/Sólo leí la primera parte de menu\.pdf/);
  });

  it('si una lectura falla se detiene sin planear ni escribir nada (3A)', async () => {
    control.failAttachmentReads = true;
    const result = await run([pdf]);
    expect(result).toMatchObject({ outcome: 'failed', error: 'ATTACHMENT_READ_FAILED', errorReason: 'menu.pdf', modifiedFiles: [] });
    expect(control.forgeBodies.some((b) => systemOf(b).includes('software architect'))).toBe(false);
    expect(control.forgeBodies.some((b) => systemOf(b).includes('intent classifier'))).toBe(false);
  });

  it('la primera lectura se guarda; elegido de Archivos con lectura guardada, se reusa sin llamar al lector', async () => {
    const first = await run([pdf]);
    expect(first.outcome).toBe('success');
    expect(control.readings.get('b')).toEqual({ text: 'Concha | $25\nBolillo | $8', truncated: true });

    // Segundo mensaje: el mismo PDF elegido de Archivos (ya leído).
    control.forgeBodies.length = 0;
    control.readings.set('b', { text: 'Concha | $30\nBolillo | $9', truncated: false });
    const second = await run([{ ...pdf, has_reading: true }]);
    expect(second.outcome).toBe('success');
    const readers = control.forgeBodies.filter((b) => /You describe an image|You transcribe a document/.test(systemOf(b)));
    expect(readers).toHaveLength(0);
    const architect = control.forgeBodies.find((b) => systemOf(b).includes('software architect'))!;
    expect(userText(architect)).toContain('Concha | $30');
    // Lectura guardada completa: sin aviso de recorte.
    expect(second.warning ?? '').not.toMatch(/primera parte/);
  });

  it('una pregunta recibe la lista de Archivos y la regla de que sí puede verlos (2026-10-08)', async () => {
    control.intentType = 'question';
    control.assets = [photo, pdf];
    const result = await AIOrchestrator.parseUserCommand(
      'Sube la foto correcta de aventura y dime en qué sección va',
      new Map<string, string>(), null, 'attachments-test-project',
      undefined, undefined, undefined, undefined, undefined, undefined, false, null, [], []
    );
    expect(result.outcome).toBe('success');
    const answer = control.forgeBodies.find((b) => systemOf(b).includes("Wyrd Forge's AI assistant"))!;
    expect(systemOf(answer)).toMatch(/NEVER say you cannot see or\s+access uploaded files/);
    expect(systemOf(answer)).toContain('paperclip');
    expect(systemOf(answer)).toContain('Unsplash) remain a valid option');
    const text = userText(answer);
    expect(text).toContain('PROJECT FILES uploaded by the user');
    expect(text).toContain('https://cdn/p/hero.webp');
    expect(text).toContain('menu.pdf');
    // Sin fotos ni PDFs leídos: nada que leer.
    expect(control.forgeBodies.some((b) => /You describe an image|You transcribe a document/.test(systemOf(b)))).toBe(false);
  });

  it('pregunta en un proyecto sin archivos: se le dice que no hay ninguno', async () => {
    control.intentType = 'question';
    await AIOrchestrator.parseUserCommand(
      '¿Puedes ver mis fotos?', new Map<string, string>(), null, 'attachments-test-project',
      undefined, undefined, undefined, undefined, undefined, undefined, false, null, [], []
    );
    const answer = control.forgeBodies.find((b) => systemOf(b).includes("Wyrd Forge's AI assistant"))!;
    expect(userText(answer)).toContain('PROJECT FILES: none uploaded yet.');
  });

  it('sin adjuntos no hay lectura ni nota', async () => {
    const result = await run([]);
    expect(result.outcome).toBe('success');
    expect(control.forgeBodies.some((b) => /You describe an image|You transcribe a document/.test(systemOf(b)))).toBe(false);
    expect(control.forgeBodies.some((b) => userText(b).includes('ATTACHED TO THIS MESSAGE'))).toBe(false);
    expect(result.warning ?? '').not.toMatch(/primera parte/);
  });
});
