import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// IntentClassifier.VALID_TYPES — un tipo que pasa la validación pero no existe
// en la unión no es un tipo: es un pasajero sin billete.
//
// EL AGUJERO
// ----------
// VALID_TYPES listaba catorce literales; la unión Intent['type'] declara ocho.
// Los seis sobrantes (create_component, modify_component, add_route,
// add_feature, provision_database, general) no eran alias ni sinónimos de
// nada: no aparecían en la unión, luego ningún switch aguas abajo los
// contemplaba. Y sin embargo pasaban el filtro y se devolvían tal cual dentro
// de un objeto tipado como Intent.
//
// POR QUÉ IMPORTA MÁS DE LO QUE PARECE
// ------------------------------------
// El ruteo por lanes y el gate de migraciones deciden mirando el type. Un
// 'provision_database' —que suena exactamente a lo que dispara una migración—
// no es 'database_change', así que isPlanLaneOnly no lo reconoce y el gate no
// se cierra sobre él: el intent se cuela por el camino equivocado en silencio.
// Reducir el array a la unión hace que ese mismo caso caiga en DEFAULT_INTENT,
// que es la respuesta segura y ruidosa (console.warn) en vez de la callada.
//
// POR QUÉ ESTE TEST LEE LA FUENTE Y NO IMPORTA EL MÓDULO
// ------------------------------------------------------
// IntentClassifier.ts es TypeScript y arrastra platformService y el registro de
// patrones; la suite corre node --test sobre .js sin loader. Los tests vecinos
// que fijan invariantes de servicios TS (migrationIntent, intentLogSingleWriter,
// migrationDirNormalization) leen el archivo y assertan sobre él. Esto sigue esa
// convención — y tiene una ventaja aquí: lo que hay que fijar es precisamente el
// literal escrito en el archivo, no el valor que tendría en runtime.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLASSIFIER = path.join(ROOT, 'src', 'services', 'IntentClassifier.ts');

/**
 * La lista esperada, escrita a mano y a propósito: es el contrato que este test
 * defiende. Si la unión Intent['type'] cambia, este array debe cambiar con ella
 * en el mismo commit — el test `la lista esperada refleja la unión real` de
 * abajo se encarga de que no se pueda olvidar.
 */
const EXPECTED_TYPES = [
  'fix_bug',
  'style_change',
  'refactor',
  'new_feature',
  'modify_existing',
  'add_page',
  'database_change',
  'question',
];

function classifierSource() {
  return fs.readFileSync(CLASSIFIER, 'utf8');
}

/** Los literales del array VALID_TYPES, tal y como están escritos en el archivo. */
function extractValidTypes(src) {
  const m = src.match(/const VALID_TYPES\s*=\s*\[([\s\S]*?)\]\s*;/);
  assert.ok(m, 'no se encontró la declaración de VALID_TYPES en IntentClassifier.ts');
  return [...m[1].matchAll(/'([^']*)'/g)].map(hit => hit[1]);
}

/** Los literales de la unión declarada en `export interface Intent`. */
function extractIntentUnion(src) {
  const iface = src.match(/export interface Intent\s*\{([\s\S]*?)\n\}/);
  assert.ok(iface, 'no se encontró `export interface Intent` en IntentClassifier.ts');
  const field = iface[1].match(/type:\s*([\s\S]*?);/);
  assert.ok(field, 'no se encontró el campo `type` dentro de la interfaz Intent');
  return [...field[1].matchAll(/'([^']*)'/g)].map(hit => hit[1]);
}

/** El literal al que cae DEFAULT_INTENT cuando la validación rechaza la respuesta. */
function extractDefaultIntentType(src) {
  const m = src.match(/const DEFAULT_INTENT:\s*Intent\s*=\s*\{[\s\S]*?type:\s*'([^']*)'/);
  assert.ok(m, 'no se encontró DEFAULT_INTENT.type en IntentClassifier.ts');
  return m[1];
}

// ---------------------------------------------------------------------------
// (a) y (b): el array, contra la lista esperada, en las dos direcciones.
// Separados a propósito: un fallo dice si sobra o si falta, no sólo que difiere.
// ---------------------------------------------------------------------------

test('VALID_TYPES no contiene ningún literal fuera de la unión Intent', () => {
  const extra = extractValidTypes(classifierSource()).filter(t => !EXPECTED_TYPES.includes(t));
  assert.deepEqual(
    extra,
    [],
    `VALID_TYPES acepta tipos que no existen en la unión Intent['type']: ${extra.join(', ')}. ` +
      'Un type que pasa el filtro pero no está en la unión esquiva todo switch aguas abajo.'
  );
});

test('VALID_TYPES no omite ningún literal de la unión Intent', () => {
  const valid = extractValidTypes(classifierSource());
  const missing = EXPECTED_TYPES.filter(t => !valid.includes(t));
  assert.deepEqual(
    missing,
    [],
    `VALID_TYPES rechaza tipos legítimos de la unión Intent['type']: ${missing.join(', ')}. ` +
      'El clasificador los degradaría a DEFAULT_INTENT aunque la respuesta fuera correcta.'
  );
});

test('la lista esperada refleja la unión real (si la unión cambia, este test cae primero)', () => {
  // Guarda del propio test: sin esto, EXPECTED_TYPES podría quedarse congelado
  // en una unión antigua y los dos tests de arriba pasarían defendiendo un
  // contrato que ya no existe.
  assert.deepEqual(
    [...extractIntentUnion(classifierSource())].sort(),
    [...EXPECTED_TYPES].sort()
  );
});

// ---------------------------------------------------------------------------
// El caso fantasma: qué hace la puerta con 'provision_database'.
// ---------------------------------------------------------------------------

test('la guarda de validación sigue siendo la que este test reproduce', () => {
  // El caso de abajo evalúa la condición del `if` con el VALID_TYPES real leído
  // del archivo. Esta guarda fija la otra mitad: que la condición del archivo
  // sigue siendo esa. Si alguien cambia el `if`, esto cae en vez de dejar que el
  // test siga pasando sobre una lógica que ya no existe.
  assert.match(
    classifierSource(),
    /if \(!parsed\.type \|\| !VALID_TYPES\.includes\(parsed\.type\)\) \{/
  );
});

test("un type fantasma ('provision_database') cae en DEFAULT_INTENT", () => {
  const src = classifierSource();
  const validTypes = extractValidTypes(src); // el array real, no una copia
  const accepted = parsed => Boolean(parsed.type) && validTypes.includes(parsed.type);

  assert.equal(
    accepted({ type: 'provision_database' }),
    false,
    "'provision_database' pasó la validación: volvería como Intent.type sin que ningún switch lo contemple"
  );
  assert.equal(extractDefaultIntentType(src), 'modify_existing');
});

test('los otros cinco fantasmas también caen en DEFAULT_INTENT', () => {
  const validTypes = extractValidTypes(classifierSource());
  for (const ghost of ['create_component', 'modify_component', 'add_route', 'add_feature', 'general']) {
    assert.equal(validTypes.includes(ghost), false, `'${ghost}' sigue siendo aceptado por VALID_TYPES`);
  }
});

test('los tipos legítimos siguen pasando la validación (la reducción no se llevó a nadie por delante)', () => {
  const validTypes = extractValidTypes(classifierSource());
  for (const type of EXPECTED_TYPES) {
    assert.equal(validTypes.includes(type), true, `'${type}' es de la unión y dejó de ser aceptado`);
  }
});
