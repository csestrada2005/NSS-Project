// ---------------------------------------------------------------------------
// assets — fotos y documentos de los proyectos (bloque 1, 2026-10-05,
// decisiones de Samuel): almacén de Wyrd (bucket `project-assets`, tabla
// `forge_assets`), "transformador" que convierte JPG/PNG a WebP y reduce lo
// enorme, y sin IA (subir no gasta créditos).
// ---------------------------------------------------------------------------
import sharp from 'sharp';
import crypto from 'crypto';

export const ASSET_BUCKET = 'project-assets';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 2560;
const WEBP_QUALITY = 80;

const IMAGE_IN = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);
const DOCUMENT_IN = new Set(['application/pdf']);

/** Rechaza SVG con scripts o manejadores de eventos (se sirven públicos). */
export function isSafeSvg(text) {
  const s = String(text ?? '');
  return /<svg[\s>]/i.test(s) && !/<script[\s>]|\son[a-z]+\s*=|javascript:/i.test(s);
}

/**
 * Valida y transforma un archivo subido.
 * @param {{ name: string, type: string, buffer: Buffer }} file
 * @returns {Promise<{ kind: 'image'|'document', buffer: Buffer, mime: string, ext: string, width?: number, height?: number, originalSize: number }>}
 */
export async function processUpload(file) {
  const { type, buffer } = file;
  const originalSize = buffer?.length ?? 0;
  if (!buffer || originalSize === 0) throw Object.assign(new Error('archivo vacío'), { status: 400, code: 'EMPTY' });

  if (DOCUMENT_IN.has(type)) {
    if (originalSize > MAX_DOCUMENT_BYTES) throw Object.assign(new Error('documento de más de 20 MB'), { status: 413, code: 'TOO_LARGE' });
    if (buffer.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('no es un PDF'), { status: 400, code: 'BAD_TYPE' });
    return { kind: 'document', buffer, mime: type, ext: 'pdf', originalSize };
  }
  if (!IMAGE_IN.has(type)) throw Object.assign(new Error(`formato no permitido: ${type}`), { status: 400, code: 'BAD_TYPE' });
  if (originalSize > MAX_IMAGE_BYTES) throw Object.assign(new Error('imagen de más de 10 MB'), { status: 413, code: 'TOO_LARGE' });

  if (type === 'image/svg+xml') {
    if (!isSafeSvg(buffer.toString('utf8'))) throw Object.assign(new Error('SVG con scripts no permitido'), { status: 400, code: 'UNSAFE_SVG' });
    return { kind: 'image', buffer, mime: type, ext: 'svg', originalSize };
  }

  // JPG/PNG → WebP; WebP enorme → se reduce. Siempre ≤ 2560 px de lado.
  const image = sharp(buffer, { failOn: 'error' }).rotate();
  const meta = await image.metadata();
  const tooBig = (meta.width ?? 0) > MAX_SIDE || (meta.height ?? 0) > MAX_SIDE;
  if (type === 'image/webp' && !tooBig) {
    return { kind: 'image', buffer, mime: type, ext: 'webp', width: meta.width, height: meta.height, originalSize };
  }
  const out = await image
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { kind: 'image', buffer: out.data, mime: 'image/webp', ext: 'webp', width: out.info.width, height: out.info.height, originalSize };
}

/** Ruta en el bucket: <projectId>/<uuid>-<nombre-limpio>.<ext> */
export function assetStoragePath(projectId, originalName, ext) {
  const base = String(originalName ?? 'archivo')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'archivo';
  return `${projectId}/${crypto.randomUUID().slice(0, 8)}-${base}.${ext}`;
}
