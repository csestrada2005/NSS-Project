import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, Clock, Receipt } from 'lucide-react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { getClientFinanceKPIs } from '@/services/data/supabaseData';
import { SupabaseService } from '@/services/SupabaseService';
import { toast } from 'sonner';
import type { Payment } from '@/types';

type PaymentWithProject = Payment & { projects: { title: string } | null; user_id?: string | null };

const labels = {
  title: { en: 'My Finances', es: 'Mis Finanzas' },
  subtitle: { en: 'View your billing history and payment status.', es: 'Consulta tu historial de facturación y estado de pagos.' },
  colInvoice: { en: 'Invoice #', es: 'Factura #' },
  colProject: { en: 'Project', es: 'Proyecto' },
  colAmount: { en: 'Amount', es: 'Monto' },
  colStatus: { en: 'Status', es: 'Estado' },
  colDueDate: { en: 'Due Date', es: 'Vencimiento' },
  colDescription: { en: 'Description', es: 'Descripción' },
  colActions: { en: 'Actions', es: 'Acciones' },
  kpiTotalBilled: { en: 'Total Billed', es: 'Total Facturado' },
  kpiPaid: { en: 'Paid', es: 'Pagado' },
  kpiPending: { en: 'Pending', es: 'Pendiente' },
  emptyTitle: { en: 'No payments yet', es: 'Sin pagos aún' },
  emptySubtitle: {
    en: 'No payment records found for your account.',
    es: 'No se encontraron registros de pago para tu cuenta.',
  },
  markAsPaid: { en: 'Mark as Paid', es: 'Marcar como Pagado' },
};

const statusBadgeClass: Record<Payment['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20',
  overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const ClientFinance = () => {
  const { lang } = useLanguage();
  const [payments, setPayments] = useState<PaymentWithProject[]>([]);
  const [kpis, setKpis] = useState({ totalBilled: 0, paid: 0, pending: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = SupabaseService.getInstance().client;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }

      const { data: projectData } = await supabase
        .from('projects')
        .select('id')
        .eq('client_profile_id', user.id);
      const projectIdsFromProjects = (projectData ?? []).map((p) => p.id);

      let query = supabase
        .from('payments')
        .select('*, projects(title)')
        .order('created_at', { ascending: false });

      if (projectIdsFromProjects.length > 0) {
        query = query.or(`recipient_profile_id.eq.${user.id},project_id.in.(${projectIdsFromProjects.join(',')})`);
      } else {
        query = query.eq('recipient_profile_id', user.id);
      }

      const { data: paymentData } = await query;

      const fetchedPayments = (paymentData ?? []) as PaymentWithProject[];
      setPayments(fetchedPayments);

      const projectIds = fetchedPayments
        .map((p) => p.project_id)
        .filter((id): id is string => !!id);
      const kpiData = await getClientFinanceKPIs(projectIds);
      setKpis(kpiData);
      setIsLoading(false);
    };
    load();
  }, []);

  const handleMarkAsPaid = async (payment: PaymentWithProject) => {
    const supabase = SupabaseService.getInstance().client;
    const { error } = await supabase
      .from('payments')
      .update({ status: 'paid' })
      .eq('id', payment.id);

    if (error) {
      toast.error('Failed to mark as paid');
      return;
    }

    setPayments((prev) =>
      prev.map((p) => (p.id === payment.id ? { ...p, status: 'paid' as Payment['status'] } : p))
    );

    // Notify sender
    if (payment.user_id) {
      const supabase = SupabaseService.getInstance().client;
      await supabase.from('notifications').insert({
        user_id: payment.user_id,
        type: 'invoice_paid',
        title: 'Invoice paid',
        body: `Your invoice of ${formatCurrency(payment.amount)} has been marked as paid.`,
        read: false,
      });

      // Fire-and-forget an email to the sender if possible
      const projectId = payment.project_id;
      if (projectId) {
        try {
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', payment.user_id)
            .maybeSingle();

          if (senderProfile?.email) {
            const { Authorization } = await SupabaseService.getInstance().getAuthHeader();
            fetch(`/api/email/${projectId}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization },
              body: JSON.stringify({
                to: senderProfile.email,
                templateName: 'invoice_paid',
                variables: {
                  amount: formatCurrency(payment.amount),
                  project: payment.projects?.title ?? '',
                  invoice_number: payment.invoice_number ?? '',
                },
              }),
            }).catch(() => {});
          }
        } catch {
          // Ignore
        }
      }
    }

    toast.success('Marked as paid');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{labels.title[lang]}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{labels.subtitle[lang]}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-3 sm:grid-cols-1">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiTotalBilled[lang]}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? '—' : formatCurrency(kpis.totalBilled)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {labels.kpiPaid[lang]}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isLoading ? '—' : formatCurrency(kpis.paid)}
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
              {isLoading ? '—' : formatCurrency(kpis.pending)}
            </div>
          </CardContent>
        </Card>
      </div>

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
                <TableHead>{labels.colActions[lang]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
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
                  <TableCell>
                    {payment.status === 'pending' && (
                      <button
                        onClick={() => handleMarkAsPaid(payment)}
                        className="px-2 py-1 text-xs font-medium rounded-md bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors"
                      >
                        {labels.markAsPaid[lang]}
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default ClientFinance;
