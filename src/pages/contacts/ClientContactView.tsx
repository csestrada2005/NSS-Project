import { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyContactRecord } from '@/services/data/supabaseData';
import type { Contact } from '@/types';
import LoadingSquares from '../../components/brand/LoadingSquares';

const labels = {
  title: { en: 'My Contact Record', es: 'Mi Registro de Contacto' },
  name: { en: 'Name', es: 'Nombre' },
  email: { en: 'Email', es: 'Correo' },
  phone: { en: 'Phone', es: 'Teléfono' },
  type: { en: 'Type', es: 'Tipo' },
  status: { en: 'Status', es: 'Estado' },
  created: { en: 'Member since', es: 'Miembro desde' },
  emptyTitle: { en: 'No contact record found', es: 'No se encontró un registro de contacto' },
  emptySubtitle: {
    en: 'Your contact record has not been set up yet. Please contact your account manager.',
    es: 'Tu registro de contacto aún no ha sido configurado. Por favor contacta a tu gestor de cuenta.',
  },
};

const typeBadgeClass: Record<Contact['type'], string> = {
  lead: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  client: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  partner: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

const ClientContactView = () => {
  const { user } = useAuth();
  const { lang } = useLanguage();
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const email = user?.email;
    if (!email) {
      setIsLoading(false);
      return;
    }
    getMyContactRecord(email).then((data) => {
      setContact(data);
      setIsLoading(false);
    });
  }, [user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSquares size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{labels.title[lang]}</h1>
      </div>

      {contact ? (
        <div className="rounded-xl bg-card border border-border p-6 max-w-lg space-y-5">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{labels.name[lang]}</p>
            <p className="text-sm font-medium text-foreground">{contact.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{labels.email[lang]}</p>
            <p className="text-sm text-foreground">{contact.email ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{labels.phone[lang]}</p>
            <p className="text-sm text-foreground">{contact.phone ?? '—'}</p>
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
              {contact.status ?? '—'}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{labels.created[lang]}</p>
            <p className="text-sm text-foreground">
              {new Date(contact.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-card border border-border">
          <EmptyState
            icon={User}
            title={labels.emptyTitle}
            subtitle={labels.emptySubtitle}
          />
        </div>
      )}
    </div>
  );
};

export default ClientContactView;
