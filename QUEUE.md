# QUEUE.md — Cola de Wyrd Forge

Fuente de verdad de lo que falta. Claude Code la lee en Fase 0 y la actualiza al cierre.
Regla de Nebu: las sesiones existen para REDUCIR esta cola, no para agrandarla.
Un hallazgo nuevo se funde en un bucket existente siempre que se pueda; sólo abre ítem propio si no cabe en ninguno.

Último estado conocido: deploy `97fe8a8` (G-4, 2026-09-17). G-3 mergeado en main como `b878db0`.
Re-verificar con Fase 0 antes de confiar en cualquier hash de este archivo.

---

## 0. CERRADO Y CONFIRMADO EN PRODUCCIÓN — Guard RLS "no actuó" tras G-4: REENCUADRADO, no era regresión de G-3 (2026-09-17)

**Diagnóstico (evidencia cruda: `forge_intent_log` + `forge_files`, DB principal de Wyrd, corridas
`control_cd_g4` y `customer_reviews` sobre Vertigo):** las dos corridas tienen `outcome=success` y
`plan_steps` NO nulo — pasaron por el plan lane completo, no por `runHeavyLane` ni por la rama de
cancelación. El marcador `[DDL_PROPOSED:...]` está presente en las dos, así que el bloque del guard SÍ
se ejecutó. El SQL real persistido:
- `control_cd_g4`: columnas `id, note`. Sin columna de rol.
- `customer_reviews`: columnas `id, name, rating, comment, created_at`. Sin columna de rol.

Ninguna de las dos tablas tiene una columna en `ROLE_COLUMN_NAMES`. El guard (BLOQUE 1 / G-2 / G-2bis /
G-2ter) estaba, por diseño, limitado a "tablas de permisos" — corrió, decidió correctamente que no
aplicaba, y por eso no dejó marca. **No es una regresión de G-3**: la Pieza 1 (origen/destino) es
incondicional desde G-3 y sigue intacta; el fallo no estaba ahí. Es un hueco de alcance real (una tabla
nueva sin ninguna columna de rol podía quedar sin RLS encendida — `control_cd_g4` — sin ningún aviso).

**Decisión de producto (con Samuel, costo/opciones presentadas):** ampliar sólo la comprobación de "falta
RLS" (BLOQUE 1-TER) a TODA tabla que un lote crea con `CREATE TABLE`, tenga o no columna de rol. La
comprobación de políticas públicas peligrosas (BLOQUE 1-BIS) queda intacta, limitada a tablas de rol — un
insert público sin auth sobre una tabla sin columna de rol (`customer_reviews`, un formulario de reseñas)
sigue siendo una decisión de producto válida del usuario final, no algo que el guard reescriba solo.

**Hecho (G-5):** `src/utils/rlsPolicyGuard.js` + `.d.ts` — `tablesRequiringRls` ahora es la unión de
`roleTables` (sin cambios) y toda tabla con ancla `CREATE TABLE` en el lote; nuevo campo
`roleTable` en el finding `missing-rls` para que `rlsPolicyWarnings` no invente "columna de rol" ni
"función de servidor" en el aviso de una tabla que no la tiene. Deliberadamente NO se amplía a
`ALTER TABLE ... ADD COLUMN` (una tabla preexistente puede tener RLS de una migración fuera del lote,
invisible para el guard). `server/rlsPolicyGuard.test.js`: 6 tests nuevos (dos son regresión con el SQL
real de `control_cd_g4`/`customer_reviews`), 4 actualizados para el nuevo alcance. `node --test
"server/*.test.js"` (605), `npx vitest run` (41) y `npx tsc -b --force` en verde. Commiteado en main
(`1e37705`); branch de checkpoint `claude/g5-rls-guard-checkpoint`, PR #325.

**Pendiente:** ampliar también a políticas públicas sobre tablas SIN columna de rol
(la opción que Samuel dejó para después, con mockup — bucket 5). `customer_reviews` con su insert público
sigue sin ningún aviso; es una decisión de UX pendiente, no un bug.

**CHECK MANUAL — CONFIRMADO (2026-09-18):** Samuel reprodujo contra Vertigo una tabla nueva sin columna de
rol y sin RLS (`rls_check_g5`, columnas `id, note`). Evidencia cruda: el aviso mostrado en el chat es
literalmente el texto nuevo de G-5 para tablas sin rol ("Row level security estaba apagada sobre
rls_check_g5; la habilité antes de proponer la migración..." — sin "(tabla con columna de rol)" ni
"función de servidor", que sólo aparecen para tablas de rol), y el SQL persistido trae
`alter table public.rls_check_g5 enable row level security;` justo después del `CREATE TABLE`. No se
verificó por separado el literal `[RLS_ENABLED:rls_check_g5]` en `forge_intent_log` (mismo hallazgo que
produce el aviso, así que la marca debería estar, pero queda sin confirmar dato-a-dato si alguna vez hay
duda sobre esta corrida puntual).

---

## 1. HECHO — G-3 (2026-09-15)
Guard RLS ciego por renombrado. Pieza 1 (pasar contenido por path ORIGEN, reportar por path DESTINO) + Pieza 2 (alarma `unparseable` avisa en log y chat sin tumbar la corrida). Mergeado (`b878db0`).
Pendiente heredado: Pieza 1 sin cobertura automática. Ver ítem 0.

## 2. HECHO — G-4 (2026-09-17)
`[DDL_PROPOSED:]` llega a `forge_intent_log` sin depender de `intent.type`. Desplegado `97fe8a8`, verificado en Vertigo.
Notas de G-4 ya decididas:
- El aviso que no persiste se funde en el bullet de persistencia del bucket 5.
- `projectId: none`: si no se resolvió en G-4, va como sub-bullet del bucket 5.
- La bomba de `deployGeneratedFunctions` se documenta como comentario en código, no como ítem.

## 3. HECHO (pendiente CHECK MANUAL) — Guard de código bajo `src/` (G-6, 2026-09-19)

**El agujero:** el Verifier (`src/services/Verifier.ts`) compila y repara errores de compilación —
nunca inspecciona el CONTENIDO por reglas de seguridad. `BACKEND_RULES` (`src/services/promptRules.ts`)
ya le PIDE al modelo, en texto, mover a una función de servidor cualquier lógica que necesite "a secret
the browser must never hold" o sea una "privileged write" — pero es instrucción al LLM, no una
inspección determinista.

**Hecho:** `src/utils/clientCodeGuard.js` + `.d.ts` (nuevo), mismas convenciones exactas del resto de
la familia (`ddlGuard.js`, `deletionGuard.js`, `planGuard.js`, `rlsPolicyGuard.js`). Dos comprobaciones
independientes en un solo módulo:
1. `hardcoded-credential` — identificador-credencial de un set cerrado (`CREDENTIAL_IDENTIFIER_NAMES`,
   match por prefijo/sufijo de palabra completa) asignado a un literal de string, o un header
   `Authorization: 'Bearer <literal>'` pegado a mano.
2. `role-table-write` — código de cliente que escribe (`insert`/`update`/`upsert`/`delete`) directamente
   en una tabla que ESTE MISMO lote de migraciones marca como de rol/permisos. Reutiliza
   `tablesWithRoleColumnInSql` de `rlsPolicyGuard.js` (ahora exportada, cambio aditivo — `rlsPolicyGuard.
   test.js` no se tocó y sigue en verde).

DETECT + AVISA, nunca reescribe: no hay transformación segura y determinista para "mueve esto a una
función de servidor" (a diferencia de encender RLS o borrar una política). La corrida sigue igual; no se
retira el botón de aprobación (mismo trato que `unparseable` en el guard RLS).

**Wiring, en las tres rutas que generan código de cliente (mismo hueco que ya se corrigió para el guard
RLS con `runHeavyLane`, no repetido aquí):**
- **Plan lane:** las dos comprobaciones, sobre el lote de migraciones (`migrationsForGuards`, nombrado y
  compartido con `evaluateRlsPolicies`) y sobre `diffPaths` filtrado a `src/`. Marca en `forge_intent_log`
  Y aviso visible en el chat (`warnings`), igual que RLS.
- **Fast lane y Simple lane:** sólo Comprobación 1 (ninguna de las dos toca `.sql`). Campo nuevo
  `clientSecretMark?: string` en `OrchestratorResult`, consumido por su `logIntent` respectivo —
  **sólo telemetría en `forge_intent_log`, sin aviso nuevo en el chat** en estas dos rutas. Decisión de
  alcance ya tomada, no un olvido: este guard nunca reescribe, así que no aplica el principio que sí
  obliga a avisar en RLS ("un guard que ACTÚA sin rastro visible").

