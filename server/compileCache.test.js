import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCacheKey, createCompileCache } from './compileCache.js';

// Lo que importa: la caché NUNCA devuelve la compilación de otros archivos u
// otras credenciales (el preview mostraría una versión vieja).

test('misma entrada, misma clave; sin importar el orden de las rutas', () => {
  assert.equal(
    compileCacheKey({ 'src/a.tsx': 'A', 'src/b.tsx': 'B' }, null),
    compileCacheKey({ 'src/b.tsx': 'B', 'src/a.tsx': 'A' }, null)
  );
});

test('cualquier cambio de contenido, ruta o credenciales cambia la clave', () => {
  const base = compileCacheKey({ 'src/a.tsx': 'A' }, null);
  assert.notEqual(compileCacheKey({ 'src/a.tsx': 'A2' }, null), base);
  assert.notEqual(compileCacheKey({ 'src/x.tsx': 'A' }, null), base);
  assert.notEqual(compileCacheKey({ 'src/a.tsx': 'A', 'src/b.tsx': '' }, null), base);
  assert.notEqual(compileCacheKey({ 'src/a.tsx': 'A' }, { url: 'u', anonKey: 'k' }), base);
  assert.notEqual(
    compileCacheKey({ 'src/a.tsx': 'A' }, { url: 'u', anonKey: 'k' }),
    compileCacheKey({ 'src/a.tsx': 'A' }, { url: 'u2', anonKey: 'k' })
  );
});

test('rutas y contenidos no se pueden "correr" entre sí para colisionar', () => {
  assert.notEqual(
    compileCacheKey({ 'src/a': 'bc' }, null),
    compileCacheKey({ 'src/ab': 'c' }, null)
  );
});

test('LRU: expulsa la menos usada y respeta la caducidad', () => {
  let t = 0;
  const cache = createCompileCache({ max: 2, ttlMs: 100, now: () => t });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.get('a'); // a pasa a ser la más reciente
  cache.set('c', 3); // expulsa b
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('c'), 3);
  t = 500;
  assert.equal(cache.get('a'), undefined, 'caducada');
});
