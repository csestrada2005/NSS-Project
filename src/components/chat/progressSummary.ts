// `kind: 'planning'` marca la línea inicial sin depender de su texto (que
// ahora sale traducido). `text === 'Planning...'` se conserva por compatibilidad.
export type ProgressLine = { text: string; status: 'pending' | 'done' | 'error'; kind?: 'planning' | 'phase' };

export const isLastDone = (lines: ProgressLine[]): boolean =>
  lines.length > 0 && lines[lines.length - 1].status === 'done';

export const isLastError = (lines: ProgressLine[]): boolean =>
  lines.length > 0 && lines[lines.length - 1].status === 'error';

export const getPlainEnglish = (
  lines: ProgressLine[],
  hasPendingPlan: boolean,
  currentAction?: 'create' | 'modify' | 'delete',
  isRetrying?: boolean,
): string => {
  // Con un plan esperando aprobación nada se está ejecutando: las líneas de
  // detalle describen lo que se HARÁ, no lo que se hace. Cortar aquí, antes
  // de cualquier coincidencia por substring, evita que el panel afirme un
  // trabajo en curso que el gate de abajo desmiente en la misma pantalla.
  if (hasPendingPlan) return 'Esperando tu aprobación...';
  if (lines.length === 0) return 'Working on it...';
  // El error SIEMPRE se evalúa antes que pending: cuando un plan falla a
  // mitad de camino, las líneas 'pending' posteriores al step que falló
  // quedan huérfanas EN MEDIO del array (nunca se marcaron 'done' ni
  // 'error'), y .find() las encuentra antes de llegar al 'error' del final.
  // Preguntar primero "¿la última línea es error?" ignora esas huérfanas.
  if (isLastError(lines)) return 'Something went wrong';
  if (isRetrying) return 'Fixing a small issue...';
  const pending = lines.find(l => l.status === 'pending');
  if (pending) {
    if (pending.kind === 'planning' || pending.text === 'Planning...') return 'Figuring out what to build...';
    if (currentAction === 'create') return 'Writing new components...';
    if (currentAction === 'modify') return 'Updating existing files...';
    if (currentAction === 'delete') return 'Removing files...';
    return 'Working on it...';
  }
  if (isLastDone(lines)) return 'All done ✓';
  return 'Working on it...';
};
