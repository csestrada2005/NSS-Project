import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, TrendingUp, Send, Edit2, History, ExternalLink, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { getDeals, createDeal, updateDeal, deleteDeal, getContactsForDropdown, getDealRevisions } from '@/services/data/supabaseData';
import { usePagination } from '@/hooks/usePagination';
import Pagination from '@/components/Pagination';
import { SupabaseService } from '@/services/SupabaseService';
import { useNavigate } from 'react-router-dom';
import type { Deal } from '@/types';
import LoadingSquares from '../components/brand/LoadingSquares';

type ClientProfile = { id: string; full_name: string | null; email: string | null };
type CollaboratorEntry = { id: string; full_name: string | null; email: string | null; role: 'read' | 'edit' };

type DealWithContact = Deal & { contacts: { name: string } | null };

type DealRevision = {
  id: string;
  deal_id: string;
  revision_number: number;
  submitted_by: string;
  submitted_by_role: string;
  value: number;
  scope_description: string | null;
  timeline: string | null;
  note: string | null;
  status: string;
  created_at: string;
  profiles: { full_name: string | null; role: string | null } | null;
};

const STAGES: Deal['stage'][] = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

const stageBadgeClass: Record<Deal['stage'], string> = {
  prospecting: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  qualification: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  proposal: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  negotiation: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  closed_won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed_lost: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const stageLabel: Record<Deal['stage'], { en: string; es: string }> = {
  prospecting: { en: 'Prospecting', es: 'Prospección' },
  qualification: { en: 'Qualification', es: 'Calificación' },
  proposal: { en: 'Proposal', es: 'Propuesta' },
  negotiation: { en: 'Negotiation', es: 'Negociación' },
  closed_won: { en: 'Closed Won', es: 'Ganado' },
  closed_lost: { en: 'Closed Lost', es: 'Perdido' },
};

const statusBadgeClass: Record<string, string> = {
  draft: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  sent_to_client: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  client_revised: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  developer_reviewing: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  accepted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed_won: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const statusLabel: Record<string, { en: string; es: string }> = {
  draft: { en: 'Draft', es: 'Borrador' },
  sent_to_client: { en: 'Sent to Client', es: 'Enviado al Cliente' },
  client_revised: { en: 'Client Revised', es: 'Cliente Revisó' },
  developer_reviewing: { en: 'Dev Reviewing', es: 'Dev Revisando' },
  accepted: { en: 'Accepted', es: 'Aceptado' },
  closed_won: { en: 'Closed Won', es: 'Cerrado Ganado' },
};

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const PAGE_SIZE = 20;

// DealHistoryPanel component
const DealHistoryPanel = ({ deal, onClose }: { deal: DealWithContact; onClose: () => void }) => {
  const [revisions, setRevisions] = useState<DealRevision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDealRevisions(deal.id).then(data => {
      setRevisions(data as DealRevision[]);
      setLoading(false);
    });
  }, [deal.id]);

  const revisionStatusClass: Record<string, string> = {
    pending: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
    accepted: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    superseded: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/20',
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex justify-end">
      <div className="bg-neutral-800 border-l border-neutral-700 w-full max-w-md flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">
            Deal History — {deal.title}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">&times;</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSquares size={32} />
            </div>
          ) : revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No revisions yet.</p>
          ) : revisions.map(rev => (
            <div key={rev.id} className="rounded-lg border border-border bg-background p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Revision #{rev.revision_number} · {rev.submitted_by_role === 'developer' ? 'Developer' : 'Client'}
                </span>
                <Badge className={`text-xs border ${revisionStatusClass[rev.status] ?? ''}`}>
                  {rev.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(rev.created_at).toLocaleDateString()} by {rev.profiles?.full_name ?? '—'}
              </p>
              <p className="text-sm text-foreground font-semibold">{fmtCurrency(rev.value)}</p>
              {rev.timeline && <p className="text-xs text-muted-foreground">Timeline: {rev.timeline}</p>}
              {rev.scope_description && (
                <p className="text-xs text-muted-foreground line-clamp-2">Scope: {rev.scope_description}</p>
              )}
              {rev.note && (
                <p className="text-xs text-amber-400 italic">Note: {rev.note}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DealsPage = () => {
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const [deals, setDeals] = useState<DealWithContact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealWithContact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historyDeal, setHistoryDeal] = useState<DealWithContact | null>(null);
  const [, setReviseNote] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formStage, setFormStage] = useState<Deal['stage']>('prospecting');
  const [formProb, setFormProb] = useState('50');
  const [formClose, setFormClose] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formScope, setFormScope] = useState('');
  const [formTimeline, setFormTimeline] = useState('');
  const [formNote, setFormNote] = useState('');

  // Client email search state
  const [clientEmailInput, setClientEmailInput] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState<ClientProfile[]>([]);
  const [clientSearchLoading, setClientSearchLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const clientDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Collaborators state
  const [collabEmailInput, setCollabEmailInput] = useState('');
  const [collabSearchResults, setCollabSearchResults] = useState<ClientProfile[]>([]);
  const [collabSearchLoading, setCollabSearchLoading] = useState(false);
  const [pendingCollaborators, setPendingCollaborators] = useState<CollaboratorEntry[]>([]);
  const collabDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { currentPage, totalPages, goToPage } = usePagination(totalCount, PAGE_SIZE);

  const load = async (page: number, q: string) => {
    setIsLoading(true);
    const { data, count } = await getDeals(page, PAGE_SIZE, q);
    setDeals(data);
    setTotalCount(count);
    setIsLoading(false);
  };

  const searchProfiles = useCallback(async (input: string): Promise<ClientProfile[]> => {
    if (!input.trim() || input.trim().length < 2) return [];
    const supabase = SupabaseService.getInstance().client;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`email.ilike.%${input}%,full_name.ilike.%${input}%`)
      .limit(5);
    return (data ?? []) as ClientProfile[];
  }, []);

  // Debounced client search
  useEffect(() => {
    clearTimeout(clientDebounceRef.current);
    if (!clientEmailInput.trim()) { setClientSearchResults([]); return; }
    clientDebounceRef.current = setTimeout(async () => {
      setClientSearchLoading(true);
      const results = await searchProfiles(clientEmailInput);
      setClientSearchResults(results);
      setClientSearchLoading(false);
    }, 300);
    return () => clearTimeout(clientDebounceRef.current);
  }, [clientEmailInput, searchProfiles]);

  // Debounced collaborator search
  useEffect(() => {
    clearTimeout(collabDebounceRef.current);
    if (!collabEmailInput.trim()) { setCollabSearchResults([]); return; }
    collabDebounceRef.current = setTimeout(async () => {
      setCollabSearchLoading(true);
      const results = await searchProfiles(collabEmailInput);
      setCollabSearchResults(results);
      setCollabSearchLoading(false);
    }, 300);
    return () => clearTimeout(collabDebounceRef.current);
  }, [collabEmailInput, searchProfiles]);

  useEffect(() => {
    getContactsForDropdown().then(setContacts);
  }, []);

  useEffect(() => { goToPage(1); load(1, search); }, [search]);
  useEffect(() => { load(currentPage, search); }, [currentPage]);

  const resetClientSearch = () => {
    setClientEmailInput('');
    setClientSearchResults([]);
    setSelectedClient(null);
  };

  const resetCollabSearch = () => {
    setCollabEmailInput('');
    setCollabSearchResults([]);
    setPendingCollaborators([]);
  };

  const openCreate = () => {
    setEditingDeal(null);
    setFormTitle(''); setFormValue(''); setFormStage('prospecting');
    setFormProb('50'); setFormClose(''); setFormContactId('');
    setFormScope(''); setFormTimeline(''); setFormNote('');
    resetClientSearch();
    resetCollabSearch();
    setShowModal(true);
  };

  const openEdit = async (deal: DealWithContact, withNote = false) => {
    setEditingDeal(deal);
    setFormTitle(deal.title);
    setFormValue(String(deal.value));
    setFormStage(deal.stage);
    setFormProb(String(deal.probability));
    setFormClose(deal.expected_close ?? '');
    setFormContactId(deal.contact_id ?? '');
    setFormScope(deal.scope_description ?? '');
    setFormTimeline(deal.timeline ?? '');
    setFormNote('');
    setReviseNote(withNote ? '' : '');
    resetCollabSearch();

    // Pre-populate selectedClient from deal's client_profile_id
    if (deal.client_profile_id) {
      setClientEmailInput('');
      setClientSearchResults([]);
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('id', deal.client_profile_id)
        .single();
      setSelectedClient(data ? (data as ClientProfile) : null);
    } else {
      resetClientSearch();
    }

    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formValue) return;
    setIsSubmitting(true);
    const payload = {
      title: formTitle.trim(),
      value: parseFloat(formValue),
      stage: formStage,
      probability: parseInt(formProb, 10),
      expected_close: formClose || null,
      contact_id: formContactId || null,
      client_profile_id: selectedClient?.id || null,
      scope_description: formScope || null,
      timeline: formTimeline || null,
    };

    if (editingDeal) {
      // If the modal was opened for "Revise", call /revise endpoint
      if (formNote.trim()) {
        const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
        const resp = await fetch(`/api/deals/${editingDeal.id}/revise`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization },
          body: JSON.stringify({
            value: payload.value,
            scope_description: payload.scope_description,
            timeline: payload.timeline,
            note: formNote.trim(),
          }),
        });
        if (resp.ok) {
          toast.success(lang === 'es' ? 'Propuesta revisada' : 'Proposal revised');
          load(currentPage, search);
        } else {
          toast.error(lang === 'es' ? 'Error al revisar' : 'Revise failed');
        }
      } else {
        const updated = await updateDeal(editingDeal.id, payload);
        if (updated) {
          setDeals(prev => prev.map(d => d.id === editingDeal.id ? { ...d, ...updated } : d));
          toast.success(lang === 'es' ? 'Deal actualizado' : 'Deal updated');
          // Insert collaborators if deal has a forge_project_id
          if (pendingCollaborators.length > 0 && editingDeal.forge_project_id) {
            const supabase = SupabaseService.getInstance().client;
            await Promise.all(pendingCollaborators.map(c =>
              supabase.from('forge_project_collaborators').upsert({
                project_id: editingDeal.forge_project_id,
                user_id: c.id,
                role: c.role,
                status: 'pending',
              })
            ));
          }
        } else {
          toast.error(lang === 'es' ? 'Error al actualizar' : 'Update failed');
        }
      }
    } else {
      const created = await createDeal(payload);
      if (created) {
        toast.success(lang === 'es' ? 'Deal creado' : 'Deal created');
        // Insert collaborators if deal has a forge_project_id
        if (pendingCollaborators.length > 0 && created.forge_project_id) {
          const supabase = SupabaseService.getInstance().client;
          await Promise.all(pendingCollaborators.map(c =>
            supabase.from('forge_project_collaborators').upsert({
              project_id: created.forge_project_id,
              user_id: c.id,
              role: c.role,
              status: 'pending',
            })
          ));
        }
        load(currentPage, search);
      } else {
        toast.error(lang === 'es' ? 'Error al crear' : 'Create failed');
      }
    }
    setShowModal(false);
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteDeal(id);
    if (ok) { toast.success(lang === 'es' ? 'Deal eliminado' : 'Deal deleted'); load(currentPage, search); }
    else toast.error(lang === 'es' ? 'Error al eliminar' : 'Delete failed');
  };

  const handleSendToClient = async (deal: DealWithContact) => {
    setActionLoading(deal.id + '-send');
    const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
    const resp = await fetch(`/api/deals/${deal.id}/send-to-client`, {
      method: 'POST',
      headers: { Authorization },
    });
    if (resp.ok) {
      toast.success(lang === 'es' ? 'Propuesta enviada al cliente' : 'Proposal sent to client');
      load(currentPage, search);
    } else {
      toast.error(lang === 'es' ? 'Error al enviar' : 'Send failed');
    }
    setActionLoading(null);
  };

  // Pipeline KPIs
  const openDeals = deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage));
  const weightedPipeline = openDeals.reduce((s, d) => s + (d.value * d.probability) / 100, 0);
  const totalValue = openDeals.reduce((s, d) => s + d.value, 0);
  const wonDeals = deals.filter(d => d.stage === 'closed_won');
  const wonValue = wonDeals.reduce((s, d) => s + d.value, 0);

  const canSendToClient = (deal: DealWithContact) =>
    !deal.status || deal.status === 'draft' || deal.status === 'developer_reviewing';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {lang === 'es' ? 'Pipeline' : 'Deals Pipeline'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lang === 'es' ? 'Gestiona tus negocios y oportunidades.' : 'Manage your deals and opportunities.'}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          {lang === 'es' ? 'Nuevo deal' : 'New deal'}
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl p-5 bg-card border border-border">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            {lang === 'es' ? 'Pipeline ponderado' : 'Weighted Pipeline'}
          </p>
          <p className="text-2xl font-bold text-emerald-400">{fmtCurrency(weightedPipeline)}</p>
        </div>
        <div className="rounded-xl p-5 bg-card border border-border">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            {lang === 'es' ? 'Valor total abierto' : 'Total Open Value'}
          </p>
          <p className="text-2xl font-bold text-foreground">{fmtCurrency(totalValue)}</p>
        </div>
        <div className="rounded-xl p-5 bg-card border border-border">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            {lang === 'es' ? 'Cerrado ganado' : 'Closed Won'}
          </p>
          <p className="text-2xl font-bold text-neutral-400">{fmtCurrency(wonValue)}</p>
        </div>
      </div>

      {/* Search */}
      <Input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={lang === 'es' ? 'Buscar deals...' : 'Search deals...'}
        className="max-w-sm"
      />

      {/* Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSquares size={32} />
          </div>
        ) : deals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <TrendingUp className="w-10 h-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {lang === 'es' ? 'Sin deals. Crea el primero.' : 'No deals yet. Create the first one.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Título' : 'Title'}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Contacto' : 'Contact'}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Valor' : 'Value'}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Etapa' : 'Stage'}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Estado' : 'Status'}</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">%</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{lang === 'es' ? 'Cierre' : 'Close'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {deals.map(deal => (
                <tr key={deal.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{deal.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.contacts?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{fmtCurrency(deal.value)}</td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs border ${stageBadgeClass[deal.stage]}`}>
                      {stageLabel[deal.stage][lang]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {deal.status ? (
                      <Badge className={`text-xs border ${statusBadgeClass[deal.status] ?? ''} ${deal.status === 'client_revised' ? 'animate-pulse' : ''}`}>
                        {statusLabel[deal.status]?.[lang] ?? deal.status}
                      </Badge>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{deal.probability}%</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {deal.expected_close ? new Date(deal.expected_close).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5 justify-end flex-wrap">
                      {deal.forge_project_id && (
                        <button
                          onClick={() => navigate(`/studio/${deal.forge_project_id}`)}
                          className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded hover:bg-emerald-500/10"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {lang === 'es' ? 'Forge' : 'Forge'}
                        </button>
                      )}
                      {canSendToClient(deal) && (
                        <button
                          onClick={() => handleSendToClient(deal)}
                          disabled={actionLoading === deal.id + '-send'}
                          className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-300 transition-colors px-2 py-1 rounded hover:bg-neutral-500/10 disabled:opacity-50"
                        >
                          <Send className="w-3 h-3" />
                          {lang === 'es' ? 'Enviar' : 'Send'}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(deal, true)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                      >
                        <Edit2 className="w-3 h-3" />
                        {lang === 'es' ? 'Revisar' : 'Revise'}
                      </button>
                      <button
                        onClick={() => setHistoryDeal(deal)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                      >
                        <History className="w-3 h-3" />
                        {lang === 'es' ? 'Historia' : 'History'}
                      </button>
                      <button
                        onClick={() => openEdit(deal, false)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
                      >
                        {lang === 'es' ? 'Editar' : 'Edit'}
                      </button>
                      <button
                        onClick={() => handleDelete(deal.id)}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                      >
                        {lang === 'es' ? 'Eliminar' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={goToPage} />

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-foreground">
              {editingDeal ? (lang === 'es' ? 'Editar / Revisar deal' : 'Edit / Revise deal') : (lang === 'es' ? 'Nuevo deal' : 'New deal')}
            </h2>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Título' : 'Title'}</label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} disabled={isSubmitting} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Contacto' : 'Contact'}</label>
              <select value={formContactId} onChange={e => setFormContactId(e.target.value)} disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
                <option value="">{lang === 'es' ? 'Sin contacto' : 'No contact'}</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Asignar Cliente' : 'Assign Client'}</label>
              {selectedClient ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs px-3 py-1.5 rounded-full">
                    {selectedClient.full_name ?? selectedClient.email ?? selectedClient.id}
                    <button onClick={() => setSelectedClient(null)} className="hover:text-red-400 transition-colors" type="button">
                      <X size={12} />
                    </button>
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    value={clientEmailInput}
                    onChange={e => setClientEmailInput(e.target.value)}
                    disabled={isSubmitting}
                    placeholder={lang === 'es' ? 'Buscar por email o nombre...' : 'Search by email or name...'}
                  />
                  {clientSearchLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>
                  )}
                  {clientSearchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden">
                      {clientSearchResults.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setSelectedClient(r); setClientEmailInput(''); setClientSearchResults([]); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                        >
                          <span className="font-medium text-foreground">{r.full_name ?? '—'}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{r.email}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Colaboradores' : 'Collaborators'}</label>
              {pendingCollaborators.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {pendingCollaborators.map(c => (
                    <span key={c.id} className="inline-flex items-center gap-1.5 bg-accent border border-border text-foreground text-xs px-3 py-1.5 rounded-full">
                      {c.full_name ?? c.email ?? c.id}
                      <select
                        value={c.role}
                        onChange={e => setPendingCollaborators(prev => prev.map(p => p.id === c.id ? { ...p, role: e.target.value as 'read' | 'edit' } : p))}
                        className="bg-transparent text-xs focus:outline-none ml-1"
                      >
                        <option value="read">read</option>
                        <option value="edit">edit</option>
                      </select>
                      <button onClick={() => setPendingCollaborators(prev => prev.filter(p => p.id !== c.id))} type="button" className="hover:text-red-400 transition-colors">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Input
                  value={collabEmailInput}
                  onChange={e => setCollabEmailInput(e.target.value)}
                  disabled={isSubmitting}
                  placeholder={lang === 'es' ? 'Añadir colaborador por email...' : 'Add collaborator by email...'}
                />
                {collabSearchLoading && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">...</span>
                )}
                {collabSearchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-md shadow-lg overflow-hidden">
                    {collabSearchResults.map(r => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          if (!pendingCollaborators.some(c => c.id === r.id)) {
                            setPendingCollaborators(prev => [...prev, { ...r, role: 'read' }]);
                          }
                          setCollabEmailInput('');
                          setCollabSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <span className="font-medium text-foreground">{r.full_name ?? '—'}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{r.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Valor ($)' : 'Value ($)'}</label>
                <Input type="number" min="0" value={formValue} onChange={e => setFormValue(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Probabilidad (%)' : 'Probability (%)'}</label>
                <Input type="number" min="0" max="100" value={formProb} onChange={e => setFormProb(e.target.value)} disabled={isSubmitting} />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Etapa' : 'Stage'}</label>
              <select value={formStage} onChange={e => setFormStage(e.target.value as Deal['stage'])} disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50">
                {STAGES.map(s => <option key={s} value={s}>{stageLabel[s][lang]}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Cierre esperado' : 'Expected Close'}</label>
              <Input type="date" value={formClose} onChange={e => setFormClose(e.target.value)} disabled={isSubmitting} />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Descripción del Alcance' : 'Scope Description'}</label>
              <textarea
                value={formScope}
                onChange={e => setFormScope(e.target.value)}
                disabled={isSubmitting}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Timeline / Deadline' : 'Timeline / Deadline'}</label>
              <Input value={formTimeline} onChange={e => setFormTimeline(e.target.value)} disabled={isSubmitting} placeholder="e.g. 4 weeks" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground">{lang === 'es' ? 'Nota al cliente (para revisión)' : 'Note to client (for revision)'}</label>
              <textarea
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
                disabled={isSubmitting}
                rows={2}
                placeholder={lang === 'es' ? 'Añade una nota si estás enviando una revisión...' : 'Add a note if you are sending a revision...'}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
              />
              <p className="text-xs text-muted-foreground">{lang === 'es' ? 'Si incluyes una nota, se enviará como revisión al cliente.' : 'If a note is included, this will be sent as a revision to the client.'}</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={isSubmitting || !formTitle.trim() || !formValue} className="flex-1">
                {isSubmitting ? <LoadingSquares size={16} /> : lang === 'es' ? 'Guardar' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setShowModal(false)} disabled={isSubmitting} className="flex-1">
                {lang === 'es' ? 'Cancelar' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Deal History Side Panel */}
      {historyDeal && (
        <DealHistoryPanel deal={historyDeal} onClose={() => setHistoryDeal(null)} />
      )}
    </div>
  );
};

export default DealsPage;
