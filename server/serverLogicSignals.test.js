import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promptNeedsServer } from '../src/utils/serverLogicSignals.js';

// ---------------------------------------------------------------------------
// serverLogicSignals — cinturón determinista de needs_server (C2-3). Cubre
// los disparadores en español e inglés, negativos que no deben disparar, y
// entradas basura que no deben lanzar.
// ---------------------------------------------------------------------------

// --- disparadores en español ------------------------------------------------

test('español: menciones de rol/permiso disparan needs_server', () => {
  assert.equal(promptNeedsServer('quiero poder asignar roles a los usuarios'), true);
  assert.equal(promptNeedsServer('agrega un permiso de administrador'), true);
  assert.equal(promptNeedsServer('el admin debe poder ver todo'), true);
});

test('español: invitar/dar de baja usuarios dispara needs_server', () => {
  assert.equal(promptNeedsServer('quiero invitar usuario nuevo al equipo'), true);
  assert.equal(promptNeedsServer('necesito dar de baja a un usuario'), true);
  assert.equal(promptNeedsServer('deshabilitar la cuenta de un usuario'), true);
});

test('español: api key / clave de api dispara needs_server', () => {
  assert.equal(promptNeedsServer('necesito usar una api key de OpenAI'), true);
  assert.equal(promptNeedsServer('guarda la clave de api en algún lado'), true);
});

test('español: enviar correo/email dispara needs_server', () => {
  assert.equal(promptNeedsServer('quiero enviar correo de confirmación'), true);
  assert.equal(promptNeedsServer('enviar email cuando se registre alguien'), true);
});

test('español: resumen mensual / reporte automático dispara needs_server', () => {
  assert.equal(promptNeedsServer('genera un resumen mensual de ventas'), true);
  assert.equal(promptNeedsServer('quiero un reporte automático cada semana'), true);
});

test('español: moderar/filtrar comentarios dispara needs_server', () => {
  assert.equal(promptNeedsServer('quiero moderar los comentarios antes de publicarlos'), true);
  assert.equal(promptNeedsServer('necesito filtrar comentarios ofensivos'), true);
});

// --- disparadores en inglés --------------------------------------------------

test('english: role/permission triggers needs_server', () => {
  assert.equal(promptNeedsServer('let admins change user roles'), true);
  assert.equal(promptNeedsServer('add a permission check before saving'), true);
});

test('english: invite/disable user triggers needs_server', () => {
  assert.equal(promptNeedsServer('invite user to the workspace'), true);
  assert.equal(promptNeedsServer('disable user when they leave the team'), true);
});

test('english: api key triggers needs_server', () => {
  assert.equal(promptNeedsServer('call the API key protected endpoint'), true);
});

test('english: send email triggers needs_server', () => {
  assert.equal(promptNeedsServer('send email to the customer after checkout'), true);
});

test('english: monthly summary / spam filter trigger needs_server', () => {
  assert.equal(promptNeedsServer('build a monthly summary of orders'), true);
  assert.equal(promptNeedsServer('add a spam filter to the comments'), true);
  assert.equal(promptNeedsServer('moderate user submitted reviews'), true);
  assert.equal(promptNeedsServer('block messages with profanity'), true);
});

// --- case-insensitivity -------------------------------------------------------

test('detecta los disparadores sin importar mayúsculas/minúsculas', () => {
  assert.equal(promptNeedsServer('NECESITO INVITAR USUARIO AL PROYECTO'), true);
  assert.equal(promptNeedsServer('Send Email To The User'), true);
});

// --- negativos: no deben disparar --------------------------------------------

test('negativos: peticiones puramente visuales o de contenido no disparan needs_server', () => {
  assert.equal(promptNeedsServer('cambia el color principal'), false);
  assert.equal(promptNeedsServer('make the buttons rounded'), false);
  assert.equal(promptNeedsServer('cambia el titular del hero'), false);
  assert.equal(promptNeedsServer('add a testimonials section'), false);
  assert.equal(promptNeedsServer('refactor the Navbar into smaller components'), false);
  assert.equal(promptNeedsServer('crea una tabla de pedidos'), false);
});

// --- entradas basura: nunca lanza, siempre false -----------------------------

test('entradas basura (null, número, array, undefined, string vacío) devuelven false sin lanzar', () => {
  assert.equal(promptNeedsServer(null), false);
  assert.equal(promptNeedsServer(undefined), false);
  assert.equal(promptNeedsServer(42), false);
  assert.equal(promptNeedsServer(['invitar usuario']), false);
  assert.equal(promptNeedsServer({ text: 'invitar usuario' }), false);
  assert.equal(promptNeedsServer(''), false);
});

