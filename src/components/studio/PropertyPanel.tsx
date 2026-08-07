import { useMemo, useState } from 'react';
import { X, Type, Palette, Move, Bold, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import type { TargetElement } from '../../utils/ast';

/**
 * PropertyPanel — the deterministic heart of Visual mode (PR-2, CAMBIO 3).
 *
 * Every control mutates the element's Tailwind className (or its text) with ZERO
 * LLM calls: pick a color / size / spacing → we compute the next className string
 * (replace-or-append by prefix) and hand it to the parent, which rewrites the
 * SOURCE file by ordinal and recompiles. Color swatches surface the project's 5
 * brand CSS vars (read from the project's src/index.css) first, then a free picker.
 *
 * Repeated elements (instanceCount > 1, e.g. nav links from a .map()) edit the
 * SOURCE element, so all N instances change — correct and expected; the panel
 * labels it "×N". Text editing is disabled for them (the text lives in data).
 */

interface PropertyPanelProps {
  element: TargetElement;
  /** Content of the project's src/index.css — source of the 5 brand vars. */
  projectCss: string;
  /** Apply a fully-resolved className string to the source element. */
  onApplyClassName: (newClassName: string) => void;
  /** Replace the element's text literal in the source. */
  onApplyText: (newText: string) => void;
  onClose: () => void;
}

interface BrandVar {
  name: string; // e.g. "--brand-primary"
  label: string; // e.g. "Primary"
  css: string; // e.g. "hsl(var(--brand-primary))"
}

const BRAND_VAR_ORDER = ['--brand-bg', '--brand-fg', '--brand-primary', '--brand-accent', '--brand-muted'];

/** Extract the project's 5 brand vars (in canonical order) from its index.css. */
function parseBrandVars(css: string): BrandVar[] {
  const out: BrandVar[] = [];
  for (const name of BRAND_VAR_ORDER) {
    // Only surface vars the project actually declares.
    const re = new RegExp(name.replace('--', '--') + '\\s*:\\s*([^;]+);');
    if (re.test(css)) {
      out.push({
        name,
        label: name.replace('--brand-', '').replace(/^\w/, (c) => c.toUpperCase()),
        css: `hsl(var(${name}))`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// className manipulation — pure, deterministic, no LLM.
// ---------------------------------------------------------------------------
const FONT_SIZES = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];
const FONT_WEIGHTS = ['light', 'normal', 'medium', 'semibold', 'bold', 'extrabold'];
const SPACING = ['0', '1', '2', '3', '4', '6', '8', '10', '12', '16'];
const RADII = ['none', 'sm', 'md', 'lg', 'xl', '2xl', 'full'];
const SHADOWS = ['none', 'sm', 'md', 'lg', 'xl', '2xl'];

function tokens(className: string): string[] {
  return className.split(/\s+/).filter(Boolean);
}

/** Remove tokens matching `pred`, then append `add` (when given). */
function setToken(className: string, pred: (t: string) => boolean, add?: string): string {
  const kept = tokens(className).filter((t) => !pred(t));
  if (add) kept.push(add);
  return kept.join(' ').trim();
}

// Predicates that isolate a control's "channel" so a new value replaces the old.
const isTextColor = (t: string) =>
  /^text-\[/.test(t) ||
  /^text-(?:white|black|transparent|current|inherit)$/.test(t) ||
  /^text-[a-z]+-\d{2,3}$/.test(t);
const isBgColor = (t: string) => /^bg-/.test(t);
const isFontSize = (t: string) => new RegExp(`^text-(?:${FONT_SIZES.join('|')})$`).test(t);
const isFontWeight = (t: string) => /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.test(t);
const isAlign = (t: string) => /^text-(?:left|center|right|justify)$/.test(t);
const isPadding = (t: string) => /^p-(?:\d+|\[)/.test(t);
const isMargin = (t: string) => /^m-(?:\d+|\[)/.test(t);
const isRadius = (t: string) => /^rounded(?:-|$)/.test(t);
const isShadow = (t: string) => /^shadow(?:-|$)/.test(t);

function hasToken(className: string, token: string): boolean {
  return tokens(className).includes(token);
}

export function PropertyPanel({ element, projectCss, onApplyClassName, onApplyText, onClose }: PropertyPanelProps) {
  // State is initialized from the selected element; the parent gives this panel a
  // `key` tied to the element identity, so selecting a different element remounts
  // it fresh instead of syncing props into state via an effect.
  const [workingClass, setWorkingClass] = useState(element.className ?? '');
  const [textDraft, setTextDraft] = useState(element.textContent ?? '');

  const brandVars = useMemo(() => parseBrandVars(projectCss), [projectCss]);
  const repeated = (element.instanceCount ?? 1) > 1;

  const apply = (pred: (t: string) => boolean, add?: string) => {
    const next = setToken(workingClass, pred, add);
    setWorkingClass(next);
    onApplyClassName(next);
  };

  const applyColor = (channel: 'text' | 'bg', css: string) => {
    const cls = `${channel}-[${css}]`;
    apply(channel === 'text' ? isTextColor : isBgColor, cls);
  };

  return (
    <div className="absolute top-16 right-4 z-40 w-72 max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl text-foreground animate-in fade-in slide-in-from-right-2 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-card z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono uppercase bg-primary/15 text-primary px-2 py-0.5 rounded">
            {element.tagName}
          </span>
          {repeated && (
            <span
              className="text-[10px] font-medium bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded"
              title="Elemento repetido — editar el estilo cambia las N instancias"
            >
              ×{element.instanceCount}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Deseleccionar (Esc)"
        >
          <X size={15} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-5">
        {/* COLOR */}
        <Section icon={<Palette size={13} />} title="Color">
          <ColorRow
            label="Texto"
            brandVars={brandVars}
            onBrand={(css) => applyColor('text', css)}
            onFree={(hex) => applyColor('text', hex)}
          />
          <ColorRow
            label="Fondo"
            brandVars={brandVars}
            onBrand={(css) => applyColor('bg', css)}
            onFree={(hex) => applyColor('bg', hex)}
          />
        </Section>

        {/* TYPOGRAPHY */}
        <Section icon={<Type size={13} />} title="Tipografía">
          <ChipRow label="Tamaño">
            {FONT_SIZES.map((s) => (
              <Chip
                key={s}
                active={hasToken(workingClass, `text-${s}`)}
                onClick={() => apply(isFontSize, `text-${s}`)}
              >
                {s}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Peso" icon={<Bold size={11} />}>
            {FONT_WEIGHTS.map((w) => (
              <Chip
                key={w}
                active={hasToken(workingClass, `font-${w}`)}
                onClick={() => apply(isFontWeight, `font-${w}`)}
              >
                {w}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Alineación">
            {(
              [
                ['left', <AlignLeft size={12} key="l" />],
                ['center', <AlignCenter size={12} key="c" />],
                ['right', <AlignRight size={12} key="r" />],
              ] as const
            ).map(([a, icon]) => (
              <Chip
                key={a}
                active={hasToken(workingClass, `text-${a}`)}
                onClick={() => apply(isAlign, `text-${a}`)}
              >
                {icon}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* SPACING */}
        <Section icon={<Move size={13} />} title="Espaciado">
          <ChipRow label="Padding">
            {SPACING.map((n) => (
              <Chip key={n} active={hasToken(workingClass, `p-${n}`)} onClick={() => apply(isPadding, `p-${n}`)}>
                {n}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Margin">
            {SPACING.map((n) => (
              <Chip key={n} active={hasToken(workingClass, `m-${n}`)} onClick={() => apply(isMargin, `m-${n}`)}>
                {n}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Radio">
            {RADII.map((r) => (
              <Chip
                key={r}
                active={hasToken(workingClass, r === 'md' ? 'rounded' : `rounded-${r}`)}
                onClick={() => apply(isRadius, r === 'md' ? 'rounded' : `rounded-${r}`)}
              >
                {r}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow label="Sombra">
            {SHADOWS.map((s) => (
              <Chip
                key={s}
                active={hasToken(workingClass, s === 'md' ? 'shadow' : `shadow-${s}`)}
                onClick={() => apply(isShadow, s === 'md' ? 'shadow' : `shadow-${s}`)}
              >
                {s}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* TEXT */}
        <Section icon={<Type size={13} />} title="Texto">
          {repeated ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Elemento repetido — el texto vive en datos; edítalo por chat.
            </p>
          ) : element.hasChildElements ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Este elemento contiene otros elementos — edita su texto por chat.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                rows={2}
                className="w-full text-xs p-2 rounded-md border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Texto del elemento…"
              />
              <button
                onClick={() => onApplyText(textDraft)}
                disabled={textDraft === (element.textContent ?? '')}
                className="self-end text-xs font-medium bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Aplicar texto
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function ChipRow({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[24px] px-1.5 py-1 text-[11px] rounded border transition-colors flex items-center justify-center ${
        active
          ? 'bg-primary text-white border-primary'
          : 'bg-background text-muted-foreground border-border hover:text-foreground hover:border-primary/50'
      }`}
    >
      {children}
    </button>
  );
}

function ColorRow({
  label,
  brandVars,
  onBrand,
  onFree,
}: {
  label: string;
  brandVars: BrandVar[];
  onBrand: (css: string) => void;
  onFree: (hex: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {brandVars.map((v) => (
          <button
            key={v.name}
            onClick={() => onBrand(v.css)}
            title={`${v.label} (${v.name})`}
            className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
            style={{ background: v.css }}
          />
        ))}
        {/* Free picker — arbitrary hex value. */}
        <label
          className="w-6 h-6 rounded-md border border-border overflow-hidden cursor-pointer relative"
          title="Color libre"
        >
          <span className="absolute inset-0 bg-gradient-to-br from-red-500 via-green-500 to-blue-500" />
          <input
            type="color"
            className="opacity-0 w-full h-full cursor-pointer"
            onChange={(e) => onFree(e.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
