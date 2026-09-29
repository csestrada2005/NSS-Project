import { useSyncExternalStore } from 'react';

// "Teléfono" = pantalla angosta Y puntero táctil. Las dos condiciones a la vez
// para que una ventana de escritorio angosta (mouse) NO cuente como teléfono:
// el editor de Wyrd sigue disponible ahí (ítem 5.4, bloque de celular).
const PHONE_QUERY = '(max-width: 767px) and (pointer: coarse)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
