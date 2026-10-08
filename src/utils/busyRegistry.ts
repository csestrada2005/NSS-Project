import { useEffect } from 'react';

// ---------------------------------------------------------------------------
// busyRegistry — "estoy ocupado con X" (2026-10-08, Samuel). Desde Código o
// Ajustes, el botón "Chat" vuelve al preview; pero si algo está a medias
// (una publicación, una revisión, un archivo sin guardar…) no cambia de
// pantalla y avisa qué falta: al salir de Ajustes el panel se desmonta y un
// proceso en curso se quedaría sin pantalla que muestre cómo terminó.
//
// Cada panel declara su proceso con useBusy(motivo, activo). Un panel nuevo
// sólo tiene que hacer lo mismo.
// ---------------------------------------------------------------------------

/** En orden de prioridad: si hay varios a la vez, se avisa el primero. */
export const BUSY_REASONS = [
  'code',
  'publish',
  'security',
  'function',
  'sql',
  'secret',
  'upload',
  'email',
  'github',
  'lighthouse',
] as const;

export type BusyReason = (typeof BUSY_REASONS)[number];

const active = new Map<symbol, BusyReason>();

/** Marca un proceso en curso; devuelve la función que lo libera. */
export function markBusy(reason: BusyReason): () => void {
  const token = Symbol(reason);
  active.set(token, reason);
  return () => {
    active.delete(token);
  };
}

/** El proceso a medias más importante, o null si no hay ninguno. */
export function firstBusy(): BusyReason | null {
  const now = new Set(active.values());
  return BUSY_REASONS.find((r) => now.has(r)) ?? null;
}

/** Mientras `isActive` sea true (y el componente esté montado), cuenta como ocupado. */
export function useBusy(reason: BusyReason, isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;
    return markBusy(reason);
  }, [reason, isActive]);
}
