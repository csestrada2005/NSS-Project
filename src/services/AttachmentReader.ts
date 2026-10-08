import { platformService, type ProjectAsset } from './PlatformService';
import {
  READER_MODEL,
  IMAGE_READER_SYSTEM,
  DOCUMENT_READER_SYSTEM,
  IMAGE_READ_MAX_TOKENS,
  DOCUMENT_READ_MAX_TOKENS,
  needsReading,
  buildAttachmentsNote,
} from '../utils/attachmentsNote.js';

/**
 * Lector de adjuntos del chat (bloque 3, 2026-10-07, decisiones de Samuel):
 * una sola lectura con Haiku por foto (la describe) y por PDF (lo copia con
 * tope), ANTES del pedido y dentro del mismo intent — se cobra con él. Si una
 * lectura falla, el pedido se detiene (3A): sin el contenido la IA inventaría.
 */
export type AttachmentReadResult =
  | { ok: true; note: string; truncated: string[] }
  | { ok: false; failed: string };

/**
 * Lecturas guardadas (2026-10-08): si el archivo ya se leyó antes (elegido de
 * Archivos), se reusa sin llamar a la IA. Si no, se lee y se guarda para la
 * próxima. Guardar es un extra: si falla, el pedido sigue igual.
 */
async function readOne(asset: ProjectAsset, userText: string, projectId: string | undefined, signal?: AbortSignal): Promise<{ text: string; truncated: boolean; reused: boolean }> {
  if (projectId && asset.has_reading) {
    const saved = await platformService.getAssetReading(projectId, asset.id).catch(() => null);
    if (saved) return { ...saved, reused: true };
  }
  const fresh = await readFresh(asset, userText, projectId, signal);
  if (projectId) {
    await platformService.saveAssetReading(projectId, asset.id, fresh)
      .catch((err) => console.warn('[AttachmentReader] no se pudo guardar la lectura de', asset.original_name, err));
  }
  return { ...fresh, reused: false };
}

async function readFresh(asset: ProjectAsset, userText: string, projectId: string | undefined, signal?: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  const isDocument = asset.kind === 'document';
  // Documento privado (2026-10-08): la IA lo lee con una dirección que caduca.
  const url = asset.public_url || (projectId ? await platformService.getAssetUrl(projectId, asset.id) : '');
  if (!url) throw new Error('sin dirección para leer el documento');
  const response = await platformService.callForgeChat({
    model: READER_MODEL,
    max_tokens: isDocument ? DOCUMENT_READ_MAX_TOKENS : IMAGE_READ_MAX_TOKENS,
    system: isDocument ? DOCUMENT_READER_SYSTEM : IMAGE_READER_SYSTEM,
    messages: [{
      role: 'user',
      content: [
        { type: isDocument ? 'document' : 'image', source: { type: 'url', url } },
        { type: 'text', text: `User's request (for context and language): ${userText}` },
      ],
    }],
  }, signal);
  const data = await response.json().catch(() => null);
  const text: string = (data?.content ?? [])
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
    .trim();
  if (!response.ok || data?.error || !text) {
    throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  }
  return { text, truncated: isDocument && data?.stop_reason === 'max_tokens' };
}

export async function readAttachments(
  attachments: ProjectAsset[],
  userText: string,
  signal?: AbortSignal,
  projectId?: string
): Promise<AttachmentReadResult> {
  if (attachments.length === 0) return { ok: true, note: '', truncated: [] };
  const items: Parameters<typeof buildAttachmentsNote>[0] = [];
  const truncated: string[] = [];
  // En paralelo: N adjuntos no deben tardar N veces más.
  const reads = await Promise.allSettled(
    attachments.map((a) => (needsReading(a) ? readOne(a, userText, projectId, signal) : Promise.resolve(null)))
  );
  for (let i = 0; i < attachments.length; i++) {
    const a = attachments[i];
    const r = reads[i];
    if (r.status === 'rejected') {
      // Cancelar no es "no pude leerlo": que lo maneje la ruta de cancelación.
      if (signal?.aborted) throw r.reason;
      console.warn('[AttachmentReader] no se pudo leer', a.original_name, r.reason);
      return { ok: false, failed: a.original_name };
    }
    if (r.value?.truncated) truncated.push(a.original_name);
    items.push({ ...a, text: r.value?.text, truncated: r.value?.truncated });
  }
  const reused = reads.filter((r) => r.status === 'fulfilled' && r.value?.reused).length;
  console.log('[AttachmentReader] leídos:', attachments.length, '| reusados (sin costo):', reused, '| truncados:', truncated.length);
  return { ok: true, note: buildAttachmentsNote(items), truncated };
}
