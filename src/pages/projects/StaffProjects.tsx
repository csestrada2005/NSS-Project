import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { FolderPlus, Folders } from 'lucide-react';
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
import {
  getProjects,
  getContactsForDropdown,
  createProject,
  updateProject,
  deleteProject,
} from '@/services/data/supabaseData';
import { usePagination } from '@/hooks/usePagination';
import type { Project } from '@/types';
import ProjectDetailPanel from './ProjectDetailPanel';
import ProjectForm from './ProjectForm';

type ProjectWithClient = Project & { contacts: { name: string } | null };

const labels = {
  title: { en: 'Projects', es: 'Proyectos' },
  subtitle: { en: 'Manage and track your projects.', es: 'Administra y da seguimiento a tus proyectos.' },
  addProject: { en: 'Add project', es: 'Agregar proyecto' },
  search: { en: 'Search by title or client...', es: 'Buscar por título o cliente...' },
  colTitle: { en: 'Title', es: 'Título' },
  colClient: { en: 'Client', es: 'Cliente' },
  colStatus: { en: 'Status', es: 'Estado' },
  colDescription: { en: 'Description', es: 'Descripción' },
  colCreated: { en: 'Created', es: 'Creado' },
  emptyTitle: { en: 'No projects found', es: 'Sin proyectos' },
  emptySubtitle: { en: 'No projects match your search.', es: 'Ningún proyecto coincide con tu búsqueda.' },
};

const statusBadgeClass: Record<Project['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20',
  cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/20 hover:bg-rose-500/20',
};

const PAGE_SIZE = 20;

const StaffProjects = () => {
  const { lang } = useLanguage();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectWithClient | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { currentPage, totalPages, goToPage } = usePagination(totalCount, PAGE_SIZE);

  const loadProjects = async (page: number, search: string) => {
    setIsLoading(true);
    const { data, count } = await getProjects(page, PAGE_SIZE, search);
    setProjects(data);
    setTotalCount(count);
    setIsLoading(false);
  };

  useEffect(() => {
    getContactsForDropdown().then(setContacts);
  }, []);

  useEffect(() => {
    goToPage(1);
    loadProjects(1, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    loadProjects(currentPage, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const handlePageChange = (n: number) => {
    goToPage(n);
  };

  const handleCreate = async (data: {
    title: string;
    description: string;
    status: Project['status'];
    client_id: string | null;
  }) => {
    setIsSubmitting(true);
    const created = await createProject(data);
    if (created) {
      setShowAddModal(false);
      toast.success('Proyecto creado');
      loadProjects(currentPage, searchQuery);
    } else {
      toast.error('Error al crear proyecto');
    }
    setIsSubmitting(false);
  };

  const handleUpdate = async (id: string, data: Partial<Project> & { client_id?: string | null }) => {
    const updated = await updateProject(id, data);
    if (updated) {
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (selectedProject?.id === id) setSelectedProject(updated);
      toast.success('Proyecto actualizado');
    } else {
      toast.error('Error al actualizar proyecto');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteProject(id);
    if (ok) {
      setSelectedProject(null);
      toast.success('Proyecto eliminado');
      loadProjects(currentPage, searchQuery);
    } else {
      toast.error('Error al eliminar proyecto');
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
          <FolderPlus className="w-4 h-4" />
          {labels.addProject[lang]}
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
        ) : projects.length === 0 ? (
          <EmptyState
            icon={Folders}
            title={labels.emptyTitle}
            subtitle={labels.emptySubtitle}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.colTitle[lang]}</TableHead>
                <TableHead>{labels.colClient[lang]}</TableHead>
                <TableHead>{labels.colStatus[lang]}</TableHead>
                <TableHead>{labels.colDescription[lang]}</TableHead>
                <TableHead>{labels.colCreated[lang]}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow
                  key={project.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelectedProject(project)}
                >
                  <TableCell className="font-medium text-foreground">{project.title}</TableCell>
                  <TableCell className="text-muted-foreground">{project.contacts?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="default" className={statusBadgeClass[project.status]}>
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px]">
                    {project.description
                      ? project.description.length > 60
                        ? project.description.slice(0, 60) + '…'
                        : project.description
                      : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(project.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />

      {/* Add project modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-base font-semibold text-foreground mb-4">
              {labels.addProject[lang]}
            </h2>
            <ProjectForm
              contacts={contacts}
              onSubmit={handleCreate}
              onCancel={() => setShowAddModal(false)}
              isLoading={isSubmitting}
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Detail panel */}
      <ProjectDetailPanel
        project={selectedProject}
        contacts={contacts}
        onClose={() => setSelectedProject(null)}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        lang={lang}
      />
    </div>
  );
};

export default StaffProjects;
