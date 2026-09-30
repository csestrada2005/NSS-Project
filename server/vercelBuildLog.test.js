import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTypeErrorsFromBuildLog } from './vercelBuildLog.js';

// Log real de Vercel que pegó Samuel (2026-09-30), como lo entrega la API:
// un evento por línea, texto en payload.text (o en text, la otra forma).
const REAL = [
  'Running "npm run build"',
  '> tsc -b && vite build',
  'src/components/sections/CommentsSection.tsx(99,15): error TS2554: Expected 2 arguments, but got 1.',
  'src/components/sections/ProfileUploadSection.tsx(69,19): error TS2345: Argument of type \'{ url: string | null; error: string | null; }\' is not assignable to parameter of type \'SetStateAction<string | null>\'.',
  "src/lib/aiChat.ts(64,10): error TS2352: Conversion of type 'ImportMeta' to type 'Record<string, unknown>' may be a mistake.",
  "  Type 'ImportMeta' is not comparable to type 'Record<string, unknown>'.",
  "    Index signature for type 'string' is missing in type 'ImportMeta'.",
  'Error: Command "npm run build" exited with 2',
];

test('extrae los errores de tsc del log real, con su detalle indentado', () => {
  const events = REAL.map((text, i) => (i % 2 ? { type: 'stderr', payload: { text } } : { type: 'stdout', text }));
  const errors = extractTypeErrorsFromBuildLog(events);
  assert.deepEqual(errors.map((e) => `${e.file}:${e.line}:TS${e.code}`), [
    'src/components/sections/CommentsSection.tsx:99:TS2554',
    'src/components/sections/ProfileUploadSection.tsx:69:TS2345',
    'src/lib/aiChat.ts:64:TS2352',
  ]);
  assert.equal(errors[2].message.split('\n').length, 3, 'las dos líneas de detalle se suman al error');
  assert.equal(errors[1].column, 19);
});

test('tolera la hora delante (formato del panel de Vercel) y rutas absolutas del builder', () => {
  const text = [
    '15:50:16.217 /vercel/path1/src/pages/AdminPanel.tsx(170,17): error TS2322: Type X is not assignable.',
    "15:50:16.219   Property 'onCancel' does not exist on type 'Y'.",
  ].join('\n');
  const [e] = extractTypeErrorsFromBuildLog([{ payload: { text } }]);
  assert.equal(e.file, 'src/pages/AdminPanel.tsx');
  assert.match(e.message, /onCancel/);
});

test('un build que falla por otra cosa no inventa errores de tipos', () => {
  const events = [{ text: 'npm ERR! code ERESOLVE' }, { text: 'Error: Command "npm install" exited with 1' }];
  assert.deepEqual(extractTypeErrorsFromBuildLog(events), []);
  assert.deepEqual(extractTypeErrorsFromBuildLog(null), []);
  assert.deepEqual(extractTypeErrorsFromBuildLog([null, 5, { payload: {} }]), []);
});
