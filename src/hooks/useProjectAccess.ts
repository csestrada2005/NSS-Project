import { useState, useEffect } from 'react';
import { SupabaseService } from '@/services/SupabaseService';
import { useAuth } from '@/contexts/AuthContext';

interface ProjectAccess {
  isOwner: boolean;
  isCollaborator: boolean;
  collaboratorRole: 'read' | 'edit' | null;
  canEdit: boolean;
  loading: boolean;
}

export function useProjectAccess(projectId: string | undefined): ProjectAccess {
  const { user } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [collaboratorRole, setCollaboratorRole] = useState<'read' | 'edit' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !user?.id) {
      setLoading(false);
      return;
    }

    const check = async () => {
      setLoading(true);
      try {
        const supabase = SupabaseService.getInstance().client;

        const [{ data: project }, { data: collab }] = await Promise.all([
          supabase
            .from('forge_projects')
            .select('user_id')
            .eq('id', projectId)
            .eq('user_id', user.id)
            .single(),
          supabase
            .from('forge_project_collaborators')
            .select('role')
            .eq('project_id', projectId)
            .eq('user_id', user.id)
            .eq('status', 'accepted')
            .single(),
        ]);

        setIsOwner(!!project);
        setIsCollaborator(!!collab);
        setCollaboratorRole((collab?.role as 'read' | 'edit') ?? null);
      } catch {
        // Fail open
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [projectId, user?.id]);

  const canEdit = isOwner || collaboratorRole === 'edit';

  return { isOwner, isCollaborator, collaboratorRole, canEdit, loading };
}
