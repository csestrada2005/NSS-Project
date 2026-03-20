import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Trash2, History } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { projectDBService } from '@/services/ProjectDBService';

const HISTORY_KEY = 'forge_sql_history';

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveToHistory(query: string) {
  const hist = loadHistory().filter(q => q !== query);
  hist.unshift(query);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(0, 10)));
}

interface SQLEditorProps {
  projectId?: string | null;
}

export function SQLEditor({ projectId }: SQLEditorProps = {}) {
  const resolvedProjectId = projectId ?? sessionStorage.getItem('forge_project_id');
  const [query, setQuery] = useState('SELECT * FROM profiles LIMIT 10;');
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<Record<string, any>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const runQuery = async () => {
    if (!query.trim()) return;
    setIsRunning(true);
    setError(null);
    setResults(null);
    setRowCount(null);

    try {
      if (resolvedProjectId) {
        // Use project-scoped DB via server API
        const { data, error: qError } = await projectDBService.query(resolvedProjectId, query);
        if (qError) throw new Error(String(qError));
        const rows = Array.isArray(data) ? data : [];
        setResults(rows);
        setRowCount(rows.length);
      } else {
        // Fall back to main Supabase client
        const supabase = SupabaseService.getInstance().client;
        try {
          const { data, error: rpcErr } = await supabase.rpc('exec_sql', { query });
          if (rpcErr) throw rpcErr;
          const rows = Array.isArray(data) ? data : [];
          setResults(rows);
          setRowCount(rows.length);
        } catch (e: any) {
          const match = query.match(/FROM\s+([^\s;]+)/i);
          if (match) {
            const table = match[1].replace(/[^a-zA-Z0-9_]/g, '');
            const { data, error: selErr } = await supabase.from(table).select('*').limit(50);
            if (selErr) throw selErr;
            const rows = Array.isArray(data) ? data : [];
            setResults(rows);
            setRowCount(rows.length);
          } else {
            throw e;
          }
        }
      }

      saveToHistory(query);
      setHistory(loadHistory());
    } catch (e: any) {
      setError(e.message ?? 'Query failed');
    } finally {
      setIsRunning(false);
    }
  };

  const columns = results && results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="space-y-3">
      {/* History dropdown */}
      {history.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <History size={12} />
            Recent queries
          </button>
          {showHistory && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowHistory(false)} />
              <div className="absolute top-6 left-0 z-20 w-80 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
                {history.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => { setQuery(q); setShowHistory(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-700 font-mono truncate transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <Editor
          height="240px"
          language="sql"
          theme="vs-dark"
          value={query}
          onChange={(val) => setQuery(val ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={runQuery}
          disabled={isRunning || !query.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
        >
          <Play size={14} />
          {isRunning ? 'Running...' : 'Run Query'}
        </button>
        <button
          onClick={() => { setResults(null); setError(null); setRowCount(null); }}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
        >
          <Trash2 size={14} />
          Clear
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-2">
          <div className="text-xs text-zinc-500">{rowCount} row{rowCount !== 1 ? 's' : ''}</div>
          {results.length > 0 ? (
            <div className="overflow-x-auto border border-zinc-700 rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-800 text-zinc-400 border-b border-zinc-700">
                    {columns.map(col => (
                      <th key={col} className="text-left px-3 py-2 font-medium whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {results.map((row, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                      {columns.map(col => (
                        <td key={col} className="px-3 py-2 text-zinc-300 font-mono whitespace-nowrap max-w-[200px] truncate">
                          {row[col] === null ? <span className="text-zinc-600">null</span> : String(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm py-4 text-center">No rows returned</p>
          )}
        </div>
      )}
    </div>
  );
}
