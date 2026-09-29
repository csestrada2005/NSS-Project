// Entorno de tipos del servidor (bucket 6, 2026-09-29): una copia de las
// librerías EXACTAS con las que Vercel construye un proyecto generado, para que
// la revisión de tipos de Wyrd dé el mismo resultado que `tsc -b` en Vercel.
// Vive en server/typeenv/package.json y se regenera con
// `node scripts/syncTypeEnv.mjs`; typeEnvManifest.test.ts falla si se
// desincroniza de la plantilla o de KNOWN_DEP_VERSIONS.

type Deps = Record<string, string>;

/** devDependencies de la plantilla que la revisión de tipos necesita. */
export const TYPEENV_DEV_DEPENDENCIES = [
  'typescript',
  '@types/react',
  '@types/react-dom',
  '@types/node',
  'vite',
  '@vitejs/plugin-react',
] as const;

export interface TypeEnvManifest {
  name: string;
  private: true;
  description: string;
  dependencies: Deps;
  devDependencies: Deps;
}

function sorted(deps: Deps): Deps {
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * La plantilla manda (es lo que Vercel instala); KNOWN_DEP_VERSIONS agrega lo
 * que la IA suele importar además, sin pisar ninguna versión de la plantilla.
 */
export function buildTypeEnvManifest(
  templatePackage: { dependencies?: Deps; devDependencies?: Deps },
  knownDeps: Deps,
): TypeEnvManifest {
  const dependencies: Deps = { ...knownDeps, ...(templatePackage.dependencies ?? {}) };
  const devDependencies: Deps = {};
  for (const name of TYPEENV_DEV_DEPENDENCIES) {
    const version = templatePackage.devDependencies?.[name];
    if (!version) throw new Error(`La plantilla no declara ${name} en devDependencies`);
    devDependencies[name] = version;
  }
  return {
    name: 'wyrd-typeenv',
    private: true,
    description:
      'Generado por scripts/syncTypeEnv.mjs — no editar a mano. Librerías de la plantilla de proyectos para la revisión de tipos del servidor.',
    dependencies: sorted(dependencies),
    devDependencies: sorted(devDependencies),
  };
}
