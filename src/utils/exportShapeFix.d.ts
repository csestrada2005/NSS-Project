export function exportLineFor(source: string, importName: string): string | null;
export function planExportShapeFix(
  batch: { errors: { message?: string | null }[] },
  files: Map<string, string>,
  protectedPaths?: Iterable<string>
): { files: Map<string, string>; fixes: string[] } | null;
