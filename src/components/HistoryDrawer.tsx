import { useState, useEffect } from 'react';
import { X, Clock, RotateCcw, Tag, Loader2, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import type { FileSystemTree } from '@webcontainer/api';
import { SupabaseService } from '@/services/SupabaseService';

// CAMBIO 3 — el listado del drawer NO baja file_tree (puede pesar MBs por fila,
// x50 filas). El árbol se descarga sólo al ejecutar un restore (select por id).
interface Snapshot {
  id: string;
  label: string | null;
  trigger: string;
  created_at: string;
}

// Metadatos que el drawer entrega al padre junto al árbol restaurado, para que
// el mensaje de sistema del chat ("restaurado a la versión de …") sea honesto.
export interface RestoreMeta {
  label: string | null;
  created_at: string;
  trigger: string;
}

interface HistoryDrawerProps {
  projectId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (tree: FileSystemTree, meta: RestoreMeta) => void | Promise<void>;
  currentTree: FileSystemTree;
}

const TRIGGER_COLORS: Record<string, string> = {
  ai_action: 'bg-red-600/20 text-red-400 border-red-600/30',
  manual: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  zip_upload: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
  template_load: 'bg-green-600/20 text-green-400 border-green-600/30',
  manual_save: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  pre_restore: 'bg-slate-600/20 text-slate-300 border-slate-600/30',
};

const TRIGGER_LABELS: Record<string, string> = {
  ai_action: 'AI',
  manual: 'Checkpoint',
  zip_upload: 'Upload',
  template_load: 'Template',
  manual_save: 'Saved',
  pre_restore: 'Pre-restore',
};

export function HistoryDrawer({ projectId, isOpen, onClose, onRestore, currentTree }: HistoryDrawerProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelValue, setLabelValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  // CAMBIO 1a — confirmación previa al restore + estado de descarga del árbol.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Los 'pre_restore' viven en una sección secundaria colapsada (colapsada por
  // defecto): son puntos de vuelta atrás, no versiones que el usuario elija.
  const [showPreRestore, setShowPreRestore] = useState(false);

  const fetchSnapshots = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      // CAMBIO 3 — listado ligero: NO seleccionamos file_tree.
      const { data } = await supabase
        .from('forge_snapshots')
        .select('id, label, trigger, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);
      setSnapshots(data ?? []);
    } catch (e) {
      console.error('[HistoryDrawer] Failed to fetch snapshots:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && projectId) {
      fetchSnapshots();
    }
    if (!isOpen) {
      // Al cerrar, olvidar cualquier confirmación pendiente.
      setConfirmingId(null);
      setRestoringId(null);
    }
  }, [isOpen, projectId]);

  const handleSaveCheckpoint = async () => {
    if (!projectId || !labelValue.trim()) return;
    setIsSaving(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('forge_snapshots').insert({
        project_id: projectId,
        user_id: user.id,
        label: labelValue.trim(),
        file_tree: currentTree,
        trigger: 'manual',
      });

      setLabelValue('');
      setShowLabelInput(false);
      await fetchSnapshots();
    } catch (e) {
      console.error('[HistoryDrawer] Failed to save checkpoint:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // CAMBIO 1a/CAMBIO 3 — al confirmar, se baja el file_tree de ESE snapshot
  // (select por id, el único fetch que trae el árbol) y se delega en el padre
  // el restore por el embudo normal (auto-checkpoint + escritura + recompile).
  const handleRestore = async (snapshot: Snapshot) => {
    if (!projectId) return;
    setRestoringId(snapshot.id);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, error } = await supabase
        .from('forge_snapshots')
        .select('file_tree')
        .eq('id', snapshot.id)
        .single();
      if (error || !data) {
        console.error('[HistoryDrawer] Failed to load snapshot tree:', error);
        return;
      }
      const parsed: FileSystemTree = typeof data.file_tree === 'string'
        ? JSON.parse(data.file_tree)
        : data.file_tree;
      setConfirmingId(null);
      await onRestore(parsed, {
        label: snapshot.label,
        created_at: snapshot.created_at,
        trigger: snapshot.trigger,
      });
    } catch (e) {
      console.error('[HistoryDrawer] Failed to restore snapshot:', e);
    } finally {
      setRestoringId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  // El listado ya llega ordenado por created_at desc. Separamos los pre_restore
  // (sección secundaria) del resto (versiones "reales" que el usuario elige).
  const mainSnapshots = snapshots.filter((s) => s.trigger !== 'pre_restore');
  const preRestoreSnapshots = snapshots.filter((s) => s.trigger === 'pre_restore');
  // Sólo el pre_restore más reciente es visible: la retención poda los anteriores,
  // pero aunque llegaran varios, aquí sólo mostramos el último.
  const latestPreRestore = preRestoreSnapshots[0] ?? null;

  const renderSnapshotCard = (snap: Snapshot) => (
    <div
      key={snap.id}
      className="rounded-lg border border-border bg-accent/50 p-3 hover:border-border/80 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${TRIGGER_COLORS[snap.trigger] ?? 'bg-gray-700 text-gray-400 border-gray-600'}`}>
              {TRIGGER_LABELS[snap.trigger] ?? snap.trigger}
            </span>
          </div>
          {snap.label && (
            <p className="text-foreground text-sm font-medium truncate">{snap.label}</p>
          )}
          <p className="text-muted-foreground text-xs mt-0.5">{formatDate(snap.created_at)}</p>
        </div>
        <button
          onClick={() => setConfirmingId(snap.id)}
          disabled={restoringId !== null}
          className="flex items-center gap-1 px-2 py-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs rounded transition-colors shrink-0"
        >
          <RotateCcw size={11} />
          Restore
        </button>
      </div>

      {/* CAMBIO 1a — confirmación: todo restore guarda antes un
          checkpoint del estado actual, así que siempre es reversible. */}
      {confirmingId === snap.id && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            ¿Restaurar a esta versión? Se guardará un checkpoint del estado actual.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRestore(snap)}
              disabled={restoringId !== null}
              className="flex items-center gap-1 px-2.5 py-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs rounded transition-colors"
            >
              {restoringId === snap.id
                ? <Loader2 size={11} className="animate-spin" />
                : <RotateCcw size={11} />}
              Restaurar
            </button>
            <button
              onClick={() => setConfirmingId(null)}
              disabled={restoringId !== null}
              className="px-2.5 py-1 text-muted-foreground hover:text-foreground text-xs rounded transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[79]"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-96 bg-card border-l border-border z-[80] flex flex-col shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <GitBranch size={18} className="text-red-400" />
            <span className="text-white font-semibold">Version History</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Save Checkpoint */}
        <div className="px-3 py-3 border-b border-border">
          {showLabelInput ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                placeholder="Checkpoint name..."
                autoFocus
                className="flex-1 bg-accent border border-border rounded px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveCheckpoint();
                  if (e.key === 'Escape') { setShowLabelInput(false); setLabelValue(''); }
                }}
              />
              <button
                onClick={handleSaveCheckpoint}
                disabled={!labelValue.trim() || isSaving}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white text-xs rounded transition-colors"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
              </button>
              <button
                onClick={() => { setShowLabelInput(false); setLabelValue(''); }}
                className="px-2 py-1.5 text-gray-400 hover:text-white text-xs rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLabelInput(true)}
              className="w-full flex items-center justify-center gap-2 py-2 bg-accent hover:bg-accent/80 border border-border text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              <Tag size={14} />
              Save checkpoint
            </button>
          )}
        </div>

        {/* Snapshot List */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="animate-spin text-gray-500" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <Clock size={32} className="text-gray-600" />
              <p className="text-gray-400 font-medium">No history yet</p>
              <p className="text-gray-600 text-sm">Actions are auto-saved as you build</p>
            </div>
          ) : (
            <>
              {mainSnapshots.map((snap) => renderSnapshotCard(snap))}

              {/* Sección secundaria colapsada: puntos de restauración
                  (pre_restore). Sólo se muestra el más reciente. */}
              {latestPreRestore && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowPreRestore((v) => !v)}
                    className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPreRestore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Punto de restauración
                  </button>
                  {showPreRestore && (
                    <div className="mt-2">
                      {renderSnapshotCard(latestPreRestore)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