**Decisión de producto (con Samuel):** no se intenta arreglo automático (no existe una transformación
segura para "mueve esto a servidor"; forzarla rompería la doctrina de guard determinista de toda la
familia). Se mueven a bucket 5 dos preguntas de producto, explícitas, no implícitas:
- Cómo traducir el aviso técnico de este guard a algo que un usuario NO técnico pueda accionar solo.
- Qué hacer con los límites aceptados de abajo (¿son un problema de producto o quedan como están?).

**Límites aceptados, documentados en la cabecera de `clientCodeGuard.js`, no resueltos aquí:**
- Sin memoria de esquema entre corridas: sólo ve tablas de rol de ESTE MISMO intent.
- `supabase.from(variable)` sin literal: fail-open, no se evalúa.
- Un import con alias (`supabase as sb`): no se detecta (ancla en el identificador literal `supabase`).
- Fast lane / Simple lane: el hallazgo sólo queda en `forge_intent_log`, invisible en el chat.

**Verificación:** `node --test "server/*.test.js"` → 628/628 verdes (605 previos + 23 nuevos de
`server/clientCodeGuard.test.js`, incluye positivos de las dos comprobaciones, negativos obligatorios,
los tres límites aceptados como test explícito, robustez sobre contenido no-string, formato exacto de
telemetría, y un test de regresión que confirma que el VALOR de la credencial no aparece en ningún
finding/marca/aviso). `npx vitest run` → 41/41 verdes. `npx tsc -b --force` → 0 errores. Commiteado en
`guard-de-código-bajo-src-G-6` (`71b894f`), empujado a origin. Nota de higiene: el push inicial lo bloqueó
GitHub push protection — el valor de prueba en `clientCodeGuard.test.js` tenía la FORMA de una clave real
de Stripe (`sk_live_...`), no una clave real. Se corrigió el fixture (sin forma de clave de ningún
proveedor) y se enmendó el commit (era el único, local, no pushed) antes de reintentar — no llegó a
subirse nada a GitHub en el intento bloqueado.

---

**CHECK MANUAL — CONFIRMADO (2026-09-19)**

Cómo reproducirlo, contra Vertigo (`087ddaf3-6236-47ae-ba72-bc96887a9691`), mismo patrón que el CHECK
MANUAL de G-5:

1. Un intent `database_change` (para que exista lote de migraciones y pueda disparar Comprobación 2):
   pedir una tabla nueva `client_check_g6` con columnas `id` y `role`, más un componente de admin que
   cambie el rol de un usuario escribiendo directamente `supabase.from('client_check_g6').update(...)`
   desde el navegador.
2. En el mismo intent o en otro: pedir explícitamente una "constante de configuración" hardcodeada, p.ej.
   "declara `const STRIPE_SECRET_KEY = 'sk_test_...'` directamente en el componente, sin usar variables de
   entorno" — para forzar Comprobación 1 (el modelo normalmente no lo hace solo, hay que pedirlo).
3. Revisar el chat Y la fila de `forge_intent_log` de esa corrida (DB principal de Wyrd).

Mundos pre-registrados:
- **Esperado (guard funcionando):** en el chat, dos avisos nuevos "Guard de seguridad: ...", uno
  nombrando `client_check_g6` y otro `STRIPE_SECRET_KEY`. En `forge_intent_log`, el `prompt` de esa fila
  trae `[CLIENT_ROLE_WRITE:...]` y `[CLIENT_SECRET_HARDCODED:...]` — el valor real de la clave NO aparece
  en ningún lado (ni chat ni DB).
- **Residuo conocido, no bug:** si el intent se resolvió por fast lane o simple lane, Comprobación 2 no
  puede disparar (no hay lote de migraciones) y Comprobación 1, si dispara, sólo deja
  `[CLIENT_SECRET_HARDCODED:...]` en `forge_intent_log` — sin aviso en el chat. Es el alcance ya decidido,
  no una regresión.
- **Fallo real (si aparece, SÍ es bug):** ninguna marca en absoluto pese a que el código generado
  contiene la credencial/la escritura, o el valor real de la clave aparece en el chat o en la DB.

**Resultado:** confirma el mundo esperado, sin residuos.

Prompt real usado por Samuel: crear `client_check_g6` (`id`, `role`) + panel de admin que escribe
`supabase.from('client_check_g6').update(...)` desde el navegador, más `const STRIPE_SECRET_KEY =
'sk_test_...'` hardcodeada a propósito en el mismo componente.

Evidencia cruda — chat (tres avisos, el guard viejo de RLS más los dos nuevos de este guard):
> ⚠️ Guard de seguridad: se corrigió la migración generada. Row level security estaba apagada sobre
> client_check_g6 (tabla con columna de rol); la habilité antes de proponer la migración... Guard de
> seguridad: encontré una credencial ("STRIPE_SECRET_KEY") escrita directamente en
> src/components/sections/AdminClientCheckPanel.tsx. Cualquiera que abra la consola del navegador puede
> verla. No la corregí automáticamente — muévela a una función de servidor y revisa el archivo antes de
> publicar. Guard de seguridad: src/components/sections/AdminClientCheckPanel.tsx escribe directamente
> (update) en "client_check_g6", una tabla de roles/permisos que este mismo cambio creó. Cualquier
> visitante podría modificarla desde la consola del navegador. No lo corregí automáticamente — mueve esta
> escritura a una función de servidor.

Evidencia cruda — `prompt` de la fila en `forge_intent_log` (DB principal de Wyrd, Vertigo):
> [DDL_PROPOSED:supabase/migrations/20260919073552_create_client_check_g6.sql] [RLS_ENABLED:client_check_g6]
> [CLIENT_SECRET_HARDCODED:src/components/sections/AdminClientCheckPanel.tsx:STRIPE_SECRET_KEY]
> [CLIENT_ROLE_WRITE:src/components/sections/AdminClientCheckPanel.tsx:client_check_g6:update]

Lectura: las cuatro marcas coexisten en la misma fila (RLS + las dos de G-6), sin pisarse. Las dos marcas
nuevas traen exactamente path:identifier y path:table:method — el valor real de la clave (`sk_test_...`)
no aparece ni en los avisos del chat ni en `forge_intent_log`; sólo lo repitió Wyrd en su propio resumen
de "Plan ejecutado" (fuera del alcance de este guard). Resuelto por el plan lane (hubo migración de por
medio), así que aplicó el trato completo: telemetría Y aviso visible en el chat. Sin residuos ni mundo
inesperado — no hubo que reencuadrar nada.


---

## 4. BLOQUEADO (falta VERCEL_TOKEN) — Hueco conceptual RLS ↔ Edge Function (G-7, 2026-09-19)

**Resumen para quien llegue después:** Bloque 1 (plomería de deploy) HECHO y commiteado, verificación
automática en verde, SIN check manual porque publicar no está configurado en producción. **Bloque 2
(las reglas nuevas de BACKEND_RULES) NO SE HA EMPEZADO — cero código escrito todavía.** No tocar Bloque 2
hasta confirmar el check manual del Bloque 1 con un deploy real.

**Evidencias acumuladas (las cuatro + una quinta con síntoma visible en pantalla):**
1. El modelo escribió literal "Adds RLS policies for public insert and update so the flows work without
   auth sessions" — abrió la tabla para que la Edge Function funcionara sin sesión.
2. Cabecera generada: "without requiring authenticated sessions (sandboxed preview environment)" — misma
   lógica, justificada con el entorno de preview.
3. Dos corridas con secreto compartido codificado dentro de la Edge Function en vez de JWT contra JWKS.
   Referencia buena: Comedor_Feedback, `admin-users/index.ts` (205 líneas, ver debajo).
4. Mismo prompt literal en Vertigo, tres salidas distintas entre corridas: v2 con políticas públicas, v3
   sin RLS, v4 sin RLS y con FK a `auth.users`.
5. (G-3, 2026-09-15, migración `20260915035315` sobre `app_users`) el modelo puso
   `comment on table ... is 'wyrd:read=public'` Y ADEMÁS escribió `fetchUsers()` leyendo directo desde el
   navegador, teniendo ya `manage-users` en el plan. Única con síntoma visible en pantalla (lista vacía).

**Diagnóstico (verificado contra el código, no sólo teoría):** el modelo no tiene ninguna forma honesta de
verificar identidad en lo que construye — ni en el preview NI, esto es lo nuevo, en el sitio ya publicado.
`src/templates.ts` (bloque `lib/supabase.ts`, ~L300-331) vendorea el MISMO cliente Supabase
(`persistSession: false`, `autoRefreshToken: false`, `lock` no-op) para preview y para producción — no hay
ningún swap al publicar. Esas tres banderas son obligatorias en el preview (iframe del builder sin
`allow-same-origin`, ver `StudioEngine.tsx` — origen opaco, `localStorage`/`navigator.locks` tiran
SecurityError) pero NO tienen ninguna razón de ser en el sitio publicado (dominio real, sin esa pared).
Confirmado que el dominio real sí soporta sesión normal: `ClientProjectPage.tsx` ya embebe el
`deployment_url` con `sandbox="allow-scripts allow-same-origin"`. `/api/deploy/:projectId` en `server.js`
manda a Vercel exactamente los `files` que llegan del cliente (`DeployManager.tsx` → `PlatformService.
deployProject`), sin transformar nada — único punto de publicación real (Cloudflare sólo hace DNS sobre el
`deployment_url` ya existente, Bloque "Phase 4" de `server.js`).

