import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Contact } from '@/types';
import LoadingSquares from '../../components/brand/LoadingSquares';

interface ContactFormProps {
  initialData?: Partial<Contact>;
  onSubmit: (data: {
    name: string;
    email: string;
    phone: string;
    type: Contact['type'];
    status: string;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  lang: 'en' | 'es';
}

const labels = {
  name: { en: 'Name', es: 'Nombre' },
  email: { en: 'Email', es: 'Correo' },
  phone: { en: 'Phone', es: 'Teléfono' },
  type: { en: 'Type', es: 'Tipo' },
  status: { en: 'Status', es: 'Estado' },
  submit: { en: 'Save', es: 'Guardar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  nameRequired: { en: 'Name is required', es: 'El nombre es obligatorio' },
};

const ContactForm = ({ initialData, onSubmit, onCancel, isLoading, lang }: ContactFormProps) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [email, setEmail] = useState(initialData?.email ?? '');
  const [phone, setPhone] = useState(initialData?.phone ?? '');
  const [type, setType] = useState<Contact['type']>(initialData?.type ?? 'lead');
  const [status, setStatus] = useState(initialData?.status ?? 'new');
  const [nameError, setNameError] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    onSubmit({ name: name.trim(), email, phone, type, status });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.name[lang]}</label>
        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setNameError(false); }}
          placeholder={labels.name[lang]}
          className={nameError ? 'border-red-500' : ''}
          disabled={isLoading}
        />
        {nameError && (
          <p className="text-xs text-red-500">{labels.nameRequired[lang]}</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.email[lang]}</label>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={labels.email[lang]}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.phone[lang]}</label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={labels.phone[lang]}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.type[lang]}</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as Contact['type'])}
          disabled={isLoading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="lead">Lead</option>
          <option value="client">Client</option>
          <option value="partner">Partner</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.status[lang]}</label>
        <Input
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder={labels.status[lang]}
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleSubmit} disabled={isLoading} className="flex-1">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <LoadingSquares size={16} />
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

export default ContactForm;
