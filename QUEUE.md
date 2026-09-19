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
finding/marca/aviso). `npx vitest run` → 41/41 verdes. `npx tsc -b --force` → 0 errores. Sin commitear
todavía (pendiente de que Samuel lo pida explícitamente).

---

**CHECK MANUAL — PENDIENTE (requiere deploy, no se hizo en esta sesión)**

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

**Resultado (Samuel lo añade aquí manualmente tras el deploy):**


---

## 4. Hueco conceptual RLS ↔ Edge Function
El modelo no entiende que RLS y Edge Function son dos capas de la MISMA defensa. Cuatro evidencias acumuladas.
Es material de BACKEND_RULES / Architect, no un módulo nuevo.

## 5. BUCKET Producto y UX
Una sola sesión de decisión, con mockup delante. Incluye:
- Panel Cloud: 5 paneles desmontados + remontar EdgeFunctionsPanel apuntando a `edgeFunctionPath.js`.
- Variantes de diseño + preguntas interactivas al iniciar proyecto.
- Rediseño cosmético completo.
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