import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Import TEMPLATES — wrapped in try/catch because this Node script runs outside
// Vite and templates.ts transitively imports '@webcontainer/api' which is a
// browser/bundler-only package.
// ---------------------------------------------------------------------------
let TEMPLATES: Record<string, any> = {};
try {
  const mod = await import('../src/templates.ts');
  TEMPLATES = mod.TEMPLATES ?? {};
} catch (err) {
  console.warn(
    'Warning: could not import TEMPLATES from src/templates.ts — ' +
      'standalone patterns will still be seeded.\n' +
      String(err)
  );
}

// ---------------------------------------------------------------------------
// Helper: traverse a FileSystemTree using a dot-separated path such as
//   'src.components.layout.Header.tsx'
// Directory nodes have the shape: { directory: { [key]: node } }
// File nodes have the shape:      { file: { contents: string } }
// ---------------------------------------------------------------------------
function extractFileContent(tree: Record<string, any>, dotPath: string): string | null {
  const segments = dotPath.split('.');
  let current: any = tree;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return null;

    // Unwrap directory wrapper if present at this level
    if ('directory' in current) {
      current = current.directory;
    }

    if (!(segment in current)) return null;
    current = current[segment];
  }

  // Final node should be a file node
  if (current && 'file' in current && typeof current.file.contents === 'string') {
    return current.file.contents.trim();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
const patterns: {
  name: string;
  category: string;
  description: string;
  tags: string[];
  code_example: string;
}[] = [
  // ---- Extracted from TEMPLATES['landing-page'] ----------------------------

  {
    name: 'App router setup',
    category: 'routing',
    description: 'React Router v6 BrowserRouter with nested routes and a layout wrapper.',
    tags: ['router', 'routes', 'navigation', 'layout', 'react-router'],
    code_example:
      extractFileContent(TEMPLATES['landing-page'] ?? {}, 'src.App.tsx') ??
      '// Could not extract from template — add BrowserRouter + Routes + Route tree here',
  },

  {
    name: 'Page layout with header and footer',
    category: 'layout',
    description: 'Full-page layout component using React Router Outlet with sticky header and footer.',
    tags: ['layout', 'header', 'footer', 'outlet', 'page'],
    code_example:
      extractFileContent(
        TEMPLATES['landing-page'] ?? {},
        'src.components.layout.Layout.tsx'
      ) ?? '// Could not extract from template — add Layout component with Outlet here',
  },

  {
    name: 'Site header with navigation',
    category: 'navigation',
    description: 'Top navigation bar with logo link and nav items using React Router Link.',
    tags: ['header', 'navigation', 'navbar', 'link', 'react-router'],
    code_example:
      extractFileContent(
        TEMPLATES['landing-page'] ?? {},
        'src.components.layout.Header.tsx'
      ) ?? '// Could not extract from template — add Header component with nav links here',
  },

  {
    name: 'Site footer',
    category: 'layout',
    description: 'Minimal footer with copyright year computed dynamically.',
    tags: ['footer', 'layout'],
    code_example:
      extractFileContent(
        TEMPLATES['landing-page'] ?? {},
        'src.components.layout.Footer.tsx'
      ) ?? '// Could not extract from template — add Footer component here',
  },

  {
    name: '404 not found page',
    category: 'feedback',
    description: 'Not found page with a link back to home using React Router.',
    tags: ['404', 'not-found', 'error', 'page'],
    code_example:
      extractFileContent(
        TEMPLATES['landing-page'] ?? {},
        'src.pages.NotFound.tsx'
      ) ?? '// Could not extract from template — add NotFound page with Link to "/" here',
  },

  {
    name: 'Vite + React entry point',
    category: 'config',
    description: 'Standard main.tsx entry point rendering App into the root div with StrictMode.',
    tags: ['entry', 'main', 'vite', 'react', 'root'],
    code_example:
      extractFileContent(TEMPLATES['landing-page'] ?? {}, 'src.main.tsx') ??
      '// Could not extract from template — add createRoot + StrictMode entry point here',
  },

  // ---- Standalone patterns (inline code_example) ---------------------------

  {
    name: 'Dashboard KPI card',
    category: 'data-display',
    description: 'Stat card showing a metric label, value, and optional icon. Used in dashboard grids.',
    tags: ['dashboard', 'card', 'kpi', 'stat', 'metric'],
    code_example: `import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
};

export default StatCard;`,
  },

  {
    name: 'Data table with loading skeleton',
    category: 'data-display',
    description: 'Table with thead, mapped rows, empty state, and animated skeleton rows while loading.',
    tags: ['table', 'skeleton', 'loading', 'data', 'list', 'empty-state'],
    code_example: `import React from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, React.ReactNode>[];
  isLoading?: boolean;
}

const DataTable: React.FC<DataTableProps> = ({ columns, rows, isLoading = false }) => {
  const skeletonRows = Array.from({ length: 5 });

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm text-left">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 font-medium text-muted-foreground">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            skeletonRows.map((_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-3">
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-muted-foreground"
              >
                No data
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                {columns.map((col) => (
                  <td key={col} className="px-4 py-3 text-foreground">
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;`,
  },

  {
    name: 'Controlled form with validation',
    category: 'form',
    description: 'Form with useState-controlled fields, per-field error state, and disabled submit during loading.',
    tags: ['form', 'validation', 'input', 'submit', 'error', 'controlled'],
    code_example: `import React, { useState } from 'react';

interface Fields {
  name: string;
  email: string;
}

interface Errors {
  name?: string;
  email?: string;
}

const SimpleForm: React.FC = () => {
  const [fields, setFields] = useState<Fields>({ name: '', email: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!fields.name.trim()) e.name = 'Name is required.';
    if (!fields.email.includes('@')) e.email = 'Enter a valid email address.';
    return e;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFields((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    try {
      // TODO: replace with actual submit logic
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={fields.name}
          onChange={handleChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.name && (
          <p className="mt-1 text-xs text-destructive">{errors.name}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={fields.email}
          onChange={handleChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {errors.email && (
          <p className="mt-1 text-xs text-destructive">{errors.email}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? 'Saving...' : 'Save'}
      </button>
    </form>
  );
};

export default SimpleForm;`,
  },

  {
    name: 'Modal dialog with backdrop',
    category: 'feedback',
    description: 'Overlay modal with backdrop click to close, escape key handler, and focus trap via autoFocus.',
    tags: ['modal', 'dialog', 'overlay', 'backdrop', 'popup', 'close'],
    code_example: `import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            autoFocus
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export default Modal;`,
  },

  {
    name: 'Auth protected route wrapper',
    category: 'auth',
    description: 'HOC that redirects unauthenticated users to /login and shows a spinner while checking auth state.',
    tags: ['auth', 'protected', 'route', 'guard', 'redirect', 'HOC'],
    code_example: `import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** null = still checking auth state */
  isAuthenticated: boolean | null;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  isAuthenticated,
}) => {
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;`,
  },
];

// ---------------------------------------------------------------------------
// Supabase client
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL) {
  throw new Error('Missing required environment variable: SUPABASE_URL');
}
if (!SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required environment variable: SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function main() {
  let successCount = 0;

  for (const pattern of patterns) {
    const { error } = await supabase
      .from('forge_patterns')
      .upsert(pattern, { onConflict: 'name' });

    if (error) {
      console.error(`✗ ${pattern.name}: ${error.message}`);
    } else {
      console.log(`✓ ${pattern.name}`);
      successCount++;
    }
  }

  console.log(`\nSeeded ${successCount} patterns. Next: run npm run embed:patterns`);
}

main();
