import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { typecheckProject, formatTypeIssue, DEFAULT_TYPEENV_DIR } from './typecheck.js';

// ---------------------------------------------------------------------------
// typecheck — la revisión de tipos del servidor da el mismo veredicto que
// `tsc -b` en Vercel, arregla sólo imports sin usar, y nunca confunde "no
// tengo los tipos de ese paquete" con un error del proyecto.
// Requiere server/typeenv instalado (lo instala el postinstall de la raíz).
// ---------------------------------------------------------------------------

const installed = fs.existsSync(path.join(DEFAULT_TYPEENV_DIR, 'node_modules', 'typescript', 'package.json'));
const skip = installed ? false : 'server/typeenv no está instalado (npm install en la raíz lo instala)';

const APP = `import { useState } from 'react';
export function App() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>{n}</button>;
}
`;

test('proyecto limpio: sin errores', { skip }, () => {
  const r = typecheckProject({ 'src/App.tsx': APP });
  assert.equal(r.available, true);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.fixedFiles, {});
});

test('imports sin usar se borran solos y el resto del archivo no cambia', { skip }, () => {
  const src = `import { Link } from 'react-router-dom';\nimport React from 'react';\n${APP}`;
  const r = typecheckProject({ 'src/App.tsx': src, 'src/Other.tsx': 'export const x = 1;\n' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.autoFixed, 2);
  assert.deepEqual(Object.keys(r.fixedFiles), ['src/App.tsx'], 'sólo se toca el archivo con imports sin usar');
  assert.equal(r.fixedFiles['src/App.tsx'], APP);
});

test('errores reales: archivo, línea y código como tsc', { skip }, () => {
  const src = `interface U { id: string }
export function A({ ok }: { ok?: () => void }) {
  const u = { id: '1' } as U;
  return <div onClick={ok}>{(u as U & {}).missing}</div>;
}
export const B = () => <A ok={() => {}} onCancel={() => {}} />;
`;
  const r = typecheckProject({ 'src/A.tsx': src });
  const codes = r.errors.map((e) => `${e.file}:${e.line}:TS${e.code}`);
  assert.deepEqual(codes, ['src/A.tsx:4:TS2339', 'src/A.tsx:6:TS2322']);
});

test('paquete npm sin tipos en el entorno → no verificable; import relativo roto → error', { skip }, () => {
  const src = `import Thing from 'some-unknown-pkg';
import { missing } from './nope';
export const C = () => <Thing value={missing} />;
`;
  const r = typecheckProject({ 'src/C.tsx': src });
  assert.deepEqual(r.unverifiable.map((e) => e.code), [2307]);
  assert.match(r.unverifiable[0].message, /some-unknown-pkg/);
  assert.equal(r.errors.some((e) => e.code === 2307 && /\.\/nope/.test(e.message)), true);
});

test('librerías de la plantilla resuelven con sus tipos (framer-motion, lucide, supabase, alias @/)', { skip }, () => {
  const src = `import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
export const client = createClient('https://x.supabase.co', 'k');
export const D = () => <motion.div className={cn('a')}><Star size={12} /></motion.div>;
`;
  const r = typecheckProject({ 'src/D.tsx': src, 'src/lib/utils.ts': 'export const cn = (...c: string[]) => c.join(" ");\n' });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.unverifiable, []);
});

test('los mensajes citan otros archivos con ruta relativa al proyecto', { skip }, () => {
  const lib = 'export interface AppUser { id: number }\nexport const load = (): AppUser[] => [];\n';
  const table = `import { load } from '../lib/users';
interface AppUser { id: string }
export const first: AppUser = load()[0];
`;
  const r = typecheckProject({ 'src/lib/users.ts': lib, 'src/components/Table.tsx': table });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].code, 2322);
  assert.match(r.errors[0].message, /import\("src\/lib\/users"\)/);
  assert.equal(r.errors[0].message.includes('__project__'), false);
});

test('autoFix:false reporta los imports sin usar y no escribe nada', { skip }, () => {
  const r = typecheckProject({ 'src/App.tsx': `import React from 'react';\n${APP}` }, { autoFix: false });
  assert.deepEqual(r.fixedFiles, {});
  assert.deepEqual(r.errors.map((e) => e.code), [6133]);
});

test('respeta el tsconfig.app.json del proyecto', { skip }, () => {
  const tsconfig = JSON.stringify({ compilerOptions: { jsx: 'react-jsx', strict: true, noUnusedLocals: false, module: 'ESNext', moduleResolution: 'bundler', target: 'ES2020', lib: ['ES2020', 'DOM'] } });
  const r = typecheckProject({ 'tsconfig.app.json': tsconfig, 'src/App.tsx': `import React from 'react';\n${APP}` }, { autoFix: false });
  assert.deepEqual(r.errors, []);
});

test('sin entorno instalado: available false, nunca lanza', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wyrd-noenv-'));
  try {
    assert.deepEqual(typecheckProject({ 'src/App.tsx': APP }, { typeEnvDir: empty }), { available: false, reason: 'typeenv not installed' });
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('formatTypeIssue imita la salida de tsc', () => {
  assert.equal(
    formatTypeIssue({ file: 'src/A.tsx', line: 4, column: 31, code: 2339, message: "Property 'x' does not exist" }),
    "src/A.tsx(4,31): error TS2339: Property 'x' does not exist"
  );
  assert.equal(formatTypeIssue({ file: null, line: null, column: null, code: 5, message: 'm' }), 'error TS5: m');
});
