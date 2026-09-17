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

**Pendiente, no de esta sesión:** ampliar también a políticas públicas sobre tablas SIN columna de rol
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

## 3. Guard de código bajo `src/`
Detectar credenciales de terceros embebidas en cliente y escrituras a tablas de rol desde el navegador.
No tiene embudo propio: hay que construir el punto de inspección (el Verifier repara compilación, no inspecciona).

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