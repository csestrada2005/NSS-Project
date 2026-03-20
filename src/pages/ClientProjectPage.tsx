import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe,
  Loader2,
  Plus,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Send,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SupabaseService } from '@/services/SupabaseService';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectAccess } from '@/hooks/useProjectAccess';
import { toast } from 'sonner';

interface ProjectDetails {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  deployment_url: string | null;
  is_public: boolean;
  owner?: { full_name: string | null };
}

interface Milestone {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  due_date: string | null;
  completed_date: string | null;
}

interface MilestoneNote {
  id: string;
  milestone_id: string;
  content: string;
  created_at: string;
  author?: { full_name: string | null };
}

const STATUS_CONFIG: Record<
  Milestone['status'],
  { label: string; color: string; dot: string }
> = {
  pending: { label: 'Pending', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400' },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', dot: 'bg-blue-400' },
  completed: { label: 'Completed', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400' },
  blocked: { label: 'Blocked', color: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400' },
};

function MilestoneCard({
  milestone,
  notes,
  canEdit,
  onAddNote,
  onUpdateStatus,
}: {
  milestone: Milestone;
  notes: MilestoneNote[];
  canEdit: boolean;
  onAddNote: (milestoneId: string, content: string) => Promise<void>;
  onUpdateStatus: (milestoneId: string, status: Milestone['status']) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const status = STATUS_CONFIG[milestone.status];

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSubmittingNote(true);
    await onAddNote(milestone.id, noteText.trim());
    setNoteText('');
    setSubmittingNote(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{milestone.title}</h3>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${status.color}`}>
              {status.label}
            </span>
          </div>
          {milestone.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{milestone.description}</p>
          )}
          <div className="flex gap-4 mt-1 text-[11px] text-muted-foreground">
            {milestone.due_date && (
              <span>Due: {new Date(milestone.due_date).toLocaleDateString()}</span>
            )}
            {milestone.completed_date && (
              <span>Completed: {new Date(milestone.completed_date).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && (
            <select
              value={milestone.status}
              onChange={(e) => onUpdateStatus(milestone.id, e.target.value as Milestone['status'])}
              onClick={(e) => e.stopPropagation()}
              className="text-xs bg-muted border border-border text-foreground rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          )}
          <button
            onClick={() => setExpanded((p) => !p)}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        </div>
      </div>

      {/* Notes section */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4">
          <div className="flex items-center gap-2 py-3 text-xs font-medium text-muted-foreground">
            <MessageSquare size={13} />
            Notes
          </div>

          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 mb-3">No notes yet.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {notes.map((note) => (
                <div key={note.id} className="flex gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                    {(note.author?.full_name ?? '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">
                        {note.author?.full_name ?? 'Unknown'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{note.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          <div className="flex gap-2">
            <input
              type="text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNote();
              }}
              placeholder="Add a note..."
              className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={handleAddNote}
              disabled={!noteText.trim() || submittingNote}
              className="px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submittingNote ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ClientProjectPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOwner, isCollaborator, canEdit, loading: accessLoading } = useProjectAccess(projectId);

  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [notes, setNotes] = useState<Record<string, MilestoneNote[]>>({});
  const [loadingProject, setLoadingProject] = useState(true);

  // Add milestone form
  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestone, setNewMilestone] = useState({
    title: '',
    description: '',
    status: 'pending' as Milestone['status'],
    due_date: '',
  });
  const [addingMilestone, setAddingMilestone] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    const load = async () => {
      setLoadingProject(true);
      const supabase = SupabaseService.getInstance().client;
      try {
        const { data: projectData } = await supabase
          .from('forge_projects')
          .select('id, name, description, user_id, deployment_url, is_public, profiles!user_id(full_name)')
          .eq('id', projectId)
          .single();

        if (projectData) {
          setProject({
            ...projectData,
            owner: (projectData as any).profiles,
          });
        }

        // Load milestones
        const { data: milestonesData } = await supabase
          .from('project_milestones')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true });

        const milestonesArr = (milestonesData ?? []) as Milestone[];
        setMilestones(milestonesArr);

        // Load all notes for these milestones
        if (milestonesArr.length > 0) {
          const milestoneIds = milestonesArr.map((m) => m.id);
          const { data: notesData } = await supabase
            .from('milestone_notes')
            .select('*, profiles!author_id(full_name)')
            .in('milestone_id', milestoneIds)
            .order('created_at', { ascending: true });

          const grouped: Record<string, MilestoneNote[]> = {};
          for (const note of notesData ?? []) {
            const n: MilestoneNote = {
              ...(note as any),
              author: (note as any).profiles,
            };
            if (!grouped[n.milestone_id]) grouped[n.milestone_id] = [];
            grouped[n.milestone_id].push(n);
          }
          setNotes(grouped);
        }
      } finally {
        setLoadingProject(false);
      }
    };
    load();
  }, [projectId]);

  // Redirect if no access after loading
  useEffect(() => {
    if (!accessLoading && !isOwner && !isCollaborator) {
      navigate('/forge', { replace: true });
    }
  }, [accessLoading, isOwner, isCollaborator, navigate]);

  const handleAddNote = async (milestoneId: string, content: string) => {
    if (!user?.id) return;
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('milestone_notes')
        .insert({ milestone_id: milestoneId, author_id: user.id, content })
        .select('*, profiles!author_id(full_name)')
        .single();

      if (data) {
        const note: MilestoneNote = { ...(data as any), author: (data as any).profiles };
        setNotes((prev) => ({
          ...prev,
          [milestoneId]: [...(prev[milestoneId] ?? []), note],
        }));
      }
    } catch {
      toast.error('Failed to add note');
    }
  };

  const handleUpdateStatus = async (milestoneId: string, status: Milestone['status']) => {
    try {
      const supabase = SupabaseService.getInstance().client;
      const updates: Record<string, unknown> = { status };
      if (status === 'completed') updates.completed_date = new Date().toISOString();
      await supabase.from('project_milestones').update(updates).eq('id', milestoneId);
      setMilestones((prev) =>
        prev.map((m) => (m.id === milestoneId ? { ...m, ...updates } : m))
      );
    } catch {
      toast.error('Failed to update milestone');
    }
  };

  const handleAddMilestone = async () => {
    if (!newMilestone.title.trim() || !projectId) return;
    setAddingMilestone(true);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data } = await supabase
        .from('project_milestones')
        .insert({
          project_id: projectId,
          title: newMilestone.title.trim(),
          description: newMilestone.description.trim() || null,
          status: newMilestone.status,
          due_date: newMilestone.due_date || null,
        })
        .select('*')
        .single();

      if (data) {
        setMilestones((prev) => [...prev, data as Milestone]);
        setNewMilestone({ title: '', description: '', status: 'pending', due_date: '' });
        setShowAddMilestone(false);
        toast.success('Milestone added');
      }
    } catch {
      toast.error('Failed to add milestone');
    } finally {
      setAddingMilestone(false);
    }
  };

  if (accessLoading || loadingProject) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 size={28} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground text-sm">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Project Header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {project.owner?.full_name && (
                <span className="text-xs text-muted-foreground">
                  Owner: <span className="text-foreground font-medium">{project.owner.full_name}</span>
                </span>
              )}
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                  project.deployment_url
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                }`}
              >
                {project.deployment_url ? 'Deployed' : 'Not deployed'}
              </span>
            </div>
          </div>
          {project.deployment_url && (
            <a
              href={project.deployment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors shrink-0"
            >
              <Globe size={14} />
              View Live
            </a>
          )}
        </div>
      </div>

      {/* Preview iframe */}
      {project.deployment_url && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Preview</h2>
          </div>
          <div className="h-64 relative">
            <iframe
              src={project.deployment_url}
              className="w-full h-full border-0"
              title="Project Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}

      {/* Milestones */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Milestones</h2>
          {canEdit && (
            <button
              onClick={() => setShowAddMilestone((p) => !p)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            >
              <Plus size={13} />
              Add Milestone
            </button>
          )}
        </div>

        {/* Add milestone form */}
        {showAddMilestone && (
          <div className="rounded-xl border border-border bg-card p-4 mb-4 space-y-3">
            <h3 className="text-sm font-medium text-foreground">New Milestone</h3>
            <input
              type="text"
              value={newMilestone.title}
              onChange={(e) => setNewMilestone((p) => ({ ...p, title: e.target.value }))}
              placeholder="Title"
              className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <textarea
              value={newMilestone.description}
              onChange={(e) => setNewMilestone((p) => ({ ...p, description: e.target.value }))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                <select
                  value={newMilestone.status}
                  onChange={(e) =>
                    setNewMilestone((p) => ({ ...p, status: e.target.value as Milestone['status'] }))
                  }
                  className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={newMilestone.due_date}
                  onChange={(e) => setNewMilestone((p) => ({ ...p, due_date: e.target.value }))}
                  className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddMilestone(false)}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMilestone}
                disabled={!newMilestone.title.trim() || addingMilestone}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addingMilestone && <Loader2 size={12} className="animate-spin" />}
                Add Milestone
              </button>
            </div>
          </div>
        )}

        {milestones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center gap-2 rounded-xl border border-border bg-card">
            <p className="text-sm text-muted-foreground">No milestones added yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {milestones.map((milestone) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                notes={notes[milestone.id] ?? []}
                canEdit={canEdit}
                onAddNote={handleAddNote}
                onUpdateStatus={handleUpdateStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientProjectPage;
