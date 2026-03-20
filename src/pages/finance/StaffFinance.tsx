import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { DollarSign, TrendingUp, Clock, AlertCircle, Receipt } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getPayments,
  getProjectsForPaymentDropdown,
  getStaffFinanceKPIs,
  createPayment,
  updatePayment,
  deletePayment,
} from '@/services/data/supabaseData';
import { usePagination } from '@/hooks/usePagination';
import type { Payment } from '@/types';
import PaymentDetailPanel from './PaymentDetailPanel';
import PaymentForm from './PaymentForm';

type PaymentWithProject = Payment & { projects: { title: string } | null; user_id?: string | null };

const labels = {
  title: { en: 'Finance', es: 'Finanzas' },
  subtitle: { en: 'Manage payments and track revenue.', es: 'Gestiona pagos y rastrea ingresos.' },
  addPayment: { en: 'Add payment', es: 'Agregar pago' },
  search: { en: 'Search by invoice, project, or description...', es: 'Buscar por factura, proyecto o descripción...' },
  colInvoice: { en: 'Invoice #', es: 'Factura #' },
  colProject: { en: 'Project', es: 'Proyecto' },
  colAmount: { en: 'Amount', es: 'Monto' },
  colStatus: { en: 'Status', es: 'Estado' },
  colDueDate: { en: 'Due Date', es: 'Vencimiento' },
  colDescription: { en: 'Description', es: 'Descripción' },
  kpiTotalCollected: { en: 'Total Collected', es: 'Total Cobrado' },
  kpiMonthlyRevenue: { en: 'Monthly Revenue', es: 'Ingresos del Mes' },
  kpiPending: { en: 'Pending', es: 'Pendiente' },
  kpiOverdue: { en: 'Overdue', es: 'Vencido' },
  emptyTitle: { en: 'No payments found', es: 'Sin pagos' },
  emptySubtitle: { en: 'No payments match your search.', es: 'Ningún pago coincide con tu búsqueda.' },
};

