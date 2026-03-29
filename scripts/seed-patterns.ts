import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const patterns: {
  name: string;
  category: string;
  description: string;
  tags: string[];
  code_example: string;
}[] = [
  {
    name: 'Dashboard card grid',
    category: 'layout',
    description:
      'Responsive 3-column card grid with skeleton loading state using Tailwind grid and conditional rendering.',
    tags: ['dashboard', 'grid', 'cards', 'responsive', 'skeleton', 'loading'],
    code_example: '',
  },
  {
    name: 'Sidebar navigation',
    category: 'navigation',
    description:
      'Collapsible sidebar with icon+label nav items, active state highlighting, and mobile overlay.',
    tags: ['sidebar', 'navigation', 'nav', 'menu', 'collapsible'],
    code_example: '',
  },
  {
    name: 'Data table with pagination',
    category: 'data-display',
    description:
      'Sortable table with pagination controls, empty state, and loading skeleton.',
    tags: ['table', 'pagination', 'data', 'sort', 'list'],
    code_example: '',
  },
  {
    name: 'Form with validation',
    category: 'form',
    description:
      'Controlled form with real-time validation, error messages, and submit state handling.',
    tags: ['form', 'validation', 'input', 'submit', 'error'],
    code_example: '',
  },
  {
    name: 'Modal dialog',
    category: 'feedback',
    description:
      'Accessible modal with backdrop, close on escape, and focus trap.',
    tags: ['modal', 'dialog', 'overlay', 'popup'],
    code_example: '',
  },
  {
    name: 'Auth guard wrapper',
    category: 'auth',
    description:
      'Route wrapper that redirects unauthenticated users and shows loading state.',
    tags: ['auth', 'protected', 'route', 'guard', 'redirect'],
    code_example: '',
  },
];

async function main() {
  for (const pattern of patterns) {
    const { error } = await supabase
      .from('forge_patterns')
      .upsert(pattern, { onConflict: 'name' });

    if (error) {
      console.error(`✗ ${pattern.name}: ${error.message}`);
    } else {
      console.log(`✓ ${pattern.name}`);
    }
  }

  console.log(
    '\nDone. Fill in code_example fields, then run embed-patterns.ts'
  );
}

main();
