import { useState } from 'react';
import { MigrationRunner } from '@/services/MigrationRunner';

/** Nombre de archivo, sin el `supabase/migrations/` que llevan todos (mismo criterio que DDLApprovalButton). */
function fileName(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? path : path.slice(cut + 1);
}

/**
 * useSqlPreview — el "Ver el SQL" del mockup (3.2), de sólo lectura.
 *
 * No existía ningún visor de SQL fuera del flujo de aprobación — se reusa
 * `MigrationRunner.readMigrationSql` (el mismo método que ya usa
 * DDLApprovalButton al preparar el click de aplicar), sin tocar ese
 * componente ni su lógica: esto sólo LEE, nunca aplica nada.
 */
export function useSqlPreview(projectId: string | null | undefined, paths: string[]) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sqlByPath, setSqlByPath] = useState<[string, string][] | null>(null);

  const toggle = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (sqlByPath) return; // ya se leyó una vez, no se vuelve a pedir.
    if (!projectId) {
      setError('No sé contra qué proyecto — abre el proyecto primero.');
      return;
    }
    setLoading(true);
    setError(null);
    const next: [string, string][] = [];
    for (const path of paths) {
      const { sql, error: err } = await MigrationRunner.readMigrationSql(projectId, path);
      if (err) {
        setError(`No pude leer ${fileName(path)} (${err}).`);
        setLoading(false);
        return;
      }
      next.push([path, sql]);
    }
    setSqlByPath(next);
    setLoading(false);
  };

  return { open, toggle, loading, error, sqlByPath, fileName };
}
