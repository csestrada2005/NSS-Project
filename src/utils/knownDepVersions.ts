// Movido desde AIOrchestrator.ts (bucket 6, 2026-09-29): ahora lo comparten la
// auditoría de dependencias del orquestador y el entorno de tipos del servidor
// (server/typeenv, ver typeEnvManifest.ts) — una sola fuente de verdad.

/**
 * Curated dependency versions for the export audit. The preview runtime vendors
 * or aliases these bare imports (see server/compiler.js), so a generated project
 * compiles inside Wyrd even when they are absent from its package.json. An
 * EXPORTED zip has no such runtime — every imported package must be declared for
 * `npm install && vite build` to succeed outside Wyrd. Versions are pinned to
 * ranges compatible with the template's React 18 baseline. Anything imported but
 * missing from this table is still added, as "latest", with a warning.
 *
 * Includes the packages named in AVAILABLE_RUNTIME_CONTEXT plus the template's
 * own runtime deps (react, react-dom, react-router-dom + the shadcn set).
 */
export const KNOWN_DEP_VERSIONS: Record<string, string> = {
  // Explicitly runtime-vendored / encouraged. PINNED (CIRUGÍA P1-6, CAMBIO 4) in
  // lockstep with the template package.json (shadcnDefaults + shadcnComponents +
  // templates.ts) so an exported project reproduces the tree the preview ran.
  'framer-motion': '11.15.0',
  '@supabase/supabase-js': '^2.95.3',
  'lucide-react': '0.469.0',
  clsx: '2.1.1',
  'tailwind-merge': '2.6.0',
  'react-router-dom': '^7.18.2',
  // shadcn base — cva + the Radix primitives the 10 template components import.
  // Resolve via esm.sh in the preview; declared here so `npm install` outside
  // Wyrd installs the exact versions the template ships.
  'class-variance-authority': '0.7.1',
  'tailwindcss-animate': '1.0.7',
  '@radix-ui/react-slot': '1.1.1',
  '@radix-ui/react-accordion': '1.2.2',
  '@radix-ui/react-dialog': '1.1.4',
  '@radix-ui/react-label': '2.1.1',
  '@radix-ui/react-separator': '1.1.1',
  '@radix-ui/react-tabs': '1.1.2',
  // Common well-known packages the preview resolves via esm.sh
  'date-fns': '^4.1.0',
  recharts: '^2.12.0',
  zustand: '^4.5.0',
  sonner: '^1.5.0',
  'react-markdown': '^9.0.0',
  // Template runtime baseline
  react: '^18.3.1',
  'react-dom': '^18.3.1',
};
