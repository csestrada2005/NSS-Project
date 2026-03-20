import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/types';
import ContactForm from './ContactForm';

interface ContactDetailPanelProps {
  contact: Contact | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Contact>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  lang: 'en' | 'es';
}

const labels = {
  name: { en: 'Name', es: 'Nombre' },
  email: { en: 'Email', es: 'Correo' },
  phone: { en: 'Phone', es: 'Teléfono' },
  type: { en: 'Type', es: 'Tipo' },
  status: { en: 'Status', es: 'Estado' },
  created: { en: 'Created', es: 'Creado' },
  edit: { en: 'Edit', es: 'Editar' },
  delete: { en: 'Delete', es: 'Eliminar' },
  confirmDelete: { en: 'Are you sure you want to delete this contact?', es: '¿Estás seguro de que deseas eliminar este contacto?' },
  confirm: { en: 'Confirm', es: 'Confirmar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  na: { en: '—', es: '—' },
};

const typeBadgeClass: Record<Contact['type'], string> = {
  lead: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  client: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  partner: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const ContactDetailPanel = ({ contact, onClose, onUpdate, onDelete, lang }: ContactDetailPanelProps) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [isLoading, setIsLoading] = useState(false);

  const isOpen = contact !== null;

  const handleEdit = async (data: { name: string; email: string; phone: string; type: Contact['type']; status: string }) => {
    if (!contact) return;
    setIsLoading(true);
    try {
      await onUpdate(contact.id, data);
      setMode('view');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!contact) return;
    setIsLoading(true);
    try {
      await onDelete(contact.id);
      onClose();
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
        {contact && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground truncate pr-2">{contact.name}</h2>
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
                    <p className="text-xs text-muted-foreground mb-1">{labels.name[lang]}</p>
                    <p className="text-sm text-foreground font-medium">{contact.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.email[lang]}</p>
                    <p className="text-sm text-foreground">{contact.email ?? labels.na[lang]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.phone[lang]}</p>
                    <p className="text-sm text-foreground">{contact.phone ?? labels.na[lang]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{labels.type[lang]}</p>
                    <Badge variant="default" className={typeBadgeClass[contact.type]}>
                      {contact.type}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{labels.status[lang]}</p>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {contact.status ?? labels.na[lang]}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.created[lang]}</p>
                    <p className="text-sm text-foreground">
                      {new Date(contact.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {mode === 'edit' && (
                <ContactForm
                  initialData={contact}
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

export default ContactDetailPanel;