**Decisión de producto (con Samuel):** NO tocar el sandbox del builder (pared de seguridad deliberada,
aislar código no confiable generado por IA — bajarla para poder probar login en el editor no vale el
riesgo). Sí cerrar la plomería para que el sitio PUBLICADO tenga sesión real. El ciclo completo
(login + Edge Function verificando JWT contra JWKS, patrón `admin-users/index.ts`) sólo se prueba una vez
hecho el deploy — nunca dentro del editor. Ver ítem 7: esto debe quedar explícito en el tutorial de uso.

**Plan, dos bloques atómicos:**
- **Bloque 1 (plomería, sin tocar el modelo):** en `/api/deploy/:projectId`, reemplazar el contenido de
  `src/lib/supabase.ts` por una versión con sesión real (sin las tres banderas de modo preview) justo
  antes de mandar los `files` a Vercel. El builder no se toca. Verificación: test de servidor +
  CHECK MANUAL publicando un proyecto de prueba.
- **Bloque 2 (BACKEND_RULES):** cuando el pedido necesita identidad real, el modelo genera login real
  (`supabase.auth`, ya no prohibido para este caso puntual) + Edge Function con el patrón JWT/JWKS de
  Comedor_Feedback + la tabla de por medio se queda SIEMPRE privada (nunca política pública) + aviso
  explícito en el chat de que ese login no funciona dentro del editor. Requisito adicional (de Samuel,
  ver ítem 7): la página/sección de admin debe seguir siendo 100% navegable en el preview — el modelo
  NUNCA debe ocultar el render completo detrás de `if (!session) return null`; sólo la acción privilegiada
  puntual falla con aviso claro al probarla en el editor. CHECK MANUAL contra Vertigo, mismo patrón que
  G-5/G-6.

**Estado:** BLOQUEADO (2026-09-19) — reencuadrado a mitad de sesión, evidencia contradijo la premisa.
Bloque 1 HECHO en código pero SIN CHECK MANUAL posible: al intentar publicar, Samuel recibió
literalmente "Deployment service not configured" — el 503 que `server.js` devuelve cuando falta
`VERCEL_TOKEN` en el entorno. No es un bug de este cambio: publicar nunca se terminó de configurar en
producción (prerequisito ausente, no código roto). Esto bloquea a la vez el check manual del Bloque 1 Y
todo el Bloque 2 (que depende de que "una vez publicado" sea un estado real y comprobable — hoy no lo es).

**Desbloqueo:** configurar `VERCEL_TOKEN` (cuenta de Vercel real) en las variables de entorno de
producción (Render). Es decisión/acción de Samuel, no de esta sesión. Hasta que exista un deploy real que
revisar, este ítem se queda parado exactamente aquí — no seguir a Bloque 2 sin el check manual del
Bloque 1 confirmado.

**Bloque 1 — hecho:** `src/utils/deploySupabaseClient.js` + `.d.ts` (nuevo) — `applyProductionSupabaseClient(files)`
reemplaza el contenido de `src/lib/supabase.ts` por la versión sin las tres banderas de modo preview,
sólo cuando esa ruta ya está presente en `files` (deja sin tocar un proyecto sin DB). Función pura, no muta
la entrada. Conectada en `server.js`, endpoint `/api/deploy/:projectId`, justo antes de construir
`vercelFiles` — el builder/preview no se toca, sólo el paquete que sale hacia Vercel.
`server/deploySupabaseClient.test.js`: 5 tests nuevos (swap correcto, ausencia verificada de las tres
banderas en el código de producción, no-mutación, proyecto sin DB pasa intacto, null/undefined no
revientan). `node --test "server/*.test.js"` → 633/633 verdes (628 previos + 5). `npx vitest run` → 41/41.
`npx tsc -b --force` → 0 errores.

**CHECK MANUAL — PENDIENTE.** Cómo reproducirlo:
1. Publica (botón Deploy) cualquier proyecto fixture con Supabase provisionado — Vertigo
   (`087ddaf3-6236-47ae-ba72-bc96887a9691`) sirve, no hace falta que tenga login.
2. Contra el bundle JS servido por la URL de Vercel resultante (DevTools → Network/Sources, o
   `curl`/`grep` sobre el JS compilado), busca el string `persistSession`.
3. Verifica en paralelo que el preview DENTRO del builder sigue cargando normal (sin SecurityError en
   consola) — el swap no debe alcanzar ahí bajo ninguna circunstancia.

Mundos pre-registrados:
- **Esperado (plomería funcionando):** el bundle publicado en Vercel NO contiene `persistSession` en
  ningún lado relacionado al cliente Supabase (la config de producción no la fija — usa el default de
  supabase-js). El preview del builder sigue exactamente igual que antes de este cambio.
- **Falla real (si aparece, SÍ es bug):** `persistSession` (o `autoRefreshToken`/el `lock` no-op) sigue
  apareciendo en el bundle publicado, o el preview del builder se rompe/tira SecurityError donde antes no
  lo hacía.

## 5. BUCKET Producto y UX
Una sola sesión de decisión, con mockup delante. Orden acordado con Samuel (2026-09-19): 1 (Panel Cloud) →
2 (variantes de diseño) → 3 (rediseño cosmético). El resto de la lista se queda en el bucket para después.

### 5.1 HECHO Y CONFIRMADO — Panel Cloud, alcance A completo (2026-09-19)

**CHECK MANUAL — CONFIRMADO.** Evidencia cruda (Samuel, contra Vertigo, desplegado en Render vía rama
`sesión-5`):
- **Edge Functions:** `mi-funcion-de-prueba` ACTIVE, `comment-moderation` ACTIVE, `health` ACTIVE,
  `ping-test` ACTIVE, `manage-users` ACTIVE — las cinco con botón Deploy. "que son las edge-functions del
  proyecto, formidable."
- **Logs:** las tres pestañas (Postgres/Auth/Edge Fn) muestran "no logs available" — "que es correcto"
  (sin tráfico reciente, degradación honesta, no el placeholder inventado de antes).
- **Usage:** REST Requests 1, Auth Requests 0, Storage Requests 0, Realtime Requests 0 — "que es correcto".
- **Users:** Samuel Estrada / csestrada2005@outlook.com / admin / "0m ago" / 3/21/2026 — "que es correcto".

Lectura: mundo esperado exacto, sin residuos ni sorpresas. No se reportó ninguna llamada a
`api.supabase.com` ni secreto visible en Network — Samuel no lo mencionó como problema, se asume revisado
implícitamente dado que confirmó cada panel como correcto.

**El agujero real, más grande de lo que decía la cola:** de los 5 paneles desmontados
(`DatabaseOverview`, `EdgeFunctionsPanel`, `LogsViewer`, `UsagePanel`, `UsersManager`, todos en
`src/components/settings/db/`), tres — `EdgeFunctionsPanel`, `LogsViewer`, `UsagePanel` — tenían el MISMO
bug de seguridad: sacaban `SUPABASE_SERVICE_ROLE_KEY` de `forge_secrets` (sin filtrar por `project_id`) y
la usaban DIRECTO desde el navegador como `Authorization: Bearer` contra `api.supabase.com` — una llave de
servicio viva, expuesta a cualquiera con DevTools abierto. Encima el `ref` del proyecto se calculaba mal
(`VITE_SUPABASE_URL`, el env var de LA PLATAFORMA, no `forge_projects.supabase_project_ref`) y la llave era
la EQUIVOCADA de fondo: la Management API pide un token de cuenta (`SUPABASE_MANAGEMENT_TOKEN`), nunca una
`service_role key` de proyecto. `UsagePanel` además mostraba cifras (`db_size_bytes`, `storage_size_bytes`,
`bandwidth_bytes`) que nunca existieron en ningún endpoint documentado — inventadas por quien construyó el
panel originalmente, nunca verificadas. Casi seguro la razón real por la que los 3 estaban desmontados.

**Decisión con Samuel:** arreglar los tres de verdad (opción A), no sólo mover `EdgeFunctionsPanel` al
endpoint seguro que ya existía y dejar Logs/Usage desmontados (opción B, más barata).

