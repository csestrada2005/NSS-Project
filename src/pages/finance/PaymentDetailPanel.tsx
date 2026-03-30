import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Payment } from '@/types';
import PaymentForm from './PaymentForm';

type PaymentWithProject = Payment & { projects: { title: string } | null };

interface PaymentDetailPanelProps {
  payment: PaymentWithProject | null;
  projects: { id: string; title: string }[];
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Payment> & { project_id?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMarkPaid: (id: string) => Promise<void>;
  lang: 'en' | 'es';
}

const labels = {
  invoiceNumber: { en: 'Invoice Number', es: 'Número de Factura' },
  project: { en: 'Project', es: 'Proyecto' },
  amount: { en: 'Amount', es: 'Monto' },
  status: { en: 'Status', es: 'Estado' },
  dueDate: { en: 'Due Date', es: 'Fecha de Vencimiento' },
  description: { en: 'Description', es: 'Descripción' },
  created: { en: 'Created', es: 'Creado' },
  markPaid: { en: 'Mark as paid', es: 'Marcar como pagado' },
  edit: { en: 'Edit', es: 'Editar' },
  delete: { en: 'Delete', es: 'Eliminar' },
  confirmDelete: {
    en: 'Are you sure you want to delete this payment?',
    es: '¿Estás seguro de que deseas eliminar este pago?',
  },
  confirm: { en: 'Confirm', es: 'Confirmar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  na: { en: '—', es: '—' },
};

const statusBadgeClass: Record<Payment['status'], string> = {
  paid: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  overdue: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const PaymentDetailPanel = ({
  payment,
  projects,
  onClose,
  onUpdate,
  onDelete,
  onMarkPaid,
  lang,
}: PaymentDetailPanelProps) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [isLoading, setIsLoading] = useState(false);

  const isOpen = payment !== null;

  const handleEdit = async (data: {
    invoice_number: string;
    description: string;
    amount: number;
    status: Payment['status'];
    due_date: string;
    project_id: string | null;
    clientEmail: string;
  }) => {
    if (!payment) return;
    setIsLoading(true);
    try {
      await onUpdate(payment.id, data);
      setMode('view');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!payment) return;
    setIsLoading(true);
    try {
      await onDelete(payment.id);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!payment) return;
    setIsLoading(true);
    try {
      await onMarkPaid(payment.id);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-30"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-card border-l border-border shadow-2xl z-40 flex flex-col transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {payment && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground truncate pr-2">
                {payment.invoice_number ?? formatCurrency(payment.amount)}
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {mode === 'view' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.invoiceNumber[lang]}</p>
                    <p className="text-sm text-foreground font-medium">
                      {payment.invoice_number ?? labels.na[lang]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.project[lang]}</p>
                    <p className="text-sm text-foreground">
                      {payment.projects?.title ?? labels.na[lang]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.amount[lang]}</p>
                    <p className="text-sm text-foreground font-semibold">
                      {formatCurrency(payment.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{labels.status[lang]}</p>
                    <Badge variant="default" className={statusBadgeClass[payment.status]}>
                      {payment.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.dueDate[lang]}</p>
                    <p className="text-sm text-foreground">
                      {payment.due_date
                        ? new Date(payment.due_date).toLocaleDateString()
                        : labels.na[lang]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.description[lang]}</p>
                    <p className="text-sm text-foreground">
                      {payment.description ?? labels.na[lang]}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.created[lang]}</p>
                    <p className="text-sm text-foreground">
                      {new Date(payment.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  {payment.status !== 'paid' && (
                    <Button
                      onClick={handleMarkPaid}
                      disabled={isLoading}
                      className="w-full mt-2"
                    >
                      {isLoading ? (
                        <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      ) : labels.markPaid[lang]}
                    </Button>
                  )}
                </div>
              )}

              {mode === 'edit' && (
                <PaymentForm
                  initialData={{ ...payment, project_id: payment.project_id }}
                  projects={projects}
                  onSubmit={handleEdit}
                  onCancel={() => setMode('view')}
                  isLoading={isLoading}
                  lang={lang}
                />
              )}

              {mode === 'delete' && (
                <div className="space-y-4">
                  <p className="text-sm text-foreground">{labels.confirmDelete[lang]}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isLoading}
                      className="flex-1"
                    >
                      {isLoading ? (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : labels.confirm[lang]}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setMode('view')}
                      disabled={isLoading}
                      className="flex-1"
                    >
                      {labels.cancel[lang]}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions (view mode only) */}
            {mode === 'view' && (
              <div className="px-5 py-4 border-t border-border flex gap-2">
                <Button variant="outline" onClick={() => setMode('edit')} className="flex-1">
                  {labels.edit[lang]}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMode('delete')}
                  className="flex-1 text-rose-500 border-rose-500/30 hover:bg-rose-500/10"
                >
                  {labels.delete[lang]}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default PaymentDetailPanel;
