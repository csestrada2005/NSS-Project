import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// REGLA DURA CONGELADA — exec_sql jamás en el proyecto Supabase PRINCIPAL.
//
// `src/` es exclusivamente código del builder Wyrd y todo su acceso a Supabase
// va por SupabaseService.getInstance().client, que es el cliente del proyecto
// PRINCIPAL (src/config.ts → VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
// exec_sql es una función `security definer` que ejecuta SQL arbitrario: en el
// principal equivaldría a entregar la base de datos de la plataforma entera.
// Su único destino legítimo son los proyectos GENERADOS, donde la instala
// server/bootstrapProject.js vía Management API.
//
// Por eso la regla aquí es ABSOLUTA y sin allowlist: ningún .ts/.tsx bajo src/
// puede contener siquiera el literal `exec_sql`. El SQL de un proyecto generado
// se enruta por ProjectDBService → /api/db/:projectId/query, que lo ejecuta
// server-side contra el cliente de ESE proyecto.
// ---------------------------------------------------------------------------

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const FORBIDDEN = 'exec_sql';

/** Recorre src/ y devuelve las rutas de todos los .ts/.tsx. Nunca entra en node_modules. */
function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      acc.push(full);
    }
  }
  return acc;
}

test('el walker encuentra fuentes en src/ (guarda de que el test no pasa en vacío)', () => {
  const files = collectSourceFiles(SRC_DIR);
  assert.ok(files.length > 0, 'no se encontró ningún .ts/.tsx bajo src/');
  assert.ok(
    files.every(f => !f.split(path.sep).includes('node_modules')),
    'el walker no debe recorrer node_modules'
  );
  assert.ok(
    files.every(f => f.endsWith('.ts') || f.endsWith('.tsx')),
    'el walker solo debe recoger .ts/.tsx'
  );
});

test('ningún .ts/.tsx de src/ menciona exec_sql', () => {
  const offenders = [];
  for (const file of collectSourceFiles(SRC_DIR)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes(FORBIDDEN)) {
        offenders.push(`  ${path.relative(path.join(SRC_DIR, '..'), file)}:${i + 1}: ${line.trim()}`);
      }
    });
  }

  assert.equal(
    offenders.length,
    0,
    'REGLA DURA VIOLADA: exec_sql aparece en src/.\n\n' +
    offenders.join('\n') +
    '\n\nexec_sql JAMÁS debe existir ni invocarse sobre el cliente del proyecto\n' +
    'Supabase PRINCIPAL de Wyrd — es SQL arbitrario `security definer` sobre la\n' +
    'base madre. Todo src/ habla con ese cliente principal, así que la regla\n' +
    'aquí es absoluta y sin allowlist.\n' +
    'El SQL de un proyecto GENERADO va por ProjectDBService →\n' +
    'POST /api/db/:projectId/query, que lo ejecuta server-side contra el cliente\n' +
    'de ese proyecto. exec_sql solo se instala en proyectos generados, vía\n' +
    'server/bootstrapProject.js (Management API). Ver el AVISO DE SEGURIDAD en\n' +
    'la cabecera de ese archivo.'
  );
});
