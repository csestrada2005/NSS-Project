-- DB: principal de Wyrd (NO la de ningún fixture). Aditiva: crea una función y
-- un trigger; no borra ni cambia datos, políticas ni permisos existentes.
--
-- Por qué (bucket 5, 2026-09-29): `profiles` tiene RLS "cada quien edita su
-- fila" (auth.uid() = id, sin WITH CHECK ni restricción de columnas), así que
-- cualquier usuario podía cambiarse su propio `role` (a admin/dev) desde la
-- consola del navegador. El trigger AFTER admin_unlimited_credits además
-- premiaba el salto a admin con créditos ilimitados.
--
-- Regla: `role` y `role_approved` sólo cambian si
--   (a) la escritura viene del servidor (JWT service_role) o de una sesión sin
--       JWT (SQL Editor / migraciones), o
--   (b) es el autoservicio del onboarding: en tu propia fila, de rol vacío a
--       'cliente' (RoleSelectionPage).
-- Todo lo demás (incluido un admin desde el navegador) se rechaza: la
-- aprobación de roles va por POST /api/admin/users/:userId/role-decision.
-- `pending_role` se puede seguir pidiendo: pedir no da permisos.

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  jwt_role text := auth.jwt() ->> 'role';
begin
  if new.role is not distinct from old.role
     and new.role_approved is not distinct from old.role_approved then
    return new;
  end if;

  -- (a) servidor con llave de servicio, o SQL Editor / migraciones (sin JWT)
  if jwt_role is null or jwt_role = 'service_role' then
    return new;
  end if;

  -- (b) onboarding: rol vacío → 'cliente', sólo en la fila propia
  if auth.uid() = old.id
     and old.role is null
     and new.role = 'cliente' then
    return new;
  end if;

  raise exception 'role and role_approved can only be changed by the server'
    using errcode = '42501';
end;
$$;

create trigger protect_profile_privileges
  before update on public.profiles
  for each row
  execute function public.protect_profile_privileges();
