import { useState, useEffect } from 'react';
import { Folders } from 'lucide-react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { getProjectsForClient } from '@/services/data/supabaseData';
import type { Project } from '@/types';

type ProjectWithClient = Project & { contacts: { name: string } | null };

const labels = {
  title: { en: 'My Projects', es: 'Mis Proyectos' },
  subtitle: { en: 'View your active and past projects.', es: 'Consulta tus proyectos activos y pasados.' },
  colTitle: { en: 'Title', es: 'Título' },
  colClient: { en: 'Client', es: 'Cliente' },
  colStatus: { en: 'Status', es: 'Estado' },
  colDescription: { en: 'Description', es: 'Descripción' },
  colCreated: { en: 'Created', es: 'Creado' },
  emptyTitle: { en: 'No projects yet', es: 'Sin proyectos aún' },
  emptySubtitle: { en: 'You have no projects assigned to you.', es: 'No tienes proyectos asignados.' },
};

const statusBadgeClass: Record<Project['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const ClientProjects = () => {
  const { lang } = useLanguage();
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProjectsForClient().then((data) => {
      setProjects(data);
      setIsLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{labels.title[lang]}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{labels.subtitle[lang]}</p>
      </div>

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
                <TableRow key={project.id}>
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
    </div>
  );
};

export default ClientProjects;
