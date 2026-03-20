import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Folders } from 'lucide-react';
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
  updateProject,
  deleteProject,
} from '@/services/data/supabaseData';
import { usePagination } from '@/hooks/usePagination';
import type { Project } from '@/types';
import ProjectDetailPanel from './ProjectDetailPanel';

type ProjectWithClient = Project & { contacts: { name: string } | null };

const labels = {
  title: { en: 'Projects', es: 'Proyectos' },
  subtitle: { en: 'Manage and track your projects.', es: 'Administra y da seguimiento a tus proyectos.' },
  forgeNote: {
    en: 'Projects are created through Wyrd Forge and appear here automatically.',
    es: 'Los proyectos se crean desde Wyrd Forge y aparecen aquí automáticamente.',
  },
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
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectWithClient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{labels.title[lang]}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{labels.subtitle[lang]}</p>
        <p className="text-xs text-muted-foreground mt-1 italic">{labels.forgeNote[lang]}</p>
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
        ) : projects.length === 0 ? (
          searchQuery === '' ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
                <Folders size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No projects yet</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Projects are created through Wyrd Forge. Head there to start building.
              </p>
              <button
                onClick={() => navigate('/forge')}
                className="mt-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                Open Wyrd Forge
              </button>
            </div>
          ) : (
          <EmptyState
            icon={Folders}
            title={labels.emptyTitle}
            subtitle={labels.emptySubtitle}
          />
          )
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
