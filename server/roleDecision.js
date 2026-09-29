// ---------------------------------------------------------------------------
// roleDecision — aprobar o rechazar la petición de rol de un usuario de la
// plataforma (Nebu Studio / Wyrd), SIEMPRE desde el servidor.
//
// Por qué existe (bucket 5, hallazgo de 5.4, 2026-09-29): `profiles` tenía
// RLS "cada quien edita su fila" sin restringir columnas, así que cualquier
// usuario podía cambiarse su propio `role` desde la consola del navegador. El
// candado de la base (supabase/migrations/…_protect_profile_privileges.sql)
// ahora rechaza todo cambio de `role`/`role_approved` que no venga del
// servidor, y la aprobación de un admin pasa por aquí: la regla de quién puede
// qué vive en este módulo puro (testeable con `node --test`) y server.js sólo
// lee, llama y escribe con la llave de servidor.
// ---------------------------------------------------------------------------

/** Roles que se pueden PEDIR en el onboarding (RoleSelectionPage). */
export const REQUESTABLE_ROLES = Object.freeze(['admin', 'dev', 'cliente']);

/**
 * ¿Este perfil (leído con la llave de servidor) es de un admin? Mismo
 * criterio que getCreditContext en server.js (`role === 'admin'`): con el
 * candado de la base nadie puede autoasignarse `role`, así que exigir además
 * `role_approved` sólo podría dejar fuera a un admin asignado a mano.
 */
export function isPlatformAdmin(profile) {
  return !!profile && profile.role === 'admin';
}

/**
 * Decide qué escribir para aprobar/rechazar la petición de `target`.
 *
 * @param {{ id: string, role: string|null, pending_role: string|null, role_approved: boolean }|null} target
 * @param {'approve'|'reject'|string} decision
 * @returns {{ ok: true, update: object, notification: { type: string, title: string, body: string } }
 *         | { ok: false, status: number, error: string }}
 */
export function planRoleDecision(target, decision) {
  if (decision !== 'approve' && decision !== 'reject') {
    return { ok: false, status: 400, error: 'decision must be "approve" or "reject"' };
  }
  if (!target) return { ok: false, status: 404, error: 'User not found' };

  // Sólo se decide sobre una petición VIVA: rol vacío y pending_role puesto.
  // Un usuario que ya tiene rol no se re-aprueba por aquí (evita que un
  // doble click o una pestaña vieja pise un rol ya asignado).
  if (target.role !== null && target.role !== undefined) {
    return { ok: false, status: 409, error: 'User already has a role' };
  }
  if (!target.pending_role) {
    return { ok: false, status: 409, error: 'User has no pending role request' };
  }
  if (!REQUESTABLE_ROLES.includes(target.pending_role)) {
    return { ok: false, status: 400, error: 'Pending role is not a requestable role' };
  }

  if (decision === 'approve') {
    return {
      ok: true,
      update: { role: target.pending_role, role_approved: true, pending_role: null },
      notification: {
        type: 'role_approved',
        title: 'Access granted',
        body: `Your account has been approved. You now have ${target.pending_role} access.`,
      },
    };
  }
  return {
    ok: true,
    update: { pending_role: null, role_approved: false },
    notification: {
      type: 'role_rejected',
      title: 'Access request declined',
      body: 'Your access request was reviewed. Please contact your administrator.',
    },
  };
}