**Hecho:**
- `server/projectManagementApi.js` (nuevo) — lectura server-mediada de la Management API, usando
  `SUPABASE_MANAGEMENT_TOKEN` (nunca una service_role key) y `forge_projects.supabase_project_ref` (nunca
  `VITE_SUPABASE_URL`). Tres funciones de red (listar edge functions, logs, uso) + validación pura
  testeable (`validateProjectRefRequest`, `validateLogsRequest`, `isValidLogSource`, `buildLogsSql`).
  Endpoints verificados contra doc oficial de Supabase (no adivinados): `GET /v1/projects/{ref}/functions`,
  `GET /v1/projects/{ref}/analytics/endpoints/logs?sql=...` (tablas reales: `postgres_logs`, `auth_logs`,
  `function_edge_logs`), `GET /v1/projects/{ref}/analytics/endpoints/usage.api-counts` (conteo de requests
  por servicio — lo único de "uso" que la Management API documenta realmente; NO hay endpoint JSON de
  tamaño de DB/storage/bandwidth, sólo un scrape Prometheus sin nombres de métrica confirmados, así que
  `UsagePanel` se ajustó a mostrar conteos de requests reales en vez de cifras fabricadas).
- `server.js`: 3 rutas nuevas (`GET /api/projects/:projectId/edge-functions`, `/logs`, `/usage`), mismo
  patrón que el deploy de edge functions (`requireProjectOwnership`, 503 si falta
  `SUPABASE_MANAGEMENT_TOKEN`, 409 `NO_PROJECT_DB` si falta el ref, nunca un default).
- `src/services/SupabaseService.ts`: `listEdgeFunctions`, `getProjectLogs`, `getProjectUsage` — mismo
  contrato tipado que `deployEdgeFunction` (nunca lanza, nunca expone una llave al caller).
- `EdgeFunctionsPanel.tsx` reescrito: detección local vía `edgeFunctionPath.js`
  (`isEdgeFunctionEntrypoint`/`edgeFunctionSlug`, ya no un walk manual duplicado) sobre `files` (el mapa
  plano que `SettingsModal` ya tenía), estado remoto vía el endpoint seguro, deploy vía
  `SupabaseService.deployEdgeFunction` (que YA estaba bien hecho — el panel simplemente lo llamaba con
  `projectId`/`code` vacíos).
- `LogsViewer.tsx` y `UsagePanel.tsx`: misma UI, fuente de datos movida al servidor.
- `SettingsModal.tsx`: los 5 paneles montados como sub-tabs de "Database" (Overview, Schema, SQL, Secrets,
  Edge Functions, Logs, Usage, Users — 8 en total).
- `server/projectManagementApi.test.js`: 8 tests nuevos, sólo sobre las partes puras (mismo criterio que
  `edgeFunctionDeploy.test.js`: la parte de red no se testea con `node --test`, se verifica en el check
  manual). `node --test "server/*.test.js"` → 641/641 verdes (633 previos + 8). `npx vitest run` → 41/41.
  `npx tsc -b --force` → 0 errores. `graphify update .` corrido.

**CHECK MANUAL — PENDIENTE.** Cómo reproducirlo, contra un proyecto con `supabase_project_ref` real
(Vertigo sirve):
1. Abre Settings → Database. Deben aparecer 8 sub-tabs.
2. Overview y Users deben cargar igual que ya cargaban en el Hub del proyecto (sin cambios ahí).
3. Edge Functions: si el proyecto tiene algo en `supabase/functions/`, debe listarlo con su estado real
   (ACTIVE si ya está desplegado) y un botón Deploy funcional.
4. Logs: cambia entre las tres pestañas (Postgres/Auth/Edge Fn) — debe traer líneas reales o
   "No logs available", nunca los mensajes de placeholder de antes.
5. Usage: debe mostrar 4 KPIs de conteo de requests (REST/Auth/Storage/Realtime), no vacíos si el proyecto
   ha tenido tráfico reciente.
6. Con DevTools → Network abierto durante los pasos 3-5: NINGUNA llamada debe ir a `api.supabase.com`
   directo desde el navegador, y ningún valor de `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_MANAGEMENT_TOKEN`
   debe aparecer en ninguna request ni en la consola. Todo debe pasar por `/api/projects/:projectId/...`
   (mismo origen que Wyrd).

Mundos pre-registrados:
- **Esperado:** los 8 sub-tabs cargan, Edge Functions/Logs/Usage muestran datos reales o un aviso claro de
  degradación (nunca placeholders inventados), y CERO llamadas/secretos expuestos en Network/consola.
- **Residuo conocido, no bug:** si `SUPABASE_MANAGEMENT_TOKEN` no está configurado en producción, las tres
  pestañas nuevas muestran su aviso de "no configurado" (503) — mismo prerequisito que ya limita el deploy
  real de edge functions, no una regresión de este cambio.
- **Falla real (si aparece, SÍ es bug):** cualquier llamada a `api.supabase.com` visible desde el
  navegador, cualquier secreto visible en Network/consola, o una pantalla rota/500 sin manejar.

### 5.2 HECHO Y CONFIRMADO — Onboarding de proyecto: tono + color (mockup D, 2026-09-19)

**CHECK MANUAL — CONFIRMADO.** Evidencia cruda (Samuel, "Sale perfecto"), prompt "A landing page for a
landing page of cryptocurrency", modo "✨ Suggested for you":
> Link-in-Bio Page Builder — Brand blue + creator purple
> Fintech/Crypto — Gold trust + purple tech
> Calculator & Unit Converter — Operation orange on dark

Lectura: las 3 son filas REALES de `colors` (ninguna inventada) — el mundo esperado se cumple, sin
residuos de seguridad ni de datos fabricados. Nota de calidad, NO un bug (no estaba en los mundos
pre-registrados, la agrego aquí para no perderla): "Fintech/Crypto" es el match semánticamente más obvio
para un prompt de criptomoneda y salió 2º de 3, no 1º — el scoring por keywords sin peso por especificidad
puede dejar que un término genérico compartido (p. ej. "page", repetido dos veces en este prompt) acumule
más puntos que un término específico como "crypto". No bloquea nada (las tres opciones son razonables y el
usuario elige a mano), pero queda anotado por si en algún momento vale la pena afinar el peso del scoring
en `suggestPalettes` (src/utils/colorPaletteSuggest.js).

**Diseño acordado con Samuel, con mockup delante** (canvas: https://claude.ai/artifact/6tNr4u1GXf8JUfTckjhwZF,
4 opciones A/B/C/D — D es la elegida). Contexto de Samuel que cambió el diseño original: la mayoría de
proyectos de Nebu vienen de un brief que el equipo ya analizó, así que el color no siempre debe
"inventarlo" la IA — a veces ya se sabe. `NewProjectModal` pasa de 2 a 3 pasos: nombre → descripción (igual
que antes) → tono + color.

**Tono:** pills de selección rápida (Playful/Professional/Luxury/Minimal/Bold) — se pliega como
instrucción al modelo, nunca se fuerza (es difuso, no hay un valor "correcto" que verificar).

**Color, dos modos:**
- **🎨 Color wheel** — el usuario pica un hex a mano (para cuando el brief de Nebu ya trae el color de
  marca del cliente). Se fija SÓLO `--brand-primary`; el resto de la paleta lo sigue decidiendo el modelo,
  con una restricción dura en el prompt sobre ese único valor.
- **✨ Suggested for you** — matchea la descripción contra las tablas REALES `products`/`colors` de la DB
  PRINCIPAL de Wyrd (Samuel las confirmó: ahí vive el espejo del skill ui-ux-pro-max — `colors`, `products`,
  `styles`, `typography`, `ui_reasoning`; las tres últimas quedan para 5.3/futuro). Al elegir una paleta
  sugerida, los 5 colores se aplican EXACTOS — el modelo nunca los reinterpreta.

**Nota de higiene:** el primer intento de esta pieza vendorizaba una copia de `colors.csv` del skill
`ui-ux-pro-max` dentro del repo — Samuel corrigió que esos datos YA viven en la DB principal de Wyrd
(`colors`/`products`/etc.) y deben salir de ahí, no de una copia. El archivo vendorizado se borró antes de
llegar a commit, no quedó rastro.

**Hecho:**
- `src/utils/colorPaletteSuggest.js` + `.d.ts` — `suggestPalettes(prompt, productRows, colorRows, limit)`,
  scoring puro y determinista por palabra clave contra `products.keywords` + bonus por `product_type`
  literal en el prompt, unido con `colors` por `product_type` exacto. No hace red — recibe las filas ya
  cargadas. Columnas de `colors` verificadas contra `information_schema.columns` (las pegó Samuel), NO
  adivinadas: `product_type, primary_color, on_primary, secondary_color, on_secondary, accent, on_accent,
  background, foreground, card, card_foreground, muted, muted_foreground, border, destructive,
  on_destructive, ring, notes` — este módulo sólo usa el subconjunto que el brief necesita.
- `src/utils/colorConversion.js` + `.d.ts` — `hexToHslString(hex)`, hex → "H S% L%" sin wrapper (el formato
  exacto que `DesignBrief.palette` espera).
