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
