import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyProductionSupabaseClient,
  SUPABASE_CLIENT_PATH,
  PRODUCTION_SUPABASE_CLIENT_SOURCE,
} from '../src/utils/deploySupabaseClient.js';

// ---------------------------------------------------------------------------
// G-7 Bloque 1 — swap del cliente Supabase modo-preview por el de producción
// SOLO en el paquete que /api/deploy/:projectId manda a Vercel. Ver
// src/utils/deploySupabaseClient.js para el diagnóstico completo (el mismo
// archivo persistSession:false/autoRefreshToken:false/lock no-op, necesario
// dentro del iframe sandbox del builder, se publicaba tal cual al dominio
// real, donde esa restricción no existe y sólo bloqueaba cualquier sesión).
// ---------------------------------------------------------------------------

const PREVIEW_CLIENT_SOURCE = `
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        lock: async (_name, _acquireTimeout, fn) => await fn(),
      },
    })
  : null
`;

test('applyProductionSupabaseClient — reemplaza src/lib/supabase.ts por el cliente de producción', () => {
  const files = {
    'src/App.tsx': 'export default function App() { return null; }',
    [SUPABASE_CLIENT_PATH]: PREVIEW_CLIENT_SOURCE,
  };

  const result = applyProductionSupabaseClient(files);

  assert.equal(result[SUPABASE_CLIENT_PATH], PRODUCTION_SUPABASE_CLIENT_SOURCE);
  assert.equal(result['src/App.tsx'], files['src/App.tsx']);
});

test('applyProductionSupabaseClient — el cliente de producción no trae las tres banderas de preview', () => {
  assert.doesNotMatch(PRODUCTION_SUPABASE_CLIENT_SOURCE, /persistSession/);
  assert.doesNotMatch(PRODUCTION_SUPABASE_CLIENT_SOURCE, /autoRefreshToken/);
  assert.doesNotMatch(PRODUCTION_SUPABASE_CLIENT_SOURCE, /lock:/);
});

test('applyProductionSupabaseClient — nunca muta el objeto files de entrada', () => {
  const files = {
    [SUPABASE_CLIENT_PATH]: PREVIEW_CLIENT_SOURCE,
  };
  const original = { ...files };

  applyProductionSupabaseClient(files);

  assert.deepEqual(files, original);
});

test('applyProductionSupabaseClient — sin la ruta del cliente, devuelve files sin tocar (proyecto sin DB)', () => {
  const files = {
    'src/App.tsx': 'export default function App() { return null; }',
  };

  const result = applyProductionSupabaseClient(files);

  assert.deepEqual(result, files);
  assert.ok(!(SUPABASE_CLIENT_PATH in result));
});

test('applyProductionSupabaseClient — null/undefined pasan sin lanzar', () => {
  assert.equal(applyProductionSupabaseClient(null), null);
  assert.equal(applyProductionSupabaseClient(undefined), undefined);
});