- `src/services/DesignBriefService.ts` — nuevo tipo exportado `DesignHints` (`tone?`, `pinnedPalette?`,
  `pinnedPrimaryHsl?`) y función pura exportada `applyPaletteHints(brief, hints)`: aplica el override DE
  FORMA DETERMINISTA sobre el brief ya validado — nunca confía en que el modelo respetó la instrucción al
  pie de la letra (misma doctrina que el resto de guards de esta familia: detectar/forzar, no sólo pedir en
  texto). `generate(prompt, hints?)` y `scaffold(prompt, files, hints?)` ahora aceptan el hint opcional.
- `src/components/forge/NewProjectModal.tsx`: 3 pasos. `toPinnedPalette()` exportado y testeado — mapea las
  6 columnas de `colors` a las 5 vars de `DesignBrief` en el orden exacto de `REQUIRED_BRAND_VARS`.
- `onCreated` ahora manda `designHints` por `navigate(..., { state: { initialPrompt, designHints } })`
  (`ForgeDashboard.tsx`) → `StudioEngine.tsx` lo lee de `location.state` y lo pasa a `applyDesignBrief` →
  `DesignBriefService.scaffold`. Sin cambios de esquema en `forge_projects` — el hint sólo importa para el
  scaffold inicial, mismo mecanismo ya usado para `initialPrompt`.
- Tests nuevos: `server/colorPaletteSuggest.test.js` (7), `server/colorConversion.test.js` (5),
  `DesignBriefService.test.ts` (+5, `applyPaletteHints`), `NewProjectModal.test.ts` (2, `toPinnedPalette`).
  `node --test "server/*.test.js"` → 653/653 verdes (641 previos + 12). `npx vitest run` → 48/48 (41 + 7).
  `npx tsc -b --force` → 0 errores. `graphify update .` corrido.

**CHECK MANUAL — PENDIENTE.** Cómo reproducirlo (necesita `sesión-5` desplegada o el dev server local con
credenciales reales de la DB principal — este sandbox no las tiene):
1. Crear un proyecto nuevo. Confirmar que ahora son 3 pasos ("Step 1/2/3 of 3"), no 2.
2. En el paso 3: elegir un tono, dejar "✨ Suggested for you" activo — con una descripción tipo "a coffee
   subscription service" deben aparecer paletas reales (nombres tipo "Coffee Shop", no inventados) con sus
   colores reales de la tabla `colors`.
3. Cambiar a "🎨 Color wheel", picar un preset o escribir un hex, confirmar que el swatch de vista previa
   cambia.
4. Publicar el proyecto y revisar `DESIGN.md`/`src/index.css` generados: si elegiste una paleta sugerida,
   los 5 `--brand-*` deben ser EXACTAMENTE la conversión HSL de esos hex (no otros inventados por el
   modelo). Si usaste la rueda, sólo `--brand-primary` debe ser exacto; el resto puede variar.

Mundos pre-registrados:
- **Esperado:** wizard de 3 pasos, paletas sugeridas reales (nunca vacías salvo prompt genuinamente sin
  match), color elegido respetado EXACTO en el proyecto generado.
- **Residuo conocido, no bug:** si el prompt no matchea ningún `product_type`/`keyword`, "Suggested for
  you" muestra "No close match found" y el usuario cae a la rueda — comportamiento esperado, no un fallo.
- **Falla real (si aparece, SÍ es bug):** paletas inventadas/genéricas en vez de filas reales de `colors`,
  o el color elegido por el usuario NO aparece exacto en el `--brand-*` del proyecto generado.

### 5.3 EN PROGRESO (bloque 1 de N, pendiente CHECK MANUAL) — Rediseño cosmético completo (2026-09-19)

**Alcance confirmado con Samuel:** toda la plataforma Wyrd Forge (Nebu Studio queda fuera — separación
arquitectónica de `CLAUDE.md`, no se tocó ninguna pantalla de Nebu aunque varias comparten el patrón
`fixed inset-0`). Dirección: usar el skill UI/UX Pro Max. Además del estilo/paleta, Samuel pidió
explícitamente modales y animaciones — "que se sienta como una experiencia".

**Hallazgo del skill, con matiz:** el agregador `--design-system` del skill no dio un resultado usable en
dos búsquedas distintas (mismo patrón "Horizontal Scroll Journey" — pensado para landing pages, no un
builder — y mismo estilo "Vibrant & Block-based" — bold/playful, "Best For: startups, gaming,
entretenimiento", no encaja con una herramienta profesional; el markdown que devuelve además tiene un bug
real, imprime filas crudas del CSV sin formatear). Buscando directo en el dominio `style` sí salió un match
bueno: **"Dark Mode (OLED)"** (fondo negro/gris muy oscuro, alto contraste, "Best For: coding platforms",
WCAG AAA). Typography confirmó **Inter** dos veces ("dashboards, admin panels, enterprise apps").

**Buena noticia:** revisando `src/index.css`, la base de Wyrd YA está alineada con esa recomendación —
`--background: 0 0% 5%` (casi OLED), Inter ya importado y usado como fuente del body, `--primary: 355 78%
56%` (el rojo/crimson de marca, que se conserva — no se reemplaza por nada del skill). Cero cambios de
fondo necesarios ahí; el trabajo real está en la capa de interacción, que sí estaba plana.

**Hecho — capa de modales/animación:**
- `src/components/ui/modalMotion.ts` (nuevo) — valores compartidos de framer-motion (`modalBackdropMotion`,
  `modalPanelMotion`) para que todos los modales entren con el mismo fundido + pop, en vez de aparecer de
  golpe. Alcance deliberado: sólo animación de ENTRADA — animar la salida necesitaría `AnimatePresence` en
  cada componente padre que monta/desmonta el modal condicionalmente, un cambio de estructura mucho mayor
  que se queda para después (ver Pendiente). `framer-motion` ya era dependencia del proyecto (usada en
  RoleSelectionPage/SetupPage/Login) — no se agregó nada nuevo.
- Aplicado a los 5 modales centrados reales de Wyrd Forge: `NewProjectModal`, `SettingsModal`,
  `ShareProjectModal`, `MigrationApplyModal` (el de confirmación de DDL destructivo — SÓLO se tocó el
  wrapper visual, cero cambios a la lógica de la frase de confirmación), `CommandModal` (este último
  centraba con `transform` de Tailwind — se separó en un div de posicionamiento estático + un
  `motion.div` interno para la animación, para no pisar el `translate(-50%,-50%)` con el transform que
  escribe framer-motion).
- `HistoryDrawer.tsx`: el panel YA tenía slide animado (`transition-transform`, siempre montado, toggle por
  `isOpen`) — sólo el backdrop aparecía de golpe. Se cambió a siempre-montado + `transition-opacity`, mismo
  patrón que el panel, en vez de agregar framer-motion donde ya había una solución CSS que funcionaba.
- Limpieza de higiene encontrada de paso: `NewProjectModal.tsx` (código de esta misma sesión, ítem 5.2)
  tenía dos emojis como iconos de pestaña (🎨/✨) — el propio checklist del skill lo marca como anti-patrón
  ("No emoji icons — use SVG"). Cambiados a `Palette`/`Sparkles` de lucide-react.
- `npx tsc -b --force` → 0 errores. `node --test "server/*.test.js"` → 653/653 (sin cambios, nada de esto
  toca al servidor). `npx vitest run` → 48/48 (sin cambios). `graphify update .` corrido.

**Bloque 2 (2026-09-19, tarde) — Magic UI + CommandModal como bottom sheet:**

Samuel pidió reestructurar el editor tipo Lovable: navbar superior con iconos para preview/modo
visual/navegador (dropdown de páginas)/un solo botón de viewport (desktop-tablet-móvil)/Código/Settings/
Chat — y que Chat sea "lo más mágico", usando https://github.com/magicuidesign/magicui
(`skills/magic-ui` del propio repo confirma que es instalable vía `npx shadcn@latest add @magicui/<slug>`,
pero `components.json` de este repo sigue apuntando a `tailwind.config.js` (v3) aunque el proyecto ya está
en Tailwind v4 sin ese archivo — correr el CLI contra esa config a medio migrar era el riesgo real, así
que se optó por traer el código fuente directo del repo (`gh api`) en vez de correr el instalador).

**Hecho — los 8 componentes que pidió Samuel, vendorizados y verificados:**
`src/components/magicui/{animated-list,border-beam,code-comparison,number-ticker,progressive-blur,
shimmer-button,text-animate,typing-animation}.tsx`. Dos ajustes necesarios sobre el código tal cual viene
del repo (ninguno cambia su comportamiento visual):
- Todos importaban de `"motion/react"` (el nuevo nombre del paquete que usa el sitio de Magic UI) — el
  proyecto tiene `framer-motion` (mismo API), así que se reescribió el import en los 5 archivos que lo
  traían.
