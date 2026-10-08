import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportLineFor, planExportShapeFix } from '../src/utils/exportShapeFix.js';
import { groupCompileErrors } from '../src/utils/groupCompileErrors.js';
import { compileFiles } from './compiler.js';

// ---------------------------------------------------------------------------
// 2026-10-08 (Vertigo): Index importaba { PricingSection } y el archivo lo
// exportaba como default. La reparación con IA reescribió la sección y le
// cambió el diseño. Ahora: una línea al final del archivo, sin modelo, y el
// resto del archivo idéntico. Los errores salen del compilador REAL.
// ---------------------------------------------------------------------------

const PRICING = `export default function PricingSection() {
  return <section className="bg-stone-950 px-6 py-24 text-amber-50">Precios</section>;
}
`;
const MAIN = "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n" +
  "ReactDOM.createRoot(document.getElementById('root')).render(<App />);\n";

const project = (app, extra) => new Map([
  ['src/main.tsx', MAIN],
  ['src/App.tsx', app],
  ...extra,
]);

async function batchesOf(files) {
  const failed = await compileFiles(Object.fromEntries(files));
  assert.ok(failed.error, 'el proyecto debe fallar al compilar');
  return groupCompileErrors(failed.errorDetailList, (p) => files.get(p));
}

test('caso Vertigo: import con nombre de un export default se arregla con una línea y compila', async () => {
  const files = project(
    "import { PricingSection } from './components/sections/PricingSection';\n" +
    'export default function App() { return <PricingSection />; }\n',
    [['src/components/sections/PricingSection.tsx', PRICING]]
  );
  const [batch] = await batchesOf(files);
  assert.match(batch.errors[0].message, /No matching export .* for import "PricingSection"/);

  const fix = planExportShapeFix(batch, files);
  assert.ok(fix);
  const fixed = fix.files.get('src/components/sections/PricingSection.tsx');
  // El archivo original queda intacto; sólo se añade la línea.
  assert.ok(fixed.startsWith(PRICING.trimEnd()));
  assert.equal(fixed.slice(PRICING.trimEnd().length).trim(), 'export { PricingSection };');
  assert.equal(fix.files.get('src/App.tsx'), files.get('src/App.tsx'));

  const green = await compileFiles(Object.fromEntries(fix.files));
  assert.equal(green.error, undefined);
});

test('import default de un export con nombre: se añade el default', async () => {
  const files = project(
    "import Hero from './components/Hero';\nexport default function App() { return <Hero />; }\n",
    [['src/components/Hero.tsx', 'export function Hero() {\n  return <h1 className="text-5xl">Hola</h1>;\n}\n']]
  );
  const [batch] = await batchesOf(files);
  const fix = planExportShapeFix(batch, files);
  assert.ok(fix);
  assert.match(fix.files.get('src/components/Hero.tsx'), /\n\nexport default Hero;\n$/);
  const green = await compileFiles(Object.fromEntries(fix.files));
  assert.equal(green.error, undefined);
});

test('si el símbolo no existe en el archivo, no se adivina: sigue el camino normal', async () => {
  const files = project(
    "import { Precios } from './components/sections/PricingSection';\n" +
    'export default function App() { return <Precios />; }\n',
    [['src/components/sections/PricingSection.tsx', 'export function Otra() { return null; }\nexport function Mas() { return null; }\n']]
  );
  const [batch] = await batchesOf(files);
  assert.equal(planExportShapeFix(batch, files), null);
});

test('un archivo restaurado (sólo lectura) no se toca', async () => {
  const files = project(
    "import { PricingSection } from './components/sections/PricingSection';\n" +
    'export default function App() { return <PricingSection />; }\n',
    [['src/components/sections/PricingSection.tsx', PRICING]]
  );
  const [batch] = await batchesOf(files);
  assert.equal(planExportShapeFix(batch, files, ['src/components/sections/PricingSection.tsx']), null);
});

test('otros errores (no de export) no entran', () => {
  const batch = { errors: [{ message: 'Cannot resolve "./nope" from "src/App.tsx"' }] };
  assert.equal(planExportShapeFix(batch, new Map()), null);
});

test('exportLineFor: default con otro nombre se reexporta con el nombre pedido', () => {
  assert.equal(
    exportLineFor('export default function Pricing() { return null; }\n', 'PricingSection'),
    'export { Pricing as PricingSection };'
  );
  assert.equal(exportLineFor('const Card = () => null;\nexport default Card;\n', 'Card'), 'export { Card };');
  assert.equal(exportLineFor('export default () => null;\n', 'Card'), null);
  assert.equal(exportLineFor('export function A() {}\nexport function B() {}\n', 'default'), null);
});
