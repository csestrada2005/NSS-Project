import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SupabaseService } from '@/services/SupabaseService';
import { useNavigate, useSearchParams } from 'react-router-dom';

type DealRevisionSummary = {
  id: string;
  revision_number: number;
  submitted_by_role: string;
  value: number;
  scope_description: string | null;
  timeline: string | null;
  note: string | null;
  status: string;
  created_at: string;
};

type ProposalDeal = {
  id: string;
  title: string;
  value: number;
  status: string | null;
  scope_description: string | null;
  timeline: string | null;
  stage: string;
  deposit_paid: boolean | null;
  forge_project_id: string | null;
  deal_revisions: DealRevisionSummary[];
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const statusBadgeClass: Record<string, string> = {
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  sent_to_client: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  client_revised: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  developer_reviewing: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  accepted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed_won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const statusLabel: Record<string, { en: string; es: string }> = {
  draft: { en: 'Draft', es: 'Borrador' },
  sent_to_client: { en: 'Pending Review', es: 'Pendiente de Revisión' },
  client_revised: { en: 'Changes Requested', es: 'Cambios Solicitados' },
  developer_reviewing: { en: 'Under Review', es: 'En Revisión' },
  accepted: { en: 'Accepted', es: 'Aceptado' },
  closed_won: { en: 'Active', es: 'Activo' },
};

const ProposalsPage = () => {
  const { lang } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [deals, setDeals] = useState<ProposalDeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [expandedScope, setExpandedScope] = useState<Set<string>>(new Set());
  const [confirmAcceptDeal, setConfirmAcceptDeal] = useState<ProposalDeal | null>(null);
  const [reviseOpenDeal, setReviseOpenDeal] = useState<ProposalDeal | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Revise form state
  const [reviseValue, setReviseValue] = useState('');
  const [reviseScope, setReviseScope] = useState('');
  const [reviseTimeline, setReviseTimeline] = useState('');
  const [reviseNote, setReviseNote] = useState('');

  useEffect(() => {
    if (searchParams.get('deposit') === 'success') {
      toast.success(lang === 'es' ? '¡Depósito pagado! Tu proyecto ha sido creado.' : 'Deposit paid! Your project has been created.');
    }
  }, []);

  const loadDeals = async () => {
    if (!user?.id) return;
    const supabase = SupabaseService.getInstance().client;
    const { data } = await supabase
      .from('deals')
      .select(`
        id, title, value, status, scope_description, timeline, stage,
        deposit_paid, forge_project_id,
        deal_revisions(id, revision_number, submitted_by_role, value, scope_description, timeline, note, status, created_at)
      `)
      .eq('client_profile_id', user.id)
      .order('created_at', { ascending: false });

    setDeals((data as ProposalDeal[]) ?? []);
    setIsLoading(false);
  };

  useEffect(() => { loadDeals(); }, [user?.id]);

  const toggleHistory = (id: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleScope = (id: string) => {
    setExpandedScope(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAccept = async () => {
    if (!confirmAcceptDeal) return;
    setActionLoading('accept-' + confirmAcceptDeal.id);
    const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
    const resp = await fetch(`/api/deals/${confirmAcceptDeal.id}/accept`, {
      method: 'POST',
      headers: { Authorization },
    });
    if (resp.ok) {
      const { checkoutUrl } = await resp.json();
      setConfirmAcceptDeal(null);
      window.location.href = checkoutUrl;
    } else {
      const err = await resp.json();
      toast.error(err.error ?? (lang === 'es' ? 'Error al aceptar' : 'Accept failed'));
    }
    setActionLoading(null);
  };

  const openRevise = (deal: ProposalDeal) => {
    setReviseOpenDeal(deal);
    setReviseValue(String(deal.value));
    setReviseScope(deal.scope_description ?? '');
    setReviseTimeline(deal.timeline ?? '');
    setReviseNote('');
  };

  const handleRevise = async () => {
    if (!reviseOpenDeal || !reviseNote.trim()) return;
    setActionLoading('revise-' + reviseOpenDeal.id);
    const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
    const resp = await fetch(`/api/deals/${reviseOpenDeal.id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization },
      body: JSON.stringify({
        value: parseFloat(reviseValue),
        scope_description: reviseScope || null,
        timeline: reviseTimeline || null,
        note: reviseNote.trim(),
      }),
    });
    if (resp.ok) {
      toast.success(lang === 'es' ? 'Cambios enviados al desarrollador' : 'Changes sent to developer');
      setReviseOpenDeal(null);
      // Optimistically update status
      setDeals(prev => prev.map(d =>
        d.id === reviseOpenDeal.id ? { ...d, status: 'client_revised' } : d
      ));
    } else {
      toast.error(lang === 'es' ? 'Error al enviar cambios' : 'Failed to send changes');
    }
    setActionLoading(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <FileText className="w-12 h-12 text-muted-foreground" />
        <p className="text-lg font-medium text-foreground">
          {lang === 'es' ? 'Sin propuestas aún' : 'No proposals yet'}
        </p>
        <p className="text-sm text-muted-foreground">
          {lang === 'es' ? 'Tu desarrollador te enviará propuestas de proyecto aquí.' : 'Your developer will send you project proposals here.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {lang === 'es' ? 'Propuestas' : 'Proposals'}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {lang === 'es' ? 'Revisa y responde a las propuestas de tu desarrollador.' : 'Review and respond to proposals from your developer.'}
        </p>
      </div>

      {/* Deal Cards */}
      <div className="space-y-4">
        {deals.map(deal => {
          const canAccept = deal.status === 'sent_to_client' || deal.status === 'developer_reviewing';
          const isActive = deal.deposit_paid && deal.forge_project_id;
          const scopeExpanded = expandedScope.has(deal.id);
          const historyExpanded = expandedHistory.has(deal.id);
          const sortedRevisions = [...(deal.deal_revisions ?? [])].sort((a, b) => a.revision_number - b.revision_number);

          return (
            <div key={deal.id} className="rounded-xl bg-card border border-border p-5 space-y-4">
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">{deal.title}</h2>
                  <p className="text-xl font-bold text-emerald-400 mt-1">{fmtCurrency(deal.value)}</p>
                  {deal.timeline && (
                    <p className="text-xs text-muted-foreground mt-1">{lang === 'es' ? 'Timeline' : 'Timeline'}: {deal.timeline}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {deal.status && (
                    <Badge className={`text-xs border ${statusBadgeClass[deal.status] ?? ''}`}>
                      {statusLabel[deal.status]?.[lang] ?? deal.status}
                    </Badge>
                  )}
                  {isActive && (
                    <Badge className="text-xs border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      {lang === 'es' ? 'Proyecto Activo' : 'Project Active'}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Scope */}
              {deal.scope_description && (
                <div>
                  <p className={`text-sm text-muted-foreground ${!scopeExpanded ? 'line-clamp-2' : ''}`}>
                    {deal.scope_description}
                  </p>
                  {deal.scope_description.length > 120 && (
                    <button
                      onClick={() => toggleScope(deal.id)}
                      className="text-xs text-primary hover:underline mt-1"
                    >
                      {scopeExpanded ? (lang === 'es' ? 'Ver menos' : 'Show less') : (lang === 'es' ? 'Ver más' : 'Show more')}
                    </button>
                  )}
                </div>
              )}

              {/* Action buttons */}
              {canAccept && !reviseOpenDeal && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={() => setConfirmAcceptDeal(deal)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {lang === 'es' ? 'Aceptar Propuesta' : 'Accept Proposal'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openRevise(deal)}
                    className="flex-1"
                  >
                    {lang === 'es' ? 'Solicitar Cambios' : 'Request Changes'}
                  </Button>
                </div>
              )}

              {/* Revise form (inline) */}
              {reviseOpenDeal?.id === deal.id && (
                <div className="space-y-3 rounded-lg bg-background border border-border p-4">
                  <h3 className="text-sm font-medium text-foreground">
                    {lang === 'es' ? 'Solicitar Cambios' : 'Request Changes'}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{lang === 'es' ? 'Valor ($)' : 'Value ($)'}</label>
                      <Input type="number" value={reviseValue} onChange={e => setReviseValue(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Timeline</label>
                      <Input value={reviseTimeline} onChange={e => setReviseTimeline(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">{lang === 'es' ? 'Descripción del Alcance' : 'Scope Description'}</label>
                    <textarea
                      value={reviseScope}
                      onChange={e => setReviseScope(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {lang === 'es' ? 'Nota al desarrollador *' : 'Note to developer *'}
                    </label>
                    <textarea
                      value={reviseNote}
                      onChange={e => setReviseNote(e.target.value)}
                      rows={2}
                      required
                      placeholder={lang === 'es' ? 'Explica qué te gustaría cambiar...' : "Explain what you'd like changed..."}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRevise}
                      disabled={!reviseNote.trim() || actionLoading === 'revise-' + deal.id}
                      className="flex-1"
                    >
                      {actionLoading === 'revise-' + deal.id ? (
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : (lang === 'es' ? 'Enviar Cambios' : 'Send Changes')}
                    </Button>
                    <Button variant="outline" onClick={() => setReviseOpenDeal(null)} className="flex-1">
                      {lang === 'es' ? 'Cancelar' : 'Cancel'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Active project button */}
              {isActive && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/project/${deal.forge_project_id}/status`)}
                  className="w-full"
                >
                  {lang === 'es' ? 'Ver Estado del Proyecto' : 'View Project Status'}
                </Button>
              )}

              {/* Change History collapsible */}
              <div>
                <button
                  onClick={() => toggleHistory(deal.id)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {historyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {lang === 'es' ? `Mostrar historial (${sortedRevisions.length} revisiones)` : `Show history (${sortedRevisions.length} revisions)`}
                </button>
                {historyExpanded && (
                  <div className="mt-3 space-y-2">
                    {sortedRevisions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {lang === 'es' ? 'Sin revisiones aún.' : 'No revisions yet.'}
                      </p>
                    ) : sortedRevisions.map((rev, idx) => {
                      const isLatest = idx === sortedRevisions.length - 1;
                      return (
                        <div
                          key={rev.id}
                          className={`rounded-lg border px-4 py-3 space-y-1 text-xs ${isLatest ? 'border-primary/40 bg-primary/5' : 'border-border bg-background'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              {lang === 'es' ? `Revisión ${rev.revision_number}` : `Revision ${rev.revision_number}`}
                              {' — '}
                              {rev.submitted_by_role === 'developer'
                                ? (lang === 'es' ? 'Desarrollador' : 'Developer')
                                : (lang === 'es' ? 'Cliente' : 'Client')}
                            </span>
                            <span className="text-muted-foreground">
                              {new Date(rev.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-foreground font-semibold">{fmtCurrency(rev.value)}</p>
                          {rev.timeline && <p className="text-muted-foreground">Timeline: {rev.timeline}</p>}
                          {rev.scope_description && (
                            <p className="text-muted-foreground line-clamp-1">{rev.scope_description}</p>
                          )}
                          {rev.note && (
                            <p className="text-amber-400 italic">"{rev.note}"</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Accept Confirmation Dialog */}
      {confirmAcceptDeal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-foreground">
              {lang === 'es' ? 'Confirmar Aceptación' : 'Confirm Acceptance'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {lang === 'es'
                ? `Al aceptar, pagarás un depósito del 50% de ${fmtCurrency(Math.ceil(confirmAcceptDeal.value * 0.5))}. Serás redirigido al pago.`
                : `By accepting, you agree to pay a 50% deposit of ${fmtCurrency(Math.ceil(confirmAcceptDeal.value * 0.5))}. You will be redirected to payment.`}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleAccept}
                disabled={actionLoading === 'accept-' + confirmAcceptDeal.id}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {actionLoading === 'accept-' + confirmAcceptDeal.id ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (lang === 'es' ? 'Confirmar y Pagar' : 'Confirm & Pay')}
              </Button>
              <Button variant="outline" onClick={() => setConfirmAcceptDeal(null)} className="flex-1">
                {lang === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProposalsPage;
