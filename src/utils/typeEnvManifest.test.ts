import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TEMPLATES } from '../templates';
import { KNOWN_DEP_VERSIONS } from './knownDepVersions';
import { buildTypeEnvManifest } from './typeEnvManifest';

// Si alguien cambia una versión en la plantilla (src/templates.ts,
// shadcnDefaults, shadcnComponents) o en KNOWN_DEP_VERSIONS sin regenerar el
// entorno de tipos, la revisión de tipos del servidor dejaría de dar el mismo
// veredicto que Vercel. Arreglo: `npm run typeenv:sync` y commitear
// server/typeenv/package.json + package-lock.json.

const typeEnvPath = path.resolve(__dirname, '../../server/typeenv/package.json');

describe('entorno de tipos del servidor', () => {
  it('server/typeenv/package.json está sincronizado con la plantilla y KNOWN_DEP_VERSIONS', () => {
    const templatePackage = JSON.parse(TEMPLATES['landing-page']['package.json'].file.contents);
    const expected = buildTypeEnvManifest(templatePackage, KNOWN_DEP_VERSIONS);
    const actual = JSON.parse(fs.readFileSync(typeEnvPath, 'utf8'));
    expect(actual).toEqual(expected);
  });

  it('las dos plantillas declaran las mismas librerías (el entorno se genera desde una)', () => {
    const pkg = (name: string) => JSON.parse(TEMPLATES[name]['package.json'].file.contents);
    const landing = pkg('landing-page');
    const dashboard = pkg('dashboard');
    expect(dashboard.dependencies).toEqual(landing.dependencies);
    expect(dashboard.devDependencies).toEqual(landing.devDependencies);
  });

  it('la plantilla manda sobre KNOWN_DEP_VERSIONS cuando las dos declaran un paquete', () => {
    const manifest = buildTypeEnvManifest(
      { dependencies: { react: '^18.3.1' }, devDependencies: { typescript: '^5', '@types/react': '^18', '@types/react-dom': '^18', '@types/node': '^22', vite: '^7', '@vitejs/plugin-react': '^5' } },
      { react: '^17.0.0', zustand: '^4.5.0' },
    );
    expect(manifest.dependencies).toEqual({ react: '^18.3.1', zustand: '^4.5.0' });
  });
});
