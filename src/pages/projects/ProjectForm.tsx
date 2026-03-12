import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Project } from '@/types';

interface ProjectFormProps {
  initialData?: Partial<Project & { client_id?: string | null }>;
  contacts: { id: string; name: string }[];
  onSubmit: (data: {
    title: string;
    description: string;
    status: Project['status'];
    client_id: string | null;
  }) => void;
  onCancel: () => void;
  isLoading?: boolean;
  lang: 'en' | 'es';
}

const labels = {
  title: { en: 'Title', es: 'Título' },
  description: { en: 'Description', es: 'Descripción' },
  status: { en: 'Status', es: 'Estado' },
  client: { en: 'Client', es: 'Cliente' },
  noClient: { en: 'No client', es: 'Sin cliente' },
  submit: { en: 'Save', es: 'Guardar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  titleRequired: { en: 'Title is required', es: 'El título es obligatorio' },
  statusActive: { en: 'Active', es: 'Activo' },
  statusCompleted: { en: 'Completed', es: 'Completado' },
  statusPaused: { en: 'Paused', es: 'Pausado' },
  statusCancelled: { en: 'Cancelled', es: 'Cancelado' },
};

const ProjectForm = ({ initialData, contacts, onSubmit, onCancel, isLoading, lang }: ProjectFormProps) => {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [status, setStatus] = useState<Project['status']>(initialData?.status ?? 'active');
  const [clientId, setClientId] = useState<string>(initialData?.client_id ?? '');
  const [titleError, setTitleError] = useState(false);

  const handleSubmit = () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setTitleError(false);
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      client_id: clientId || null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.title[lang]}</label>
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setTitleError(false); }}
          placeholder={labels.title[lang]}
          className={titleError ? 'border-rose-500' : ''}
          disabled={isLoading}
        />
        {titleError && (
          <p className="text-xs text-rose-500">{labels.titleRequired[lang]}</p>
        )}
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
        <label className="text-sm font-medium text-foreground">{labels.status[lang]}</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Project['status'])}
          disabled={isLoading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="active">{labels.statusActive[lang]}</option>
          <option value="completed">{labels.statusCompleted[lang]}</option>
          <option value="paused">{labels.statusPaused[lang]}</option>
          <option value="cancelled">{labels.statusCancelled[lang]}</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-foreground">{labels.client[lang]}</label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          disabled={isLoading}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="">{labels.noClient[lang]}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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

export default ProjectForm;
