# QUEUE.md — Cola de Wyrd Forge

Fuente de verdad de lo que falta. Claude Code la lee en Fase 0 y la actualiza al cierre.
Regla de Nebu: las sesiones existen para REDUCIR esta cola, no para agrandarla.
Un hallazgo nuevo se funde en un bucket existente siempre que se pueda; sólo abre ítem propio si no cabe en ninguno.

Último estado conocido: deploy `97fe8a8` (G-4, 2026-09-17). G-3 mergeado en main como `b878db0`.
Re-verificar con Fase 0 antes de confiar en cualquier hash de este archivo.

---

## 0. PRIORIDAD — Guard RLS no actuó tras G-4 (reabre la confianza en G-3)

**Qué pasó:** al cerrar G-4, sobre Vertigo, el guard RLS no hizo nada en dos corridas:
- `control_cd_g4` (database_change): migración persistida SIN `enable row level security`.
- `customer_reviews` (new_feature): insert público `with check (true)` con su comentario, intacto.
- Ninguna marca `[RLS_*]` en `forge_intent_log`.
- Las dos migraciones quedaron SIN aplicar (residuo en Vertigo: tenerlo en cuenta al pre-registrar mundos).

**Por qué importa:** G-3 se verificó en producción con renombrado presente y el guard sí actuó.
Ahora, con G-3 ya en main, no actúa. O hay una regresión, o hay un camino que G-3 no cubrió.
Recordatorio: la Pieza 1 de G-3 quedó SIN test automático (riesgo asumido). Esto es exactamente ese riesgo.

**Primera pregunta de diagnóstico:** ¿qué diferencia estas dos corridas de la corrida que pasó en G-3?

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