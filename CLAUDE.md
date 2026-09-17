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
1. **Fase 0** (antes de tocar nada): `git fetch`, `git rev-parse HEAD`, `git log -1`, y comparar con el hash de `/api/health` en producción. Si no coinciden, STOP y reportar.
2. **Brief escrito** antes de ejecutar cualquier bloque. Paso cero de todo brief: `git merge-base --is-ancestor <hash> HEAD && echo BASE_OK`.
3. **Diseño en frío** en Plan Mode. No se edita código hasta que Samuel apruebe el plan.
4. **Mundos pre-registrados** antes de cada ejecución, incluidos los mundos de fallo. Deben reflejar el estado REAL de los fixtures (con sus residuos conocidos), no uno idealizado.
5. **Bloques atómicos**: un bloque/PR a la vez, re-verificación antes de abrir el siguiente.
6. **STOP ante cualquier mundo inesperado.** Sin remediación en caliente, sin hotfixes. Devolver el control.
7. **Evidencia cruda antes de interpretación.** Mostrar la salida literal del terminal y SEPARADA de tu lectura de ella.
8. Si la evidencia contradice la premisa del brief, reencuadra la sesión sin pedir permiso, y dilo explícitamente.
9. **Cierre**: actualizar `docs/QUEUE.md`, declarar qué evidencia se borró en la higiene, y dejar un resumen de cierre.

## Límites duros
- **Git es dominio exclusivo de Samuel**: merges, deploys y ramas los hace él. Puedes commitear en la rama de trabajo; la barrera real es que Samuel lea el diff antes del merge.
- Verificación de diffs: desde referencias frescas (`git fetch` antes). `git diff --stat` contra un `origin/main` viejo ya dio falsos positivos.
- **DDL destructivo**: exige frase de confirmación tecleada por Samuel. El SQL no se muestra hasta que llegue la frase.
- `projectId` declarado y confirmado (visible en la URL) antes de cualquier checkpoint en vivo en la UI de Wyrd.
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

## Graphify — cuándo sí y cuándo no
- SÍ (acreditado): ubicación de archivos, imports, contención de módulos.
- NO: call sites de despacho dinámico (`getInstance().method()`) ni menciones en strings/prompts → usar `grep`.
- Todo lo que salga del grafo se confirma con `view` antes de entrar en un checkpoint. El grafo apunta, el archivo confirma.
- Si el grafo puede estar viejo (commits desde el último rebuild), trátalo como pista, no como evidencia.

## Tablas clave (DB principal)
`forge_files`, `forge_intent_log`, `forge_project_memory`, `forge_projects`, `forge_chat_messages`, `forge_snapshots`, `forge_credit_wallets`, `forge_credit_transactions`. Función `deduct_credits` (sólo service_role).
`forge_intent_log` no tiene DDL en el repo: su forma vive sólo en la DB.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