// ---------------------------------------------------------------------------
// REGRESIÓN — bug de recursión infinita en scripts/classifierHarness.mjs.
//
// El bug NUNCA estuvo en promptNeedsServer en sí (esta función es correcta y
// sin recursión, como prueban los tests de arriba). Vivía en el plugin de
// esbuild del harness (stubServerLogicBelt): su onResolve interceptaba
// CUALQUIER resolución de una ruta que terminara en 'serverLogicSignals.js',
// incluida la vía de escape que el propio stub usaba para llegar al archivo
// real — así que esa "vía de escape" se redirigía de vuelta al mismo stub,
// y promptNeedsServer terminaba llamándose a sí mismo indefinidamente
// (RangeError: Maximum call stack size exceeded) en CUALQUIER prompt que
// pasara por el harness con el cinturón encendido, no sólo en éste.
//
// Este caso fija el prompt literal de la sonda M2 del harness como
// regresión directa sobre la función real (sin esbuild de por medio): si
// alguien reintroduce recursión aquí, este test la detecta sin depender de
// que el harness también se ejecute.
// ---------------------------------------------------------------------------

test('regresión: el prompt literal de M2 no dispara needs_server (edición de contenido)', () => {
  assert.equal(
    promptNeedsServer('can you update the footer to show our opening hours?'),
    false
  );
});

// ---------------------------------------------------------------------------
// REGRESIÓN — falso positivo de 'rol' como substring, descubierto por la
// batería de las 18 sondas del harness (K2). 'rol' matcheaba dentro de
// "control" porque promptNeedsServer usaba includes() crudo sobre el string
// en minúsculas; "control_cd" no tiene absolutamente nada que ver con roles
// de usuario. El fix ancla cada disparador a límites de palabra (\b).
// ---------------------------------------------------------------------------

test('regresión: "control" no dispara needs_server vía el disparador \'rol\' (falso positivo por substring)', () => {
  assert.equal(promptNeedsServer('Add a table called control_cd with columns id and note'), false);
  assert.equal(promptNeedsServer('this component controls the modal state'), false);
  assert.equal(promptNeedsServer('the security patrol checks the perimeter'), false);
});

// ---------------------------------------------------------------------------
// Las 18 sondas de scripts/classifierHarness.mjs (PROBES), pasadas por
// promptNeedsServer directamente, sin LLM. Son entradas ya conocidas y
// baratas de correr; cubren el hueco que dejaban los tests de arriba —
// ninguno ejercitaba la función completa contra el vocabulario real de la
// batería de clasificación de type, sólo contra frases inventadas para cada
// disparador.
//
// Copiadas literalmente de scripts/classifierHarness.mjs — si esa lista
// cambia, esta debe actualizarse junto con ella (mismo trade-off asumido
// que PROJECT_MEMORY en el harness: coherencia frente a duplicación).
// Ninguna de las 18 nombra un disparador de needs_server, así que las 18
// deben dar false.
// ---------------------------------------------------------------------------

const HARNESS_TYPE_PROBES = [
  { id: 'F1', prompt: 'add a contact form to the page' },
  { id: 'F2', prompt: 'how do I add a contact form' },
  { id: 'F3', prompt: 'can you add a testimonials section?' },
  { id: 'F4', prompt: 'add a table for customer reviews' },
  { id: 'F5', prompt: 'add a customer reviews section to the landing page' },
  { id: 'F6', prompt: 'what tables does my database have?' },
  { id: 'K1', prompt: 'A simple landing page for a bakery' },
  { id: 'K2', prompt: 'Add a table called control_cd with columns id and note' },
  { id: 'M1', prompt: 'change the hero headline to "Fresh bread daily"' },
  { id: 'M2', prompt: 'can you update the footer to show our opening hours?' },
  { id: 'B1', prompt: 'the contact form doesn\'t submit anything when I click send, fix it' },
  { id: 'B2', prompt: 'fix the broken image on the homepage' },
  { id: 'S1', prompt: 'make all the buttons rounded and blue' },
  { id: 'S2', prompt: 'change the color palette to warm earth tones' },
  { id: 'P1', prompt: 'add an about us page' },
  { id: 'P2', prompt: 'create a new menu page and link it from the navbar' },
  { id: 'R1', prompt: 'refactor the Navbar into smaller components without changing how it looks' },
  { id: 'R2', prompt: 'clean up the duplicated code in the section components' },
];

for (const probe of HARNESS_TYPE_PROBES) {
  test(`sonda ${probe.id} del harness ("${probe.prompt}") → promptNeedsServer: false`, () => {
    assert.equal(promptNeedsServer(probe.prompt), false);
  });
}