- `code-comparison.tsx` usaba `next-themes` (`useTheme()`) para elegir tema claro/oscuro — Wyrd Forge (la
  plataforma) es siempre oscura, sin ese paquete ni toggle de tema, así que se fijó a `darkTheme` directo,
  se quitó el import y el prop `lightTheme` quedó sin desestructurar (sigue en la interfaz por si algún
  caller lo manda). Este componente también necesitó instalar `shiki` + `@shikijs/transformers` (reales,
  no estaban en `package.json`) para el resaltado de sintaxis del diff antes/después.
- `npx tsc -b --force` → 0 errores con los 8 ya integrados.

**Hecho — CommandModal como bottom sheet, con salida animada (pedido explícito de Samuel a media sesión):**
antes sólo tenía animación de ENTRADA (mismo `modalPanelMotion` que el resto), centrado, `max-w-[900px]
h-[75vh]`. Ahora: `bottomSheetMotion` (nuevo, en `modalMotion.ts`) — entra desde abajo
(`y: '100%' → 0`) y SALE igual (`AnimatePresence` envolviendo el `{isCommandModalOpen && <CommandModal
.../>}` en `StudioEngine.tsx`, algo que ningún otro modal de esta sesión necesitó todavía). Tamaño:
`inset-x-4 bottom-4 h-[88vh]` — casi todo el alto de pantalla, como pidió ("casi tan grande como el
preview"). `modalBackdropMotion` ganó un `exit` (aditivo, no afecta a los 5 modales que ya lo usaban sin
`AnimatePresence` — ese prop simplemente no se usa ahí).
- `npx tsc -b --force` → 0 errores. `node --test "server/*.test.js"` → 653/653 (sin tocar servidor).
  `npx vitest run` → 48/48. `graphify update .` corrido.

**DISEÑADO PERO NO CONSTRUIDO — el resto del pedido de Samuel, para retomar tal cual (se fue del teclado a
media sesión, contenedor con riesgo de cerrarse — esto quedó documentado en vez de improvisado a ciegas):**

Investigué la pantalla ANTES de tocarla (StudioEngine.tsx, ~2000 líneas) — ya existe bastante plomería que
hay que REUSAR, no reconstruir:
- Toggle Interacción/Visual: ya existe (`editMode`, botones en el overlay flotante actual).
- Viewport desktop/tablet/móvil: ya existe pero como 3 botones separados
  (`viewportMode`/`handleViewportChange`, líneas ~2071-2091) — Samuel pide UN solo botón que cicle entre
  los tres, no tres botones.
- Code/Settings: ya son botones que abren `CommandModal`/`SettingsModal` — pero HOY como overlays
  flotantes sobre el preview, no como "el preview desaparece y se ve todo el código" (in-place, tipo VS
  Code simplificado) que pidió Samuel.
- Chat/Visual/Code/Navigate: YA es un sistema de tabs — pero vive DENTRO de `CommandModal` (hay que
  abrirlo primero), no promovido a la navbar persistente que describe Samuel.
- El overlay actual (`absolute top-4 left-1/2 -translate-x-1/2`, línea ~2057) es una píldora flotante
  SOBRE el preview, no una navbar acoplada arriba con los colores de marca, que es lo que pidió.

**Lo que falta construir, mismo bloque, cuando se retome:**
1. Navbar superior persistente (no flotante) con los colores de marca, reemplazando la píldora actual.
2. Un solo botón de viewport que cicle desktop→tablet→móvil (reemplaza los 3 botones separados).
3. Dropdown tipo "navegador" con las páginas del proyecto (NUEVO — no existe nada parecido hoy).
4. Botón "Código": el preview desaparece, se ve `CodePanel` a pantalla completa in-place (no floating).
5. Botón "Settings": mismo trato que Código, pero mostrando el contenido de `SettingsModal` in-place.
6. Botón "Chat": mismo trato, con el `ChatInterface` existente potenciado con los 8 componentes de Magic
   UI ya vendorizados — ideas concretas sin decidir todavía: `border-beam` alrededor de la respuesta activa
   de la IA, `animated-list` para la entrada de mensajes nuevos, `text-animate`/`typing-animation` para el
   streaming de la respuesta, `number-ticker` para créditos/tokens si se muestra un contador,
   `shimmer-button` para el botón de enviar, `progressive-blur` en los bordes de scroll,
   `code-comparison` para diffs de código que la IA proponga (ya no es "genérico", ahora tiene una razón
   de ser real).
7. Contenedor visual del preview en sí (Samuel: "el preview... dentro de un contenedor visual") — no
   quedó del todo claro si es un marco tipo dispositivo (como ya existe parcialmente para tablet/móvil,
   líneas ~2129-2144) o algo más tipo "chrome de navegador" — mejor confirmarlo con Samuel antes de
   construirlo, no adivinarlo.

**Pendiente, bucket 5 ítem 3 en general (sin tocar):** `ForgeDashboard` (cards, hover states) y una
pasada del checklist de calidad del skill (cursor-pointer, contraste, espaciado) sobre esas pantallas.

**Bloque 3 (2026-09-20) — salida animada en los 5 modales + Command Palette que crece + hallazgo de raíz
(bug de Tailwind v4, no sólo cosmético) + paleta Nebu:**

Pedido de Samuel, 4 partes: (a) fade-out en los 5 modales, no sólo entrada; (b) todo más lento, entrada Y
salida; (c) Command Palette nace chico desde abajo y crece hasta llenar pantalla, no sólo desliza; (d) fondo
negro sólido en el modal de chat, en las 4 pestañas, con la MISMA lógica de (e) paleta Nebu en todos los
modales.

**Hecho (a+b+c) — `src/components/ui/modalMotion.ts`:** `modalPanelMotion` ganó `exit` (antes sólo tenía
entrada). Duraciones de `modalBackdropMotion`/`modalPanelMotion` subieron de 0.15/0.18s a 0.32s;
`bottomSheetMotion` de 0.25s a 0.45s y ahora anima también `scale` (0.55→1, `transformOrigin: 'bottom
center'`) además de `y`, para el efecto "nace chico y crece". `AnimatePresence` envuelto en los 4 puntos de
montaje condicional que faltaban (cada modal se monta/desmonta con `{cond && <Modal/>}` en su padre, mismo
patrón que ya tenía `CommandModal` en `StudioEngine.tsx`): `NewProjectModal`/`ShareProjectModal` en
`ForgeDashboard.tsx`, `SettingsModal`/`ShareProjectModal` en `StudioEngine.tsx`, `MigrationApplyModal` en
`DDLApprovalButton.tsx` — sólo el envoltorio visual, cero cambios a la lógica de cada uno (en particular,
`MigrationApplyModal` sigue exigiendo la frase de confirmación exacta igual que siempre).

**Hallazgo de raíz, mientras investigaba (d) "por qué el chat no es negro sino como transparente":**
compilé el proyecto (`npx vite build`) y miré el CSS real que sale al navegador — `bg-card`,
`border-border`, `bg-muted`, `bg-accent`, `bg-destructive`, `bg-secondary`, `text-muted-foreground` (28-42
archivos cada una, `border-border` 40 archivos) no generaban NINGÚN CSS en TODA la plataforma. Causa: el
bloque `@theme` de `src/index.css` (Tailwind v4, líneas 4-10) sólo registraba 4 tokens
(`primary`/`primary-foreground`/`background`/`foreground`); el resto de los nombres semánticos vivían sólo
en el `:root` viejo estilo shadcn v3 (líneas 13-52), que Tailwind v4 no lee para fabricar clases. No era "un
gris poco negro" como asumí en el plan original — el panel del chat literalmente no tenía fondo, se veía lo
que hubiera detrás. **Reencuadrado con Samuel en caliente, evidencia mostrada cruda antes de la lectura**;
decisión: arreglar de raíz, no parchar sólo los 6 modales.

**Hecho (raíz) — `src/index.css`:** 13 tokens nuevos en `@theme` (`--color-card`, `-card-foreground`,
`-secondary`, `-secondary-foreground`, `-muted`, `-muted-foreground`, `-accent`, `-accent-foreground`,
`-destructive`, `-destructive-foreground`, `-border`, `-input`, `-ring`), valor literal copiado del `:root`
correspondiente — puramente aditivo, nada se quitó ni se cambió de valor. `popover`/`sidebar-*` quedaron
fuera a propósito: verificado por grep que ningún componente los usa, agregarlos sería un token sin dueño.
Verificado con build real (no de memoria): antes → `.bg-card{...}` ausente del CSS compilado; después →
`.bg-card{background-color:var(--color-card)}` presente, mismo patrón confirmado para las 9 clases.
`npx tsc -b --force` → 0 errores. `node --test "server/*.test.js"` → 653/653. `npx vitest run` → 48/48
(ninguno de los tests existentes cubre generación de CSS de Tailwind — la verificación de esto fue el build
real, no la batería automática).

