import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { projectDBService } from '@/services/ProjectDBService';
import { useForgeLang } from '@/i18n/forge/useForgeLang';

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

interface SchemaViewerProps {
  projectId?: string | null;
}

export function SchemaViewer({ projectId }: SchemaViewerProps = {}) {
  const resolvedProjectId = projectId ?? sessionStorage.getItem('forge_project_id');
  const [tables, setTables] = useState<TableGroup[]>([]);
  const { t } = useForgeLang();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        let columns: Column[] = [];

        if (resolvedProjectId) {
          // Use project-scoped DB via server API
          const { data, error: qError } = await projectDBService.getSchema(resolvedProjectId);
          if (qError) throw new Error(String(qError));
          columns = Array.isArray(data) ? data : [];
        } else {
          // Fall back to main Supabase client
          const supabase = SupabaseService.getInstance().client;
          const { data, error: qError } = await supabase
            .from('information_schema.columns')
            .select('table_name, column_name, data_type, is_nullable')
            .eq('table_schema', 'public')
            .order('table_name')
            .order('ordinal_position');

          if (qError) {
            if (qError.message?.includes('permission') || qError.code === '42501') {
              setError(t('schema.needKey'));
            } else {
              setError(qError.message);
            }
            return;
          }
          columns = data ?? [];
        }

        // Group by table
        const grouped: Record<string, Column[]> = {};
        for (const col of columns) {
          if (!grouped[col.table_name]) grouped[col.table_name] = [];
          grouped[col.table_name].push(col);
        }
        setTables(Object.entries(grouped).map(([name, cols]) => ({ name, columns: cols })));
      } catch (e: any) {
        setError(e.message ?? t('studio.runtime.unknown'));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [resolvedProjectId]);

  const filtered = tables.filter(tbl => tbl.name.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) {
    return <div className="flex items-center justify-center py-10 text-neutral-500 text-sm">{t('schema.loading')}</div>;
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
        placeholder={t('schema.search')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary placeholder-neutral-500"
      />

      <div className="space-y-1">
        {filtered.map((table) => (
          <div key={table.name} className="border border-neutral-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [table.name]: !prev[table.name] }))}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-neutral-800/50 hover:bg-neutral-800 text-left transition-colors"
              aria-expanded={!!expanded[table.name]}
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  size={14}
                  className={`text-neutral-400 transition-transform ${expanded[table.name] ? 'rotate-90' : ''}`}
                />
                <span className="text-sm font-medium text-neutral-200 font-mono">{table.name}</span>
              </div>
              <span className="text-xs bg-neutral-700 text-neutral-400 px-2 py-0.5 rounded-full">
                {t('schema.cols', { count: table.columns.length })}
              </span>
            </button>

            {expanded[table.name] && (
              <div className="px-4 py-2 space-y-1.5 bg-neutral-900/30">
                {table.columns.map((col) => (
                  <div key={col.column_name} className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${col.is_nullable === 'YES' ? 'bg-emerald-500' : 'bg-neutral-600'}`}
                      title={col.is_nullable === 'YES' ? t('schema.nullable') : t('schema.notNull')}
                    />
                    <span className="text-sm text-neutral-200 font-mono">{col.column_name}</span>
                    <span className="text-xs text-neutral-500 ml-auto">{col.data_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-neutral-500 text-sm py-6">{t('schema.empty')}</p>
        )}
      </div>
    </div>
  );
}
