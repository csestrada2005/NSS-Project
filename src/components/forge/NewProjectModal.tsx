import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: (projectId: string, projectName: string, initialPrompt: string) => void;
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [projectName, setProjectName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleNext = () => {
    if (!projectName.trim()) return;
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!initialPrompt.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const supabase = SupabaseService.getInstance().client;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error: insertError } = await supabase
        .from('forge_projects')
        .insert({
          user_id: user.id,
          name: projectName.trim(),
          initial_prompt: initialPrompt.trim(),
        })
        .select('id')
        .single();

      if (insertError || !data) throw insertError ?? new Error('Failed to create project');

      onCreated(data.id, projectName.trim(), initialPrompt.trim());
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {step === 1 ? 'New Project' : 'What are we building?'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 2</p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {step === 1 ? (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Project name</label>
              <Input
                ref={nameInputRef}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My awesome app"
                onKeyDown={(e) => { if (e.key === 'Enter') handleNext(); }}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleNext} disabled={!projectName.trim()}>
                Next →
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">Describe your vision — the AI will build it.</p>
              <textarea
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                placeholder="A landing page for a coffee subscription service with dark theme, featuring pricing cards and a sign-up form..."
                rows={6}
                autoFocus
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} disabled={isCreating}>
                ← Back
              </Button>
              <Button onClick={handleSubmit} disabled={!initialPrompt.trim() || isCreating}>
                {isCreating && <Loader2 size={14} className="animate-spin mr-1" />}
                Start Building →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
