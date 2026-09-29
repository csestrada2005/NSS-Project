// Regenera server/typeenv/package.json desde la plantilla de proyectos
// (src/templates.ts) y KNOWN_DEP_VERSIONS. Uso: `node scripts/syncTypeEnv.mjs`
// y después `npm --prefix server/typeenv install` para refrescar el lockfile.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wyrd-typeenv-'));
const entry = path.join(tmp, 'entry.ts');
fs.writeFileSync(entry, [
  `export { TEMPLATES } from ${JSON.stringify(path.join(ROOT, 'src/templates.ts'))};`,
  `export { KNOWN_DEP_VERSIONS } from ${JSON.stringify(path.join(ROOT, 'src/utils/knownDepVersions.ts'))};`,
  `export { buildTypeEnvManifest } from ${JSON.stringify(path.join(ROOT, 'src/utils/typeEnvManifest.ts'))};`,
].join('\n'));
const out = path.join(tmp, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const { TEMPLATES, KNOWN_DEP_VERSIONS, buildTypeEnvManifest } = await import(pathToFileURL(out).href);
fs.rmSync(tmp, { recursive: true, force: true });

const templatePackage = JSON.parse(TEMPLATES['landing-page']['package.json'].file.contents);
const manifest = buildTypeEnvManifest(templatePackage, KNOWN_DEP_VERSIONS);
const target = path.join(ROOT, 'server/typeenv/package.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
console.log('server/typeenv/package.json actualizado');