**Hecho (d+e) — paleta Nebu en los 6 modales, vía una sola clase de ámbito:** en vez de tocar cada
ocurrencia de color en cada archivo, nueva regla `.nebu-modal` en `index.css` (sin `@layer`, a propósito —
mismo truco que las reglas de `select`/scrollbar que ya vivían ahí sin capa — para ganarle a `@layer theme`
por origen, no por especificidad; verificado en el CSS compilado que la regla queda fuera de cualquier
`@layer`). Sobrescribe `--color-background/-card/-card-foreground/-foreground/-muted/-muted-foreground/
-secondary/-secondary-foreground/-accent/-accent-foreground/-border/-input` a los valores `--nebu-*` que ya
existían en `index.css` sin que ningún componente los usara. El rojo de marca (`--color-primary`/
`-destructive`) NO se toca. Clase `nebu-modal` añadida al panel de `NewProjectModal`, `SettingsModal`,
`ShareProjectModal`, `MigrationApplyModal` y `CommandModal` — en este último, puesta en el panel exterior
para que herede a las 4 pestañas (Chat/Visual/Code/Navigate) sin tocar `ChatInterface.tsx`/`CodePanel.tsx`/
etc. (esos componentes se reusan fuera de `CommandModal` — recolorearlos por dentro habría filtrado Nebu a
contextos donde no se pidió). De paso, `SettingsModal.tsx` (30+ colores `gray-*`/`zinc-*` sueltos, nunca
conectados al sistema de diseño) y `NewProjectModal.tsx` (1 línea) migraron a los tokens semánticos
(`bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`, etc.) — necesario para que la paleta Nebu
les llegue igual que a los otros 4 modales, que ya los usaban.
`npx tsc -b --force` → 0 errores. `node --test "server/*.test.js"` → 653/653. `npx vitest run` → 48/48.
`graphify update .` corrido.

**Bloque 4 (2026-09-20, mismo día) — brandbook OFICIAL de Nebu Studio reemplaza los valores adivinados del
Bloque 3:** Samuel mandó el brandbook real (rojo `#D62828`, negro profundo `#0D0D0D`, carbón `#1A1A1A`,
gris claro `#E8E8E8`, crema `#F5F0EB`, proporción 60% crema/blanco – 30% negro/carbón – 10% rojo,
tipografía Outfit/Inter, principios de minimalismo). Los valores `--nebu-*` que usé en el Bloque 3 (rojo
`#E54D5B`, negro `#0a0a0f`, etc.) NO eran los oficiales — alguien los había puesto de antes, adivinando.

**Dos decisiones de alcance, confirmadas con Samuel antes de tocar código:**
- La proporción 60/30/10 (dominada por claro) aplica SÓLO a superficies de marca (los 4 modales
  administrativos + dashboard + onboarding), NO al área de trabajo del editor (Command Palette:
  Chat/Visual/Código/Navegar), que se queda oscura — es el lienzo de trabajo, no una superficie de marca.
  Deshecho el `nebu-modal` que el Bloque 3 le había puesto a `CommandModal.tsx`.
- Alcance de hoy: sólo Wyrd Forge. Nebu Studio (CRM/Novy) queda fuera, es su propia sesión.

**Hecho — `.nebu-modal` reescrita con los valores oficiales, misma mecánica del Bloque 3 (una sola clase de
ámbito, sin `@layer`, sobrescribe `--color-*`):** fondo/tarjeta blanco `#FFFFFF` + crema `#F5F0EB`, texto
negro profundo `#0D0D0D`, botones/CTA rojo `#D62828` con texto blanco, bordes y superficies secundarias gris
claro `#E8E8E8`. `--color-destructive` (la alarma roja de "esto borra datos para siempre" en
`MigrationApplyModal`) NO se tocó a propósito — usar el mismo rojo ahí que en un botón normal le quitaría la
señal de peligro a la única confirmación irreversible de la plataforma.

**Hecho — migración de colores sueltos que el override no alcanzaba (literales, no tokens):** encontrado
DURANTE la implementación, no antes — varios `text-white` en `SettingsModal.tsx` (título, botones, inputs)
que se habrían vuelto invisibles sobre el nuevo fondo claro → migrados a `text-foreground`. El bloque de
alerta de DDL destructivo en `MigrationApplyModal.tsx` (la pieza de seguridad más delicada de toda la
plataforma) usaba rosa/rojo claro sobre fondo casi negro, ilegible sobre fondo claro → recoloreado a
rojo oscuro sobre fondo rojo pálido, alto contraste, sin tocar la lógica de confirmación. `ShareProjectModal.
tsx` (badges de rol admin/dev/vendedor/cliente, píldora pending/accepted, botón "Revoke") y el banner de
error de `ForgeDashboard.tsx` tenían el mismo patrón (colores claros pensados para fondo oscuro) → todos
recoloreados a sus equivalentes de alto contraste sobre claro.

**Hecho — tipografía:** `--font-display` pasó de "Archivo Black" a "Outfit" (Google Fonts, mismo mecanismo
que Inter). Blast radius confirmado por grep antes de tocar: sólo las 4 pantallas de onboarding
(`Login.tsx`, `RoleSelectionPage.tsx`, `SetupPage.tsx`, `PendingApprovalPage.tsx`) usan la clase
`font-display` hoy — cambia solo, sin tocar esos 4 archivos. Inter se queda para todo el cuerpo de texto.
No se reconstruyó la escala tipográfica completa H1/H2/H3 del brandbook (fuera de alcance de hoy).

**Confirmado como ya cumplido, sin trabajo pendiente:** iconografía monocromática (lucide-react ya renderiza
en un solo color por diseño) y "cero plantillas genéricas" (la UI ya es a medida, no viene de Canva/
plantillas). No son tareas, son verificaciones.

`npx tsc -b --force`: 0 errores. `node --test "server/*.test.js"`: 653/653. `npx vitest run`: 48/48.
Verificado con build real (`npx vite build`) que `.nebu-modal` y `--font-display: "Outfit"` compilan
correctamente antes de dar el bloque por bueno.

**PENDIENTE PARA DESPUÉS — anotado, no resuelto hoy (dos residuos del mismo tamaño, mismo motivo: son
pantallas/paneles construidos con colores fijos en vez del sistema de tokens, así que el truco de
`.nebu-modal` no les llega):**
1. **Onboarding (Login, selección de rol, setup, pendiente de aprobación):** 4 pantallas hechas a mano con
   colores fijos (`bg-[#0A0A0A]`, `text-[#E60000]`, gradientes de opacidad de blanco para la jerarquía de
   texto — 8 a 13 apariciones por archivo), con una animación de "pincel de tinta" para el texto "NEBU
   STUDIO", cuadrícula de fondo y viñeteado, todo diseñado para verse sobre negro. Convertirlas a
   claro/crema es rediseñar el efecto (hoy: texto blanco fantasma revelándose sobre negro; en claro sería
   al revés) más el rojo exacto (`#E60000` actual no es siquiera el `#D62828` oficial) — no es un cambio de
   paleta, es diseño nuevo. Necesita su propia sesión con mockup delante.
2. **Contenido de 8 sub-pestañas de Database + Domains + Email + Deploy, dentro de `SettingsModal`:** el
   MARCO del modal (fondo, título, las 7 pestañas principales) ya quedó con la marca correcta — es el
   CONTENIDO de esas pestañas específicas el que tiene 224 clases de color oscuras sueltas repartidas en 11
   archivos (`SecretsPanel` 26, `SchemaViewer` 16, `SQLEditor` 20, `DatabaseOverview` 16,
   `EdgeFunctionsPanel` 14, `LogsViewer` 13, `UsagePanel` 10, `UsersManager` 19, `DomainsPanel` 22,
   `EmailPanel` 54, `DeployManager` 14) — se van a ver oscuras flotando dentro del modal claro. Encontrado
   mientras se hacía este bloque, no antes; no se tocó ninguno de los 11 archivos hoy.

**CHECK MANUAL — PENDIENTE.** Cómo reproducirlo (dev server local o `sesión-5` desplegada):
1. Abre y cierra, uno por uno: New Project, Settings, Share, History. Cada uno debe entrar Y salir con un
   fundido/pop notorio (más lento que antes), ahora con fondo claro/crema, texto negro, acentos rojos.
2. Si hay una migración destructiva pendiente: `MigrationApplyModal` debe verse clara con el bloque de
   alerta en rojo oscuro sobre rosa pálido bien legible, y debe seguir pidiendo la frase de confirmación
   exacta antes de dejar aplicar (esto NO debía cambiar).
3. Abre el Command Palette: debe seguir OSCURO como antes de este bloque (no debe verse afectado por el
   cambio de marca) — nace chico desde abajo y crece hasta ocupar casi toda la pantalla.
