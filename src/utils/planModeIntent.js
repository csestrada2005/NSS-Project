// ---------------------------------------------------------------------------
// planModeIntent — en modo Plan, pedir un plan NO es una pregunta (2026-10-09,
// P2 de Samuel). "Proponme un plan para mejorar las tarjetas" caía en el carril
// de preguntas y contestaba con texto en vez de "Plan listo". Seguro sin IA:
// si el mensaje habla de plan/propuesta, nunca se trata como pregunta.
// ---------------------------------------------------------------------------

const PLAN_WORDS = /\b(plan|planes|planea|planear|planifica|prop[oó]n(?:me|nos|ga)?|proponer|propuesta|propuestas|propose|proposal|roadmap)\b/i;

/**
 * @param {string} input
 * @returns {boolean} true si el mensaje pide un plan o una propuesta
 */
export function asksForPlan(input) {
  return PLAN_WORDS.test(String(input ?? ''));
}
