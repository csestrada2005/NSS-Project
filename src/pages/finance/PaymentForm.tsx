import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Payment } from '@/types';

interface PaymentFormProps {
  initialData?: Partial<Payment & { project_id?: string | null }>;
  projects: { id: string; title: string }[];
  onSubmit: (data: {
    invoice_number: string;
    description: string;
    amount: number;
    status: Payment['status'];
    due_date: string;
    project_id: string | null;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  lang: 'en' | 'es';
}

const labels = {
  invoiceNumber: { en: 'Invoice Number', es: 'Número de Factura' },
  description: { en: 'Description', es: 'Descripción' },
  amount: { en: 'Amount', es: 'Monto' },
  amountRequired: { en: 'Amount must be greater than 0', es: 'El monto debe ser mayor que 0' },
  status: { en: 'Status', es: 'Estado' },
  statusPending: { en: 'Pending', es: 'Pendiente' },
  statusPaid: { en: 'Paid', es: 'Pagado' },
  statusOverdue: { en: 'Overdue', es: 'Vencido' },
  dueDate: { en: 'Due Date', es: 'Fecha de Vencimiento' },
  project: { en: 'Project', es: 'Proyecto' },
  noProject: { en: 'No project', es: 'Sin proyecto' },
  submit: { en: 'Save', es: 'Guardar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
};

const PaymentForm = ({
  initialData,
  projects,
  onSubmit,
  onCancel,
  isLoading,
  lang,
}: PaymentFormProps) => {
  const [invoiceNumber, setInvoiceNumber] = useState(initialData?.invoice_number ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [amount, setAmount] = useState<string>(
    initialData?.amount !== undefined ? String(initialData.amount) : ''
  );
  const [status, setStatus] = useState<Payment['status']>(initialData?.status ?? 'pending');
  const [dueDate, setDueDate] = useState(initialData?.due_date ?? '');
  const [projectId, setProjectId] = useState<string>(initialData?.project_id ?? '');
  const [amountError, setAmountError] = useState(false);

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setAmountError(true);
      return;
    }
    setAmountError(false);
    onSubmit({
      invoice_number: invoiceNumber.trim(),
      description: description.trim(),
      amount: parsedAmount,
      status,
      due_date: dueDate,
      project_id: projectId || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.invoiceNumber[lang]}</label>
        <Input
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
          placeholder={labels.invoiceNumber[lang]}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.description[lang]}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={labels.description[lang]}
          disabled={isLoading}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.amount[lang]}</label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setAmountError(false); }}
          placeholder="0.00"
          disabled={isLoading}
          className={amountError ? 'border-rose-500' : ''}
        />
        {amountError && (
          <p className="text-xs text-rose-500">{labels.amountRequired[lang]}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.status[lang]}</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Payment['status'])}
          disabled={isLoading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="pending">{labels.statusPending[lang]}</option>
          <option value="paid">{labels.statusPaid[lang]}</option>
          <option value="overdue">{labels.statusOverdue[lang]}</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.dueDate[lang]}</label>
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.project[lang]}</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="">{labels.noProject[lang]}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={isLoading} className="flex-1">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              {labels.submit[lang]}
            </span>
          ) : labels.submit[lang]}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isLoading} className="flex-1">
          {labels.cancel[lang]}
        </Button>
      </div>
    </div>
  );
};

export default PaymentForm;
