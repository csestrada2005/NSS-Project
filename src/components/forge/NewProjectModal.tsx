import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, Palette, Sparkles } from 'lucide-react';
import { SupabaseService } from '@/services/SupabaseService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { suggestPalettes, type SuggestedPalette } from '@/utils/colorPaletteSuggest.js';
import { hexToHslString } from '@/utils/colorConversion.js';
import type { DesignHints, BrandColor } from '@/services/DesignBriefService';
import { modalBackdropMotion, modalPanelMotion } from '@/components/ui/modalMotion';

interface NewProjectModalProps {
  onClose: () => void;
  onCreated: (projectId: string, projectName: string, initialPrompt: string, designHints?: DesignHints) => void;
}

const VIBES = ['Playful', 'Professional', 'Luxury', 'Minimal', 'Bold'] as const;
const WHEEL_PRESETS = ['#e63950', '#f4a340', '#2563eb', '#10b981', '#78350f', '#18181b'];

/**
 * Onboarding de proyecto (bucket 5, ítem 2, mockup D confirmado con Samuel):
 * la paleta elegida en modo "Sugerido por el prompt" viene de una fila real
 * de `colors` (DB principal de Wyrd) en hex — DesignBrief.palette exige HSL
 * sin wrapper, así que esto convierte y ordena en el orden exacto que
 * REQUIRED_BRAND_VARS espera (DesignBriefService.ts). Exportada para poder
 * testear el mapeo sin depender de la UI.
 */
export function toPinnedPalette(colors: SuggestedPalette['colors']): BrandColor[] {
  return [
    { var: '--brand-bg', hsl: hexToHslString(colors.background) ?? '0 0% 100%' },
    { var: '--brand-fg', hsl: hexToHslString(colors.foreground) ?? '0 0% 10%' },
    { var: '--brand-primary', hsl: hexToHslString(colors.primary) ?? '0 0% 30%' },
    { var: '--brand-accent', hsl: hexToHslString(colors.accent) ?? '0 0% 50%' },
    { var: '--brand-muted', hsl: hexToHslString(colors.muted) ?? '0 0% 90%' },
  ];
}

