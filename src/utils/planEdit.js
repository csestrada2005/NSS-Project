// ---------------------------------------------------------------------------
// planEdit — "Revisar" el plan (2026-10-08, Samuel, R1). El usuario edita el
// plan como texto libre ("de las 3 opciones aplica A"); la IA vuelve a armar
// el plan con esa versión y construye directo. Si el plan nuevo BORRA archivos
// que el original no borraba, se vuelve a pedir el visto bueno.
// ---------------------------------------------------------------------------

/** Marca en el pedido (y por eso en forge_intent_log) de que el plan se editó. */
export const PLAN_EDITED_MARK = '[PLAN_EDITED]';

/**
 * El plan como texto editable: un paso por línea, numerado.
 * @param {{ order: number, description: string, summary?: string, action: string, file_path: string }[]} steps
 * @returns {string}
 */
export function planAsEditableText(steps) {
  return [...(steps ?? [])]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => {
      const text = (s.summary || s.description || '').replace(/\s+/g, ' ').trim();
      return s.action === 'delete' ? `${i + 1}. ${text} (borra ${s.file_path})` : `${i + 1}. ${text}`;
    })
    .join('\n');
}

/**
 * El pedido para volver a planear: el original + el plan anterior + la versión
 * del usuario, que manda.
 * @param {string} input pedido original
 * @param {Parameters<typeof planAsEditableText>[0]} steps plan anterior
 * @param {string} edited lo que dejó el usuario
 * @returns {string}
 */
export function buildEditedPlanInput(input, steps, edited) {
  return [
    String(input ?? '').trim(),
    '',
    `${PLAN_EDITED_MARK} The user reviewed your proposed plan and EDITED it. Build what the EDITED PLAN says: it ` +
      'overrides your previous plan. Keep what they kept, drop what they removed, and apply every note or choice ' +
      'they wrote (e.g. "apply option A" means only option A).',
    'PREVIOUS PLAN:',
    planAsEditableText(steps),
    'EDITED PLAN (by the user):',
    String(edited ?? '').trim(),
  ].join('\n');
}

/**
 * ¿El plan nuevo borra algún archivo que el anterior no borraba?
 * @param {{ action: string, file_path: string }[]} next
 * @param {{ action: string, file_path: string }[]} previous
 * @returns {boolean}
 */
export function addsDeletions(next, previous) {
  const before = new Set((previous ?? []).filter((s) => s.action === 'delete').map((s) => s.file_path));
  return (next ?? []).some((s) => s.action === 'delete' && !before.has(s.file_path));
}
