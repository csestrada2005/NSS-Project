import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';

interface Column {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface TableGroup {
  name: string;
  columns: Column[];
}

export function SchemaViewer() {
  const [tables, setTables] = useState<TableGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;
        const { data, error: qError } = await supabase
          .from('information_schema.columns')
          .select('table_name, column_name, data_type, is_nullable')
          .eq('table_schema', 'public')
          .order('table_name')
          .order('ordinal_position');

        if (qError) {
          if (qError.message?.includes('permission') || qError.code === '42501') {
            setError('Schema access requires service role key. Add SUPABASE_SERVICE_ROLE_KEY to your project secrets.');
          } else {
            setError(qError.message);
          }
          return;
        }

        // Group by table
        const grouped: Record<string, Column[]> = {};
        for (const col of (data ?? [])) {
          if (!grouped[col.table_name]) grouped[col.table_name] = [];
          grouped[col.table_name].push(col);
        }
        setTables(Object.entries(grouped).map(([name, columns]) => ({ name, columns })));
      } catch (e: any) {
        setError(e.message ?? 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filtered = tables.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return <div className="flex items-center justify-center py-10 text-zinc-500 text-sm">Loading schema...</div>;
  }

  if (error) {
    return (
      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 text-sm text-amber-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search tables..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 placeholder-zinc-500"
      />

      <div className="space-y-1">
        {filtered.map((table) => (
          <div key={table.name} className="border border-zinc-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [table.name]: !prev[table.name] }))}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={14}
                  className={`text-zinc-400 transition-transform ${expanded[table.name] ? 'rotate-90' : ''}`}
                />
                <span className="text-sm font-medium text-zinc-200 font-mono">{table.name}</span>
              </div>
              <span className="text-xs bg-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full">
                {table.columns.length} cols
              </span>
            </button>

            {expanded[table.name] && (
              <div className="px-4 py-2 space-y-1.5 bg-zinc-900/30">
                {table.columns.map((col) => (
                  <div key={col.column_name} className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${col.is_nullable === 'YES' ? 'bg-emerald-500' : 'bg-zinc-600'}`}
                      title={col.is_nullable === 'YES' ? 'Nullable' : 'Not null'}
                    />
                    <span className="text-sm text-zinc-200 font-mono">{col.column_name}</span>
                    <span className="text-xs text-zinc-500 ml-auto">{col.data_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-zinc-500 text-sm py-6">No tables found</p>
        )}
      </div>
    </div>
  );
}
