import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Project } from '@/types';
import ProjectForm from './ProjectForm';

type ProjectWithClient = Project & { contacts: { name: string } | null };

interface ProjectDetailPanelProps {
  project: ProjectWithClient | null;
  contacts: { id: string; name: string }[];
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Project> & { client_id?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  lang: 'en' | 'es';
}

const labels = {
  title: { en: 'Title', es: 'Título' },
  client: { en: 'Client', es: 'Cliente' },
  status: { en: 'Status', es: 'Estado' },
  description: { en: 'Description', es: 'Descripción' },
  created: { en: 'Created', es: 'Creado' },
  edit: { en: 'Edit', es: 'Editar' },
  delete: { en: 'Delete', es: 'Eliminar' },
  confirmDelete: { en: 'Are you sure you want to delete this project?', es: '¿Estás seguro de que deseas eliminar este proyecto?' },
  confirm: { en: 'Confirm', es: 'Confirmar' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  na: { en: '—', es: '—' },
};

const statusBadgeClass: Record<Project['status'], string> = {
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  completed: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  paused: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  cancelled: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
};

const ProjectDetailPanel = ({ project, contacts, onClose, onUpdate, onDelete, lang }: ProjectDetailPanelProps) => {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [isLoading, setIsLoading] = useState(false);

  const isOpen = project !== null;

  const handleEdit = async (data: {
    title: string;
    description: string;
    status: Project['status'];
    client_id: string | null;
  }) => {
    if (!project) return;
    setIsLoading(true);
    try {
      await onUpdate(project.id, data);
      setMode('view');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setIsLoading(true);
    try {
      await onDelete(project.id);
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
        {project && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground truncate pr-2">{project.title}</h2>
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
                    <p className="text-xs text-muted-foreground mb-1">{labels.title[lang]}</p>
                    <p className="text-sm text-foreground font-medium">{project.title}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.client[lang]}</p>
                    <p className="text-sm text-foreground">{project.contacts?.name ?? labels.na[lang]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{labels.status[lang]}</p>
                    <Badge variant="default" className={statusBadgeClass[project.status]}>
                      {project.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.description[lang]}</p>
                    <p className="text-sm text-foreground">{project.description ?? labels.na[lang]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{labels.created[lang]}</p>
                    <p className="text-sm text-foreground">
                      {new Date(project.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              {mode === 'edit' && (
                <ProjectForm
                  initialData={{ ...project, client_id: project.client_profile_id }}
                  contacts={contacts}
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

export default ProjectDetailPanel;
