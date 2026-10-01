// ---------------------------------------------------------------------------
// progressHeadline — la primera línea del modal dice QUÉ está haciendo Wyrd
// con el pedido (2026-10-01, Samuel: "Cambia el título…" mostraba "Trabajando
// en tu pedido"; debe decir "Cambiando el título…"). Determinista y sin IA:
// el verbo del pedido en imperativo pasa a gerundio y se conserva el resto.
// Si el pedido no empieza por un verbo conocido, null (el texto genérico).
// ---------------------------------------------------------------------------

const ES = {
  cambia: 'Cambiando', cambiá: 'Cambiando', agrega: 'Agregando', añade: 'Añadiendo', anade: 'Añadiendo',
  crea: 'Creando', quita: 'Quitando', elimina: 'Eliminando', borra: 'Borrando', haz: 'Haciendo',
  pon: 'Poniendo', mueve: 'Moviendo', actualiza: 'Actualizando', arregla: 'Arreglando',
  corrige: 'Corrigiendo', reemplaza: 'Reemplazando', sustituye: 'Sustituyendo', traduce: 'Traduciendo',
  conecta: 'Conectando', muestra: 'Mostrando', oculta: 'Ocultando', ajusta: 'Ajustando',
  mejora: 'Mejorando', rediseña: 'Rediseñando', rehaz: 'Rehaciendo', escribe: 'Escribiendo',
  aumenta: 'Aumentando', reduce: 'Reduciendo', centra: 'Centrando', alinea: 'Alineando',
  renombra: 'Renombrando', usa: 'Usando', integra: 'Integrando', implementa: 'Implementando',
  construye: 'Construyendo', genera: 'Generando', diseña: 'Diseñando', convierte: 'Convirtiendo',
  separa: 'Separando', junta: 'Juntando', ordena: 'Ordenando', limpia: 'Limpiando', revisa: 'Revisando',
};
const EN = {
  change: 'Changing', add: 'Adding', create: 'Creating', remove: 'Removing', delete: 'Deleting',
  make: 'Making', fix: 'Fixing', update: 'Updating', move: 'Moving', replace: 'Replacing',
  rename: 'Renaming', build: 'Building', show: 'Showing', hide: 'Hiding', translate: 'Translating',
  connect: 'Connecting', improve: 'Improving', redesign: 'Redesigning', write: 'Writing',
  increase: 'Increasing', reduce: 'Reducing', center: 'Centering', align: 'Aligning', use: 'Using',
  set: 'Setting', put: 'Putting', turn: 'Turning', clean: 'Cleaning', review: 'Reviewing',
};
// Cortesía que va delante del verbo y no aporta a la línea.
const POLITE = /^(?:por\s+favor[,\s]+|porfa[,\s]+|please[,\s]+|ahora[,\s]+|now[,\s]+|ok[,\s]+|oye[,\s]+)+/i;
const MAX_CHARS = 72;

/**
 * @param {string} prompt lo que escribió el usuario
 * @returns {string | null} "Cambiando el título "Choose your edge" por ……" o null
 */
export function progressHeadline(prompt) {
  const text = String(prompt ?? '').trim().replace(POLITE, '').trim();
  if (!text || /^[¿?]/.test(text) || text.endsWith('?')) return null;
  const match = /^([\p{L}]+)(?:\s+|$)([\s\S]*)$/u.exec(text);
  if (!match) return null;
  const verb = match[1].toLowerCase();
  // "Cámbialo", "agrégale": el pronombre pegado cuenta como el verbo.
  const base = ES[verb] ? verb : verb.replace(/(lo|la|los|las|le|les|me|nos)$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const gerund = ES[verb] ?? ES[base] ?? EN[verb] ?? null;
  if (!gerund) return null;
  const rest = match[2].replace(/\s+/g, ' ').trim();
  const line = rest ? `${gerund} ${rest}` : gerund;
  return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1).trimEnd()}…` : `${line.replace(/[.!…]+$/, '')}…`;
}
