import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { getContacts, createContact, updateContact, deleteContact } from '@/services/data/supabaseData';
import { usePagination } from '@/hooks/usePagination';
import type { Contact } from '@/types';
import ContactDetailPanel from './ContactDetailPanel';
import ContactForm from './ContactForm';

const labels = {
  title: { en: 'Contacts', es: 'Contactos' },
  subtitle: { en: 'Manage your leads, clients, and partners.', es: 'Administra tus leads, clientes y socios.' },
  addContact: { en: 'Add contact', es: 'Agregar contacto' },
  search: { en: 'Search by name or email...', es: 'Buscar por nombre o correo...' },
  colName: { en: 'Name', es: 'Nombre' },
  colEmail: { en: 'Email', es: 'Correo' },
  colPhone: { en: 'Phone', es: 'Teléfono' },
  colType: { en: 'Type', es: 'Tipo' },
  colStatus: { en: 'Status', es: 'Estado' },
  colCreated: { en: 'Created', es: 'Creado' },
  emptyTitle: { en: 'No contacts found', es: 'Sin contactos' },
  emptySubtitle: { en: 'No contacts match your search.', es: 'Ningún contacto coincide con tu búsqueda.' },
};

const typeBadgeClass: Record<Contact['type'], string> = {
  lead: 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20',
  client: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20',
  partner: 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20',
};

const PAGE_SIZE = 20;

const StaffContacts = () => {
  const { lang } = useLanguage();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentPage, totalPages, goToPage } = usePagination(totalCount, PAGE_SIZE);

  const loadContacts = async (page: number, search: string) => {
    setIsLoading(true);
    const { data, count } = await getContacts(page, PAGE_SIZE, search);
    setContacts(data);
    setTotalCount(count);
    setIsLoading(false);
  };

  useEffect(() => {
    goToPage(1);
    loadContacts(1, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    loadContacts(currentPage, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handlePageChange = (n: number) => {
    goToPage(n);
  };

  const handleCreate = async (data: { name: string; email: string; phone: string; type: Contact['type']; status: string }) => {
    setIsSubmitting(true);
    const created = await createContact(data);
    if (created) {
      setShowAddModal(false);
      toast.success('Contacto creado');
      loadContacts(currentPage, searchQuery);
    } else {
      toast.error('Error al crear contacto');
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async (id: string, data: Partial<Contact>) => {
    const updated = await updateContact(id, data);
    if (updated) {
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      if (selectedContact?.id === id) setSelectedContact(updated);
      toast.success('Contacto actualizado');
    } else {
      toast.error('Error al actualizar contacto');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteContact(id);
    if (ok) {
      setSelectedContact(null);
      toast.success('Contacto eliminado');
      loadContacts(currentPage, searchQuery);
    } else {
      toast.error('Error al eliminar contacto');
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
          <UserPlus className="w-4 h-4" />
          {labels.addContact[lang]}
        </Button>
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
            <span className="w-6 h-6 border-2 border-muted border-t-muted-foreground rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={Users}
            title={labels.emptyTitle}
            subtitle={labels.emptySubtitle}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colName[lang]}</TableHead>
                <TableHead>{labels.colEmail[lang]}</TableHead>
                <TableHead>{labels.colPhone[lang]}</TableHead>
                <TableHead>{labels.colType[lang]}</TableHead>
                <TableHead>{labels.colStatus[lang]}</TableHead>
                <TableHead>{labels.colCreated[lang]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelectedContact(contact)}
                >
                  <TableCell className="font-medium text-foreground">{contact.name}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{contact.phone ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="default" className={typeBadgeClass[contact.type]}>
                      {contact.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground">
                      {contact.status ?? '—'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />

      {/* Add contact modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">
              {labels.addContact[lang]}
            </h2>
            <ContactForm
              onSubmit={handleCreate}
              onCancel={() => setShowAddModal(false)}
              isLoading={isSubmitting}
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Detail panel */}
      <ContactDetailPanel
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        lang={lang}
      />
    </div>
  );
};

export default StaffContacts;