const statusBadgeClass: Record<Payment['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20',
  overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const PAGE_SIZE = 20;

const StaffFinance = () => {
  const { lang } = useLanguage();
  const [payments, setPayments] = useState<PaymentWithProject[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [kpis, setKpis] = useState({ totalCollected: 0, pending: 0, overdue: 0, monthlyRevenue: 0 });
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithProject | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kpisLoading, setKpisLoading] = useState(true);

  const { currentPage, totalPages, goToPage } = usePagination(totalCount, PAGE_SIZE);

  const refreshKpis = async () => {
    const data = await getStaffFinanceKPIs();
    setKpis(data);
  };

  const loadPayments = async (page: number, search: string) => {
    setIsLoading(true);
    const { data, count } = await getPayments(page, PAGE_SIZE, search);
    setPayments(data);
    setTotalCount(count);
    setIsLoading(false);
  };

  useEffect(() => {
    Promise.all([
      getProjectsForPaymentDropdown(),
      getStaffFinanceKPIs(),
    ]).then(([projectData, kpiData]) => {
      setProjects(projectData);
      setKpis(kpiData);
      setKpisLoading(false);
    });
    loadPayments(1, '');
  }, []);

  useEffect(() => {
    goToPage(1);
    loadPayments(1, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    loadPayments(currentPage, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handlePageChange = (n: number) => {
    goToPage(n);
  };

  const sendInvoiceNotifications = async (
    payment: PaymentWithProject,
    recipient: { id: string; full_name: string | null },
    clientEmail: string
  ) => {
    const supabase = SupabaseService.getInstance().client;
    // In-app notification to recipient
    await supabase.from('notifications').insert({
      user_id: recipient.id,
      type: 'invoice_sent',
      title: 'New invoice received',
      body: `You have a new invoice for ${formatCurrency(payment.amount)}${payment.projects?.title ? ` on project "${payment.projects.title}"` : ''}.`,
      read: false,
    });
    // In-app notification to sender (confirmation)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'invoice_sent',
        title: 'Invoice sent',
        body: `Invoice of ${formatCurrency(payment.amount)} sent to ${recipient.full_name ?? 'client'}.`,
        read: false,
      });
    }
    // Email (fire-and-forget)
    if (payment.project_id) {
      try {
        const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
        await fetch(`/api/email/${payment.project_id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization },
          body: JSON.stringify({
            to: clientEmail,
            templateName: 'invoice',
            variables: {
              amount: formatCurrency(payment.amount),
              project: payment.projects?.title ?? '',
              invoice_number: payment.invoice_number ?? '',
              due_date: payment.due_date ?? '',
            },
          }),
        });
      } catch { /* ignore — email is best-effort */ }
    }
  };

  const handleCreate = async (data: {
    invoice_number: string;
    description: string;
    amount: number;
    status: Payment['status'];
    due_date: string;
    project_id: string | null;
    clientEmail: string;
  }) => {
    setIsSubmitting(true);
    const supabase = SupabaseService.getInstance().client;
    const { data: recipientProfile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('email', data.clientEmail)
      .maybeSingle();

    if (!recipientProfile) {
      toast.error("This client hasn't registered in Nebu yet. Contact the client.");
      setIsSubmitting(false);
      return;
    }

    const created = await createPayment({
      invoice_number: data.invoice_number,
      description: data.description,
      amount: data.amount,
      status: data.status,
      due_date: data.due_date,
      project_id: data.project_id,
      recipient_profile_id: recipientProfile.id,
    });
    if (created) {
      setShowAddModal(false);
      await refreshKpis();
      toast.success('Pago creado');
      loadPayments(currentPage, searchQuery);
      await sendInvoiceNotifications(created, recipientProfile, data.clientEmail);
    } else {
      toast.error('Error al crear pago');
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async (
    id: string,
    data: Partial<Payment> & { project_id?: string | null }
  ) => {
    const updated = await updatePayment(id, data);
    if (updated) {
      setPayments((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPayment?.id === id) setSelectedPayment(updated);
      await refreshKpis();
      toast.success('Pago actualizado');
    } else {
      toast.error('Error al actualizar pago');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deletePayment(id);
    if (ok) {
      setSelectedPayment(null);
      await refreshKpis();
      toast.success('Pago eliminado');
      loadPayments(currentPage, searchQuery);
    } else {
      toast.error('Error al eliminar pago');
    }
  };

  const handleMarkPaid = async (id: string) => {
    const updated = await updatePayment(id, { status: 'paid' });
    if (updated) {
      setPayments((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedPayment?.id === id) setSelectedPayment(updated);
      await refreshKpis();
      toast.success('Pago marcado como pagado');
    } else {
      toast.error('Error al marcar como pagado');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{labels.title[lang]}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{labels.subtitle[lang]}</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2 shrink-0">
          <Receipt className="w-4 h-4" />
          {labels.addPayment[lang]}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiTotalCollected[lang]}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {kpisLoading ? '—' : formatCurrency(kpis.totalCollected)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiMonthlyRevenue[lang]}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {kpisLoading ? '—' : formatCurrency(kpis.monthlyRevenue)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiPending[lang]}
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {kpisLoading ? '—' : formatCurrency(kpis.pending)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiOverdue[lang]}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {kpisLoading ? '—' : formatCurrency(kpis.overdue)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={labels.search[lang]}
        className="max-w-sm"
      />

      {/* Table */}
      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={labels.emptyTitle}
            subtitle={labels.emptySubtitle}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colInvoice[lang]}</TableHead>
                <TableHead>{labels.colProject[lang]}</TableHead>
                <TableHead>{labels.colAmount[lang]}</TableHead>
                <TableHead>{labels.colStatus[lang]}</TableHead>
                <TableHead>{labels.colDueDate[lang]}</TableHead>
                <TableHead>{labels.colDescription[lang]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow
                  key={payment.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelectedPayment(payment)}
                >
                  <TableCell className="font-medium text-foreground">
                    {payment.invoice_number ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {payment.projects?.title ?? '—'}
                  </TableCell>
                  <TableCell className="font-semibold text-foreground">
                    {formatCurrency(payment.amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="default" className={statusBadgeClass[payment.status]}>
                      {payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {payment.due_date
                      ? new Date(payment.due_date).toLocaleDateString()
                      : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px]">
                    {payment.description
                      ? payment.description.length > 50
                        ? payment.description.slice(0, 50) + '…'
                        : payment.description
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />

      {/* Add payment modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">
              {labels.addPayment[lang]}
            </h2>
            <PaymentForm
              projects={projects}
              onSubmit={handleCreate}
              onCancel={() => setShowAddModal(false)}
              isLoading={isSubmitting}
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Detail panel */}
      <PaymentDetailPanel
        payment={selectedPayment}
        projects={projects}
        onClose={() => setSelectedPayment(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onMarkPaid={handleMarkPaid}
        lang={lang}
      />
    </div>
  );
};

export default StaffFinance;
