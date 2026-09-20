/**
 * Tipos de "modo" compartidos del área del preview — antes declarados por
 * separado en StudioEngine.tsx, PreviewNavbar.tsx y ViewportToggle.tsx (tres
 * copias de ViewportMode, dos de PanelMode). Consolidado 2026-09-21, sin
 * cambios de comportamiento — sólo una fuente de verdad para el tipo.
 */

/** Ancho simulado del preview. */
export type ViewportMode = 'mobile' | 'tablet' | 'desktop';

/** Qué se ve en el área central: el preview en vivo, o uno de los paneles
 * "in-place" (reemplazan el preview entero, no flotan encima). */
export type PanelMode = 'preview' | 'code' | 'settings';
