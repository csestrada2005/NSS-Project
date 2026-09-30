// ---------------------------------------------------------------------------
// authCache — el servidor recuerda por poco tiempo las sesiones que ya
// verificó (bucket 6, 2026-09-30, decisión de Samuel). requireAuth preguntaba
// a Supabase Auth en CADA llamada autenticada, y un pedido hace varias
// (créditos, clasificar, elegir archivo, editar, compilar, guardar): cada
// una sumaba segundos cuando Supabase Auth iba lento.
//
// Sólo se recuerdan verificaciones EXITOSAS, por 60 s como máximo y nunca más
// allá del vencimiento del propio token. Costo aceptado: tras cerrar sesión,
// ese token se sigue aceptando hasta 60 s.
// ---------------------------------------------------------------------------
import crypto from 'crypto';

/** `exp` del JWT en ms (sin verificar firma: el token ya lo verificó Supabase). */
export function tokenExpiryMs(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function createAuthCache({ ttlMs = 60_000, max = 500, now = () => Date.now() } = {}) {
  const entries = new Map(); // hash del token → { user, expiresAt }
  const key = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
  return {
    get(token) {
      const k = key(token);
      const hit = entries.get(k);
      if (!hit) return null;
      if (now() >= hit.expiresAt) {
        entries.delete(k);
        return null;
      }
      return hit.user;
    },
    set(token, user) {
      const exp = tokenExpiryMs(token);
      const expiresAt = Math.min(now() + ttlMs, exp ?? Infinity);
      if (expiresAt <= now()) return;
      const k = key(token);
      entries.delete(k);
      entries.set(k, { user, expiresAt });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
    get size() {
      return entries.size;
    },
  };
}
