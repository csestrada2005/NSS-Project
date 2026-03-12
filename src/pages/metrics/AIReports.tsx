import { useEffect, useState, useRef } from 'react';
import { Bot, Plus, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { SupabaseService } from '@/services/SupabaseService';
import type { Report } from '@/types';

const supabase = SupabaseService.getInstance().client;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string): string => {
  const dt = new Date(iso);
  return dt.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

// ── Markdown renderer ─────────────────────────────────────────────────────────

const renderMarkdown = (text: string): JSX.Element[] => {
  const lines = text.split('\n');
  const elements: JSX.Element[] = [];
  let ulBuffer: string[] = [];
  let key = 0;

  const flushUl = () => {
    if (ulBuffer.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 text-zinc-300">
          {ulBuffer.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">{item}</li>
          ))}
        </ul>
      );
      ulBuffer = [];
    }
  };

  const renderInline = (raw: string): JSX.Element => {
    const parts: (string | JSX.Element)[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let last = 0;
    let match;
    let idx = 0;
    while ((match = boldRegex.exec(raw)) !== null) {
      if (match.index > last) {
        parts.push(raw.slice(last, match.index));
      }
      parts.push(<strong key={idx++} className="font-semibold text-zinc-100">{match[1]}</strong>);
      last = boldRegex.lastIndex;
    }
    if (last < raw.length) parts.push(raw.slice(last));
    return <>{parts}</>;
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flushUl();
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-zinc-100 mt-5 mb-2 border-b border-zinc-700 pb-1">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('# ')) {
      flushUl();
      elements.push(
        <h1 key={key++} className="text-xl font-bold text-zinc-100 mt-6 mb-2">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('- ')) {
      ulBuffer.push(line.slice(2));
    } else if (line.trim() === '') {
      flushUl();
      elements.push(<div key={key++} className="h-2" />);
    } else {
      flushUl();
      elements.push(
        <p key={key++} className="text-sm text-zinc-300 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushUl();
  return elements;
};

// ── Labels ────────────────────────────────────────────────────────────────────

const labels = {
  title: { en: 'AI Reports', es: 'Reportes IA' },
  newReport: { en: 'New Report', es: 'Nuevo Reporte' },
  emptyTitle: { en: 'Select or create a report', es: 'Selecciona o crea un reporte' },
  emptySubtitle: {
    en: 'Click "New Report" to generate an AI-powered summary of your data.',
    es: 'Haz clic en "Nuevo Reporte" para generar un resumen con IA de tus datos.',
  },
  noReports: { en: 'No reports yet', es: 'Sin reportes aún' },
  modalTitle: { en: 'New Report', es: 'Nuevo Reporte' },
  titleLabel: { en: 'Title', es: 'Título' },
  titlePlaceholder: { en: 'Monthly project summary', es: 'Resumen mensual de proyectos' },
  promptLabel: { en: 'Prompt', es: 'Instrucción' },
  promptPlaceholder: {
    en: 'Summarize project status for this month, highlight any overdue milestones and top pipeline deals.',
    es: 'Resume el estado de los proyectos de este mes, destaca hitos vencidos y los principales negocios en pipeline.',
  },
  generateBtn: { en: 'Generate', es: 'Generar' },
  cancelBtn: { en: 'Cancel', es: 'Cancelar' },
  generatingMsg: { en: 'Generating report…', es: 'Generando reporte…' },
  errorPrefix: { en: 'Error: ', es: 'Error: ' },
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

const statusBadgeClass: Record<Report['status'], string> = {
  pending: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  generating: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  done: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  error: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const statusBadgeLabel: Record<Report['status'], { en: string; es: string }> = {
  pending: { en: 'Pending', es: 'Pendiente' },
  generating: { en: 'Generating', es: 'Generando' },
  done: { en: 'Done', es: 'Listo' },
  error: { en: 'Error', es: 'Error' },
};

// ── Main Component ─────────────────────────────────────────────────────────────

const AIReports = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingIdRef = useRef<string | null>(null);

  const l = (key: keyof typeof labels) => labels[key][lang];

  // ── Load reports list ──
  const loadReports = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setReports(data as Report[]);
      // Refresh selected report if it's in the list
      if (selectedReport) {
        const updated = (data as Report[]).find((r) => r.id === selectedReport.id);
        if (updated) setSelectedReport(updated);
      }
    }
    setLoadingList(false);
  };

  useEffect(() => {
    loadReports();
    return () => stopPolling();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling ──
  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = (reportId: string) => {
    pollingIdRef.current = reportId;
    pollingRef.current = setInterval(async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();
      if (error || !data) return;
      const report = data as Report;
      // Update in list
      setReports((prev) => prev.map((r) => (r.id === reportId ? report : r)));
      // Update selected if it's the same
      if (pollingIdRef.current === reportId) {
        setSelectedReport(report);
      }
      if (report.status === 'done' || report.status === 'error') {
        stopPolling();
      }
    }, 3000);
  };

  // ── Submit new report ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formTitle.trim() || !formPrompt.trim()) return;
    setFormError(null);
    setSubmitting(true);
    try {
      // Insert report row
      const { data: created, error: insertErr } = await supabase
        .from('reports')
        .insert({ user_id: user.id, title: formTitle.trim(), prompt: formPrompt.trim(), status: 'pending' })
        .select()
        .single();
      if (insertErr) throw insertErr;
      const newReport = created as Report;

      // Add to list and select
      setReports((prev) => [newReport, ...prev]);
      setSelectedReport(newReport);
      setShowModal(false);
      setFormTitle('');
      setFormPrompt('');

      // Invoke edge function
      await supabase.functions.invoke('generate-report', { body: { report_id: newReport.id } });

      // Start polling
      startPolling(newReport.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create report';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  return (
    <div className="flex gap-4 min-h-[600px]">
      {/* Left panel — report list */}
      <div className="w-72 shrink-0 flex flex-col bg-muted/50 border border-border rounded-xl overflow-hidden">
        {/* New Report button */}
        <div className="p-3 border-b border-border">
          <button
            onClick={() => { setShowModal(true); setFormError(null); }}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            {l('newReport')}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {loadingList && (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 bg-zinc-700/40 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {!loadingList && reports.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">{l('noReports')}</p>
          )}
          {!loadingList && reports.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                selectedReport?.id === report.id
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium truncate leading-tight">{report.title}</span>
                <Badge
                  className={`text-xs border shrink-0 ${statusBadgeClass[report.status]} ${
                    report.status === 'generating' ? 'animate-pulse' : ''
                  }`}
                >
                  {statusBadgeLabel[report.status][lang]}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-1">{fmtDate(report.created_at)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — report content */}
      <div className="flex-1 bg-zinc-800 rounded-xl overflow-hidden">
        {!selectedReport && (
          <div className="h-full flex flex-col items-center justify-center gap-4 p-12 text-center">
            <div className="bg-zinc-700 rounded-full p-4">
              <Bot size={28} className="text-zinc-400" />
            </div>
            <p className="text-zinc-200 font-semibold">{l('emptyTitle')}</p>
            <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{l('emptySubtitle')}</p>
          </div>
        )}

        {selectedReport && selectedReport.status === 'generating' && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">{l('generatingMsg')}</p>
          </div>
        )}

        {selectedReport && selectedReport.status === 'pending' && (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="w-8 h-8 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-400 text-sm">{l('generatingMsg')}</p>
          </div>
        )}

        {selectedReport && selectedReport.status === 'error' && (
          <div className="p-6">
            <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-xl px-5 py-4 text-sm">
              {l('errorPrefix')}{selectedReport.error_msg ?? 'Unknown error'}
            </div>
          </div>
        )}

        {selectedReport && selectedReport.status === 'done' && selectedReport.content && (
          <div className="p-6 overflow-y-auto h-full">
            <div className="flex items-center gap-2 mb-5 pb-4 border-b border-zinc-700">
              <FileText size={16} className="text-emerald-400 shrink-0" />
              <h2 className="text-base font-semibold text-zinc-100">{selectedReport.title}</h2>
              <span className="text-zinc-500 text-xs ml-auto">{fmtDate(selectedReport.created_at)}</span>
            </div>
            <div className="space-y-1 leading-relaxed">
              {renderMarkdown(selectedReport.content)}
            </div>
          </div>
        )}
      </div>

      {/* New Report Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-base font-semibold text-zinc-100 mb-4">{l('modalTitle')}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2.5 text-sm">
                  {formError}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">{l('titleLabel')}</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={l('titlePlaceholder')}
                  required
                  className="w-full bg-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-emerald-500 placeholder:text-zinc-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">{l('promptLabel')}</label>
                <textarea
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder={l('promptPlaceholder')}
                  required
                  rows={3}
                  className="w-full bg-zinc-700 text-zinc-200 text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-emerald-500 placeholder:text-zinc-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setFormError(null); }}
                  className="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  {l('cancelBtn')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formTitle.trim() || !formPrompt.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
                >
                  {submitting ? '…' : l('generateBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIReports;