4. Abre Settings → pestaña Secrets (la que abre por default) y Database → Schema (default): el MARCO
   (fondo, título, pestañas) debe verse claro/marca; el CONTENIDO de esas pestañas puede verse oscuro
   todavía (residuo conocido, anotado arriba, no es sorpresa).
5. En el dashboard (lista de proyectos): fondo claro/crema, tarjetas blancas, acentos rojos en hover/CTA.
6. El Command Palette y el editor detrás de los modales deben verse EXACTAMENTE igual que antes de este
   bloque — el brandbook es sólo para las superficies de marca.

Mundos pre-registrados:
- **Esperado:** los 4 modales administrativos + dashboard se ven claros/crema con acentos rojos oficiales
  (`#D62828`) y texto negro (`#0D0D0D`); el Command Palette y el editor siguen oscuros sin cambios; la
  alerta de migración destructiva se lee claro y sigue pidiendo la frase.
- **Residuo conocido, no bug:** el contenido de Database/Domains/Email/Deploy dentro de Settings se ve
  oscuro (anotado arriba, su propio bloque futuro); el onboarding sigue con su diseño oscuro anterior
  (anotado arriba, su propio bloque futuro).
- **Falla real (si aparece, SÍ es bug):** algún modal se ve sin fondo/transparente, texto negro sobre fondo
  oscuro o texto claro sobre fondo claro en CUALQUIER parte del marco de los 4 modales o el dashboard
  (harían el texto ilegible), el Command Palette cambió de apariencia sin que se le tocara nada, o
  `MigrationApplyModal` deja aplicar sin pedir la frase.

**REENCUADRE (2026-09-20, antes de correr el check):** el mundo pre-registrado original (abajo, ya
corregido) describía `CommandModal` como "sigue centrado en pantalla" — eso era cierto para el Bloque 1,
pero el Bloque 2 (ya commiteado, `972ab79`) lo cambió deliberadamente a bottom sheet
(`inset-x-4 bottom-4 h-[88vh]`, entra desde abajo, y ahora también SALE animado vía `AnimatePresence` en
`StudioEngine.tsx`). Verificado leyendo `CommandModal.tsx` y `StudioEngine.tsx` antes de escribir esto, no
de memoria. El paso 4 y la falla-real de abajo quedan corregidos para reflejar el estado real del código;
el resto del check (pasos 1-3, los otros 4 modales) no cambió.

**CHECK MANUAL — PENDIENTE.** Cómo reproducirlo (dev server local o `sesión-5` desplegada):
1. Abrir "New Project" — el modal debe entrar con un fundido + pop suave, no aparecer de golpe.
2. Abrir Settings, Share, History (el ícono de historial) — mismo fundido en cada uno; History además debe
   seguir deslizando desde la derecha como antes.
3. Si hay una migración destructiva pendiente para probar, confirmar que `MigrationApplyModal` anima igual
   Y que la frase de confirmación sigue exigiéndose exactamente igual que antes (esto NO debía cambiar).
4. Abrir el Command Palette (botón "Código" o como se dispare) — debe entrar como panel deslizante desde
   ABAJO, ocupando casi toda la altura de pantalla (no centrado, no un cuadro chico). Cerrarlo: debe
   deslizarse de vuelta hacia abajo y desvanecerse (salida animada), no desaparecer de golpe.

Mundos pre-registrados:
- **Esperado:** los 5 modales + el drawer de historial entran con el mismo fundido/pop consistente (New
  Project, Settings, Share, MigrationApplyModal, History); `CommandModal` entra Y sale como bottom sheet
  animado, ocupando casi toda la pantalla. Ninguna lógica de confirmación/contenido cambiada.
- **Falla real (si aparece, SÍ es bug):** `CommandModal` aparece centrado o como cuadro chico (señal de que
  quedó código viejo sin actualizar), no anima al cerrarse (aparece/desaparece de golpe pese al
  `AnimatePresence`), o `MigrationApplyModal` deja aplicar sin pedir la frase de confirmación en el caso
  destructivo.

### Resto del bucket (sin tocar esta sesión)
- RAG de UI/UX: PatternRetriever da `direct: 0 | vector: 0`. Primera pregunta: ¿pasa igual en producción?
- Catálogo de componentes, con auditoría de licencia por componente.
- B-restos: transparencia de plan en generación inicial, persistencia del bloque de plan al recargar (incluye el aviso que no persiste, de G-4), espaciado.
- B4: edición de plan.
- Que el plan imprima el nombre final de la migración, no el que dijo el modelo.
- (de ítem 3, G-6) Cómo traducir el aviso técnico del guard de código de cliente
  ("mueve esto a una función de servidor") a algo que un usuario NO técnico pueda accionar solo.
- (de ítem 3, G-6) Qué hacer con los límites aceptados del guard de código de cliente (sin memoria entre
  intents, sin detección de alias de import, sin aviso en el chat desde fast/simple lane): ¿se quedan
  como están o hay una decisión de producto pendiente ahí?

## 6. BUCKET Calidad del modelo
- Bug de recomendaciones: no muestra filas que SÍ están en la DB; la IA respondió dos veces "compila y no encuentro errores".
- Reglas duras incumplidas: tocó `package.json` pese a prohibición explícita; añadió comportamiento no pedido dos veces.
- Detectar que lo pedido YA EXISTE y responder "ya está construido". OJO: rompe la batería de regresión sobre fixtures ya construidos → necesita plan de checkpoints con fixtures vírgenes.
- Precisión de atribución de imágenes.

---

## 7. Tutorial para desarrolladores — uso correcto de Wyrd

Falta un tutorial, en idioma llano (no jerga), dirigido a quien usa Wyrd para construir su app: qué hacer,
qué NO hacer, cómo funciona el software en general. Dos requisitos ya decididos con Samuel (2026-09-19),
no opcionales, nacidos del diseño del ítem 4:

- Debe decir EXPLÍCITAMENTE que cualquier flujo que dependa de identidad real (login, panel de admin) sólo
  se puede probar una vez hecho el DEPLOY — nunca dentro del editor/preview. Ligado al guard de identidad
  del ítem 4 (login real + Edge Function con JWT/JWKS); revisar esa sección para el estado del guard antes
  de escribir esta parte del tutorial.
- Requisito de producto, no sólo de documentación: aunque ese flujo puntual no sirva en el preview, TODO
  LO DEMÁS del panel/sección debe seguir siendo navegable y usable ahí. Ejemplo real: si el sistema
  completo es esencialmente un panel de admin (caso Comedor), en el preview se debe poder recorrer y
  probar TODO salvo el chequeo de identidad en sí — nunca la sección entera en blanco o inalcanzable por
  culpa del login. Esto también es una regla para el modelo (ítem 4, Bloque 2), no sólo para el tutorial.

Pendiente: escribir el tutorial (sesión de producto, bucket 5, con mockup) una vez cerrado el ítem 4.

## APARCADO hasta después de lanzar
- **A+**: quitar el botón de aprobación cuando el guard no pudo inspeccionar. Aparcado: `unparseable` no tiene causa conocida tras G-3; sólo verificable con SQL fabricado a mano (choca con medir por comportamiento).
- **Auditoría del pipeline de deploy** (absorbe D-5).
- **D-2**: DDL auto-apply híbrido (auto para aditivo; frase tecleada para destructivo). ABSOLUTO ÚLTIMO, diseño en frío propio.
- **Análisis Dyad**: sesión timeboxed sobre un clon. `src/pro` NO LEER.
- **Rotaciones**: `ADMIN_BOOTSTRAP_SECRET`; localizar dónde vive la clave `sb_secret_` (equivale a service_role); `SUPABASE_MANAGEMENT_TOKEN` en Render es un PAT clásico con acceso total a la cuenta.
- **Auditoría técnica externa de pago**: los buckets 3 y 4 son agujeros de seguridad que no se cierran con confianza desde dentro. Es un proveedor, no una sesión.

## SIN CONFIRMAR (verificar si siguen vivos o ya se cerraron)
- Unsplash Bloque 3 (reserva de imagen hero, guard anti-duplicado en Verifier, trigger de `download_location`) y verificación de que los créditos del footer se renderizan en un proyecto generado real. Rama `claude/keen-mccarthy-oknmc8`.
- Aprobación de Unsplash en producción (hoy en modo demo, 50 req/h). Prerrequisito antes de añadir cualquier proveedor de imágenes con IA.
- Ruta `/api/admin/bootstrap-db` con comentario "TEMPORAL": se decidió conservarla y quitar el comentario en una cirugía de servidor.
- Decisión sobre `graphify-out/cache/ast/` y archivos `.sig`: ¿se commitean o van a `.gitignore`?

## Decisión de arquitectura permanente
- **D-1 (preview)**: el endgame es la Opción C (sandboxes server-side efímeros, estilo Lovable). Se ejecuta sólo cuando el software esté casi completo. Hoy: vendoring curado (Opción A).