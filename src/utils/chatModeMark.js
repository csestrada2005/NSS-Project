/**
 * chatModeMark — con qué modo (automático/plan) se mandó un turno de chat,
 * escondido en el contenido persistido.
 *
 * POR QUÉ VIVE EN EL CONTENIDO Y NO EN UNA COLUMNA
 * -------------------------------------------------
 * `forge_chat_messages` no tiene columna de modo (su forma vive sólo en la DB,
 * fuera de este repo — ver CLAUDE.md) y esta sesión es sólo-UI: no toca schema.
 * Mismo truco que `ddlProposedMark` (ddlProposalState.js) — una marca al final
 * del contenido que se persiste tal cual y se recorta al renderizar. Un turno
 * de ANTES de este cambio no trae marca: `parseModeMark` devuelve `mode: null`
 * y el historial simplemente no le pinta chip, en vez de inventar uno.
 */

/** @type {RegExp} Espacio + corchetes al final, igual que el resto de marcas de esta familia. */
const MODE_MARK_RE = / \[MODE:(auto|plan)\]$/;

/**
 * Añade la marca de modo al contenido de un mensaje de usuario, antes de
 * persistirlo.
 *
 * @param {string} content
 * @param {'auto' | 'plan'} mode
 * @returns {string}
 */
export function appendModeMark(content, mode) {
  if (mode !== 'auto' && mode !== 'plan') return content;
  return `${content} [MODE:${mode}]`;
}

/**
 * Separa el texto visible de la marca de modo, si la trae.
 *
 * @param {string} content
 * @returns {{ text: string, mode: 'auto' | 'plan' | null }}
 */
export function parseModeMark(content) {
  const match = content.match(MODE_MARK_RE);
  if (!match) return { text: content, mode: null };
  return { text: content.slice(0, match.index), mode: /** @type {'auto' | 'plan'} */ (match[1]) };
}
