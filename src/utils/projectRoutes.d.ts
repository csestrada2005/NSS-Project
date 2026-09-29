export interface PageEntry {
  name: string;
  route: string;
}

export function derivePageEntries(files: Map<string, string> | Iterable<string>): PageEntry[];

export function deriveProjectRoutes(files: Map<string, string> | Iterable<string>): string[];
