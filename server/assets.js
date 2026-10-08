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

// ---------------------------------------------------------------------------
// Favicon (bloque 2, 2026-10-06, decisiones de Samuel): uno por proyecto, se
// aplica AL PUBLICAR (el código del proyecto no se toca) y una imagen no
// cuadrada se ENCAJA sin recortar, con fondo transparente. Se guarda un PNG
// maestro de 512 px; al publicar salen de él los de 32 px y 180 px.
// ---------------------------------------------------------------------------
const FAVICON_MASTER = 512;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Valida un ícono subido y lo convierte al PNG maestro cuadrado.
 * @param {{ name: string, type: string, buffer: Buffer }} file
 * @returns {Promise<{ kind: 'favicon', buffer: Buffer, mime: 'image/png', ext: 'png', width: number, height: number, originalSize: number }>}
 */
export async function processFavicon(file) {
  const { type, buffer } = file;
  const originalSize = buffer?.length ?? 0;
  if (!buffer || originalSize === 0) throw Object.assign(new Error('archivo vacío'), { status: 400, code: 'EMPTY' });
  if (!IMAGE_IN.has(type)) throw Object.assign(new Error(`formato no permitido: ${type}`), { status: 400, code: 'BAD_TYPE' });
  if (originalSize > MAX_IMAGE_BYTES) throw Object.assign(new Error('imagen de más de 10 MB'), { status: 413, code: 'TOO_LARGE' });
  const isSvg = type === 'image/svg+xml';
  if (isSvg && !isSafeSvg(buffer.toString('utf8'))) throw Object.assign(new Error('SVG con scripts no permitido'), { status: 400, code: 'UNSAFE_SVG' });

  // density: un SVG se dibuja con detalle suficiente antes de reducirlo.
  const out = await sharp(buffer, { failOn: 'error', ...(isSvg ? { density: 300 } : {}) })
    .rotate()
    .resize({ width: FAVICON_MASTER, height: FAVICON_MASTER, fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  return { kind: 'favicon', buffer: out, mime: 'image/png', ext: 'png', width: FAVICON_MASTER, height: FAVICON_MASTER, originalSize };
}

/** Del PNG maestro, los dos tamaños que van al sitio publicado. */
export async function faviconSizes(master) {
  const size = (px) => sharp(master).resize({ width: px, height: px, fit: 'contain', background: TRANSPARENT }).png().toBuffer();
  const [png32, png180] = await Promise.all([size(32), size(180)]);
  return { png32, png180 };
}

// ---------------------------------------------------------------------------
// Documentos privados (2026-10-08, decisión de Samuel: privado por defecto,
// con opción de hacerlo público). Un PDF puede traer datos sensibles: vive en
// el almacén PRIVADO `project-documents` y la IA lo lee con una dirección que
// caduca. "Hacer público" lo mueve al almacén público (para que el sitio lo
// ofrezca para descargar). Un documento privado tiene `public_url` vacío.
// ---------------------------------------------------------------------------
export const DOCUMENT_BUCKET = 'project-documents';
export const SIGNED_URL_SECONDS = 10 * 60;

/** Documento sin dirección pública = vive en el almacén privado. */
export function isPrivateDocument(row) {
  return row?.kind === 'document' && !row?.public_url;
}

/** Almacén donde vive el archivo de esta fila. */
export function bucketFor(row) {
  return isPrivateDocument(row) ? DOCUMENT_BUCKET : ASSET_BUCKET;
}

// ---------------------------------------------------------------------------
// Lecturas guardadas (2026-10-08, decisiones de Samuel: 1A elegir de Archivos
// + 2A copia en el almacén privado). La primera vez que la IA lee un PDF (o
// mira una foto) se guarda lo que entendió; al volver a adjuntarlo desde
// Archivos se reusa sin pagar otra lectura. Siempre en el almacén PRIVADO,
// aunque el archivo sea público: el texto puede traer datos sensibles.
// ---------------------------------------------------------------------------
export const MAX_READING_CHARS = 200_000;
export const READING_MIME = 'application/json';

export function readingFolder(projectId) {
  return `readings/${projectId}`;
}

export function readingPath(projectId, assetId) {
  return `${readingFolder(projectId)}/${assetId}.json`;
}

/** Una lectura válida: texto no vacío y razonable, y si se recortó. */
export function isValidReading(body) {
  return typeof body?.text === 'string'
    && body.text.trim().length > 0
    && body.text.length <= MAX_READING_CHARS
    && (body.truncated === undefined || typeof body.truncated === 'boolean');
}
