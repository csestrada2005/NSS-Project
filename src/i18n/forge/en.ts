// Diccionario de Wyrd Forge — inglés. Es la FORMA de referencia: `es.ts`
// está tipado contra estas claves, así que una clave que falte en español
// rompe `tsc`. Nebu Studio (CRM) NO usa este diccionario: tiene su propio
// `LanguageContext` y así se queda (arquitecturas separadas).
//
// Convenciones:
// - `{nombre}` se sustituye con `t(key, { nombre })`.
// - Plurales: pareja `<clave>_one` / `<clave>_other`, vía `tn(key, count)`.
export const en = {
  'lang.toggle.label': 'Language',
  'lang.toggle.switchTo': 'Switch to Spanish',

  'dashboard.projectCount_one': '{count} project',
  'dashboard.projectCount_other': '{count} projects',
} as const;

export type ForgeKey = keyof typeof en;
