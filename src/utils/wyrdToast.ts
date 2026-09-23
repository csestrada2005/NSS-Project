import type { CSSProperties } from 'react';
import { toast as sonnerToast, type ExternalToast } from 'sonner';

/**
 * wyrdToast — wrapper de `sonner` SÓLO para Wyrd Forge (2026-09-23, pedido de
 * Samuel: "los pop ups tipo 'Ve a preview primero...' hay que hacerlos full
 * blancos con rojo todos"). El `<Toaster>` es uno solo para todo el monorepo
 * (montado en main.tsx, compartido con Nebu Studio/CRM) — restylearlo ahí
 * habría pintado también los toasts del CRM. En vez de eso, cada llamada
 * desde código de Wyrd Forge pasa un `style` inline (gana sobre las
 * variables CSS de sonner sin pelear especificidad) — Nebu Studio sigue
 * llamando a `toast` de `sonner` directo, sin tocar.
 */
const WYRD_TOAST_STYLE: CSSProperties = {
  background: '#FFFFFF',
  color: '#0D0D0D',
  border: '2px solid #D62828',
  borderRadius: '4px',
};

function withWyrdStyle(opts?: ExternalToast): ExternalToast {
  return { ...opts, style: { ...WYRD_TOAST_STYLE, ...opts?.style } };
}

export const wyrdToast = {
  error: (message: string, opts?: ExternalToast) => sonnerToast.error(message, withWyrdStyle(opts)),
  success: (message: string, opts?: ExternalToast) => sonnerToast.success(message, withWyrdStyle(opts)),
  message: (message: string, opts?: ExternalToast) => sonnerToast.message(message, withWyrdStyle(opts)),
};