export default function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectName, setProjectName] = useState('');
  const [initialPrompt, setInitialPrompt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Paso 3 — tono + color (mockup D)
  const [tone, setTone] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<'wheel' | 'suggested'>('suggested');
  const [wheelHex, setWheelHex] = useState('#e63950');
  const [suggestedPalettes, setSuggestedPalettes] = useState<SuggestedPalette[]>([]);
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState<number | null>(null);
  const [isLoadingPalettes, setIsLoadingPalettes] = useState(false);
  const [palettesLoaded, setPalettesLoaded] = useState(false);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (step !== 3 || palettesLoaded) return;
    setIsLoadingPalettes(true);
    setPalettesLoaded(true);
    (async () => {
      try {
        const supabase = SupabaseService.getInstance().client;
        const [{ data: products }, { data: colors }] = await Promise.all([
          supabase.from('products').select('product_type, keywords'),
          supabase
            .from('colors')
            .select('product_type, primary_color, secondary_color, accent, background, foreground, muted, notes'),
        ]);
        const results = suggestPalettes(initialPrompt, products ?? [], colors ?? [], 3);
        setSuggestedPalettes(results);
        if (results.length > 0) setSelectedPaletteIndex(0);
      } catch (e) {
        console.warn('[NewProjectModal] palette suggestion failed, wheel still works:', e);
      } finally {
        setIsLoadingPalettes(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const handleNextFromName = () => {
    if (!projectName.trim()) return;
    setStep(2);
  };

  const handleNextFromPrompt = () => {
    if (!initialPrompt.trim()) return;
    setStep(3);
  };

  const handleSubmit = async () => {
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

      const selectedPalette = selectedPaletteIndex !== null ? suggestedPalettes[selectedPaletteIndex] : undefined;
      const designHints: DesignHints = {
        ...(tone ? { tone } : {}),
        ...(colorMode === 'suggested' && selectedPalette
          ? { pinnedPalette: toPinnedPalette(selectedPalette.colors) }
          : {}),
        ...(colorMode === 'wheel' && hexToHslString(wheelHex)
          ? { pinnedPrimaryHsl: hexToHslString(wheelHex) as string }
          : {}),
      };

      onCreated(data.id, projectName.trim(), initialPrompt.trim(), designHints);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
      setIsCreating(false);
    }
  };

  const pillClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-border bg-muted text-muted-foreground hover:text-foreground'
    }`;

  const tabClass = (active: boolean) =>
    `px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
      active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
    }`;

  return (
    <motion.div
      {...modalBackdropMotion}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <motion.div
        {...modalPanelMotion}
        className="nebu-modal bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {step === 1 ? 'New Project' : step === 2 ? 'What are we building?' : 'Tone and color'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 3</p>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {step === 1 && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">Project name</label>
              <Input
                ref={nameInputRef}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My awesome app"
                onKeyDown={(e) => { if (e.key === 'Enter') handleNextFromName(); }}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleNextFromName} disabled={!projectName.trim()}>
                Next →
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
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
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button onClick={handleNextFromPrompt} disabled={!initialPrompt.trim()}>
                Next →
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Your description
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{initialPrompt}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Tone</span>
              <div className="flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button key={v} type="button" className={pillClass(tone === v)} onClick={() => setTone(v)}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Color</span>
                <div className="flex gap-0.5 bg-muted rounded-md p-0.5">
                  <button
                    type="button"
                    className={`${tabClass(colorMode === 'wheel')} inline-flex items-center gap-1.5`}
                    onClick={() => setColorMode('wheel')}
                  >
                    <Palette size={12} /> Color wheel
                  </button>
                  <button
                    type="button"
                    className={`${tabClass(colorMode === 'suggested')} inline-flex items-center gap-1.5`}
                    onClick={() => setColorMode('suggested')}
                  >
                    <Sparkles size={12} /> Suggested for you
                  </button>
                </div>
              </div>

              {colorMode === 'wheel' && (
                <div className="flex gap-5 items-center p-4 rounded-lg border border-border bg-background/60">
                  <div
                    className="w-24 h-24 rounded-full border-2 border-border shrink-0"
                    style={{
                      background:
                        'conic-gradient(from 0deg,#ff0000,#ffbb00,#a3ff00,#00ffbb,#0077ff,#8800ff,#ff00aa,#ff0000)',
                    }}
                  />
                  <div className="flex flex-col gap-2 flex-grow">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md border border-border" style={{ background: wheelHex }} />
                      <input
                        type="text"
                        value={wheelHex}
                        onChange={(e) => setWheelHex(e.target.value)}
                        className="flex-grow rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {WHEEL_PRESETS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setWheelHex(hex)}
                          className={`w-6 h-6 rounded-md border ${wheelHex === hex ? 'border-foreground' : 'border-border'}`}
                          style={{ background: hex }}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Use this when the Nebu brief already has the client's brand color.
                    </span>
                  </div>
                </div>
              )}

              {colorMode === 'suggested' && (
                <div className="flex gap-3">
                  {isLoadingPalettes && (
                    <div className="flex-grow flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                      <Loader2 size={14} className="animate-spin" /> Matching your description…
                    </div>
                  )}
                  {!isLoadingPalettes && suggestedPalettes.length === 0 && (
                    <div className="flex-grow text-xs text-muted-foreground py-4">
                      No close match found — try the color wheel instead.
                    </div>
                  )}
                  {!isLoadingPalettes &&
                    suggestedPalettes.map((p, i) => {
                      const active = selectedPaletteIndex === i;
                      return (
                        <button
                          key={p.productType}
                          type="button"
                          onClick={() => setSelectedPaletteIndex(i)}
                          className={`flex-1 flex flex-col gap-2.5 text-left p-3 rounded-lg border transition-colors ${
                            active ? 'border-primary bg-primary/5' : 'border-border bg-background/60'
                          }`}
                        >
                          <div className="flex gap-1.5">
                            {[p.colors.primary, p.colors.secondary, p.colors.accent, p.colors.background].map(
                              (hex, j) => (
                                <div key={j} className="w-4 h-4 rounded border border-border/60" style={{ background: hex }} />
                              )
                            )}
                          </div>
                          <span className="text-sm font-semibold text-foreground">{p.productType}</span>
                          <div className="rounded-md bg-muted/50 border border-border/60 p-2">
                            <div className="w-3/5 h-1.5 rounded-sm" style={{ background: p.colors.accent }} />
                            <div className="w-4/5 h-1 rounded-sm bg-foreground/10 mt-2" />
                            <div className="w-3/5 h-1 rounded-sm bg-foreground/10 mt-1" />
                          </div>
                          <span className="text-[11px] text-muted-foreground leading-snug mt-auto">{p.notes}</span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(2)} disabled={isCreating}>
                ← Back
              </Button>
              <Button onClick={handleSubmit} disabled={isCreating} className="nebu-cta">
                {isCreating && <Loader2 size={14} className="animate-spin mr-1" />}
                Start Building →
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
