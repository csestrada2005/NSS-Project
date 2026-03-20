import { SupabaseService } from './SupabaseService';
import { NotificationService } from './NotificationService';

export interface Collaborator {
  id: string;
  project_id: string;
  user_id: string;
  invited_by: string;
  role: 'read' | 'edit';
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string | null;
  };
}

export interface InviteEntry {
  userId: string;
  role: 'read' | 'edit';
}

export class CollaboratorService {
  static async getCollaborators(projectId: string): Promise<Collaborator[]> {
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data, error } = await supabase
        .from('forge_project_collaborators')
        .select(`
          id, project_id, user_id, invited_by, role, status, created_at,
          profile:profiles!user_id(full_name, email, avatar_url, role)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as Collaborator[];
    } catch (e) {
      console.error('[CollaboratorService] getCollaborators error:', e);
      return [];
    }
  }

  static async inviteUsers(
    projectId: string,
    invitedBy: string,
    invites: InviteEntry[],
    projectName: string,
    inviterName: string
  ): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;

      for (const invite of invites) {
        // Insert collaborator row
        const { data: collab, error } = await supabase
          .from('forge_project_collaborators')
          .insert({
            project_id: projectId,
            user_id: invite.userId,
            invited_by: invitedBy,
            role: invite.role,
            status: 'pending',
          })
          .select('id')
          .single();

        if (error) {
          console.error('[CollaboratorService] insert error:', error);
          continue;
        }

        // Create notification for invited user
        await NotificationService.createNotification({
          user_id: invite.userId,
          type: 'project_invitation',
          title: 'You have been invited to a project',
          body: `${inviterName} invited you to collaborate on "${projectName}"`,
          payload: {
            project_id: projectId,
            collaborator_id: collab?.id,
            inviter_id: invitedBy,
            role: invite.role,
          },
        });
      }
    } catch (e) {
      console.error('[CollaboratorService] inviteUsers error:', e);
    }
  }

  static async updateRole(collaboratorId: string, newRole: 'read' | 'edit'): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_project_collaborators')
        .update({ role: newRole })
        .eq('id', collaboratorId);
    } catch (e) {
      console.error('[CollaboratorService] updateRole error:', e);
    }
  }

  static async revokeAccess(collaboratorId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_project_collaborators')
        .delete()
        .eq('id', collaboratorId);
    } catch (e) {
      console.error('[CollaboratorService] revokeAccess error:', e);
    }
  }

  static async acceptInvitation(collaboratorId: string, userId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;

      // Get collaborator info to notify project owner
      const { data: collab } = await supabase
        .from('forge_project_collaborators')
        .select('invited_by, project_id, forge_projects!project_id(name)')
        .eq('id', collaboratorId)
        .single();

      await supabase
        .from('forge_project_collaborators')
        .update({ status: 'accepted' })
        .eq('id', collaboratorId)
        .eq('user_id', userId);

      // Notify the project owner
      if (collab?.invited_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .single();

        const projectName = (collab as any).forge_projects?.name ?? 'your project';
        const userName = profile?.full_name ?? 'A collaborator';

        await NotificationService.createNotification({
          user_id: collab.invited_by,
          type: 'collaboration_accepted',
          title: 'Invitation accepted',
          body: `${userName} accepted your invitation to collaborate on "${projectName}"`,
          payload: { collaborator_id: collaboratorId, project_id: collab.project_id },
        });
      }
    } catch (e) {
      console.error('[CollaboratorService] acceptInvitation error:', e);
    }
  }

  static async declineInvitation(collaboratorId: string, userId: string): Promise<void> {
    try {
      const supabase = SupabaseService.getInstance().client;
      await supabase
        .from('forge_project_collaborators')
        .update({ status: 'declined' })
        .eq('id', collaboratorId)
        .eq('user_id', userId);
    } catch (e) {
      console.error('[CollaboratorService] declineInvitation error:', e);
    }
  }
}
