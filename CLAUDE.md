# CLAUDE.md — Wyrd Forge (NSS-Project)

Este archivo lo lee Claude Code al inicio de cada sesión. Es la fuente de verdad del protocolo.
La cola de trabajo vive en `docs/QUEUE.md`. Léela al empezar y actualízala al cerrar.

## Qué es esto
Wyrd Forge: builder web con IA en el navegador. El usuario escribe un prompt y un pipeline genera una app React viva.
Stack: React/TS (Vite), Express (`server.js` en raíz), Supabase, compilador basado en esbuild. Deploy en Render.
El monorepo también contiene Nebu Studio (CRM, asistente Novy vía `/api/chat`). Deben seguir arquitectónicamente separados.

## Reglas de comunicación (permanentes)
- Samuel tiene conocimiento técnico bajo. Toda explicación técnica lleva primero una versión "peras y manzanas": qué cambia y por qué.
- Toda decisión se presenta con opciones con nombre, el costo real de cada una en lo que ve el usuario final, y una recomendación explícita.
- Nunca presentar decisiones en términos puramente técnicos.
- Idioma: español.

## Protocolo de sesión — "1 sesión = 1 cirugía completa"
1. **Diseño en frío** en Plan Mode, si no estas en Plan Mode al iniciar una sesión no actues. No se edita código hasta que Samuel apruebe el plan.
2. **Mundos pre-registrados** antes de cada ejecución, incluidos los mundos de fallo. Deben reflejar el estado REAL de los fixtures (con sus residuos conocidos), no uno idealizado.
3. **Bloques atómicos**: un bloque/PR a la vez, re-verificación antes de abrir el siguiente.
4. **CHECKS MANUALES**: una vez hecho modificaciones en el código y estemos listos para checar los mundos pre-registrados detente, hago checks en el software deployed con los cambios que hagas y comparamos mundos pre-registrados y lo que en verdad paso. 
5. **STOP ante cualquier mundo inesperado.** Sin remediación en caliente, sin hotfixes. Devolver el control.
6. **Evidencia cruda antes de interpretación.** Mostrar la salida literal del terminal y SEPARADA de tu lectura de ella.
7. Si la evidencia contradice la premisa del brief, reencuadra la sesión sin pedir permiso, y dilo explícitamente.
8. **Cierre**: actualizar `docs/QUEUE.md`, declarar qué evidencia se borró en la higiene, y dejar un resumen de cierre.

## Límites duros
- **DDL destructivo**: exige frase de confirmación tecleada por Samuel. El SQL no se muestra hasta que llegue la frase.
- Cada query declara explícitamente contra qué base de datos corre (DB principal de Wyrd vs Supabase del fixture).
- Antes de consultar una tabla no verificada en la sesión: `information_schema.columns`.
- Dyad: `src/pro` es licencia FSL, **NO LEER**. El resto es Apache 2.0.
- NO escribir el literal `exec_sql` en ningún `.ts/.tsx` de `src/`, ni en comentarios (`mainProjectExecSql.test.js` rompe `npm test`).
- No unificar los dos `fetch` a `/api/chat-forge` (PlatformService.ts y Implementer.ts): la bifurcación es intencional.
- Nunca pegar secretos ni prefijos de tokens en archivos, commits ni chat.

## Fixtures
- `087ddaf3-6236-47ae-ba72-bc96887a9691` = Vertigo Expedition ↔ Supabase ref `ksjpiuajgjujsijbspig`. ("nebu-087ddaf3" es el display name, NO el ref.)
- `510afe69-dd55-4fd2-a89c-87b1fc44c8c3` = Bakery NUEVO (sin DB real, `supabase_project_ref` NULL).
- `ecd7929b` = Crumb and Hearth (fixture de regresión).
- `bf056358` = control intocable. No modificar ni experimentar.
- Un mundo "cero" en Supabase incluye 6 event triggers instalados por la plataforma.

## Comandos
- Tests server: `node --test "server/*.test.js"` · UI: `npx vitest` · todo: `npm test`
- Build: `npx tsc -b --force` (NUNCA `tsc --noEmit`: sale 0 sin compilar en esta config)
- Harnesses: `scripts/compilerPerfHarness.mjs`, `scripts/classifierHarness.mjs` (aislado, sin créditos ni DB)
- Si `node_modules/@esbuild/` está vacío: `npm install` de nuevo.

## Tablas clave (DB principal)
`forge_files`, `forge_intent_log`, `forge_project_memory`, `forge_projects`, `forge_chat_messages`, `forge_snapshots`, `forge_credit_wallets`, `forge_credit_transactions`. Función `deduct_credits` (sólo service_role).
`forge_intent_log` no tiene DDL en el repo: su forma vive sólo en la DB.

## graphify

Este proyecto cuenta con un grafo de conocimiento en `graphify-out/` que incluye nodos principales (*god nodes*), estructura de comunidades y relaciones entre archivos.

Reglas:
- Para consultas sobre el código, primero ejecuta `graphify query "<pregunta>"` cuando exista el archivo `graphify-out/graph.json`. Utiliza `graphify path "<A>" "<B>"` para analizar relaciones y `graphify explain "<concepto>"` para conceptos específicos. Estos comandos devuelven un subgrafo acotado, generalmente mucho más manejable que `GRAPH_REPORT.md` o la salida bruta de `grep`.
- Si existe `graphify-out/wiki/index.md`, úsalo para la navegación general en lugar de explorar el código fuente directamente.
- Consulta `graphify-out/GRAPH_REPORT.md` únicamente para una revisión arquitectónica general o cuando los comandos `query`, `path` o `explain` no proporcionen suficiente contexto.
- Tras modificar el código, ejecuta `graphify update .` para mantener el grafo actualizado (basado únicamente en el AST, sin coste de API).
