/**
 * Motion primitives shipped in every generated project (CIRUGÍA P1-6, CAMBIO 1).
 *
 * These land in the template at `src/components/motion/` so the Implementer can
 * COMPOSE them instead of hand-writing framer-motion boilerplate on every
 * project. framer-motion is vendored in the preview runtime (see
 * server/compiler.js ALIAS map) AND declared in the template package.json, so
 * these resolve identically in the Wyrd preview and in an exported `vite build`.
 *
 * Each primitive: typed props, respects prefers-reduced-motion where it moves
 * pixels, and stays under 80 lines. Exposed here as FileSystemTree file nodes so
 * templates.ts can splice them into `components/motion/` without inlining ~300
 * lines of TSX into the template literal.
 */

// FadeIn — viewport-triggered entrance. Direction + delay configurable; a fully
// reduced-motion user gets a plain opacity fade with no translate.
const FADE_IN = `import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

interface FadeInProps {
  children: ReactNode;
  /** Slide-in direction of the entrance. Default: 'up'. */
  direction?: Direction;
  /** Delay before the animation starts, in seconds. Default: 0. */
  delay?: number;
  /** Travel distance in px before settling. Default: 24. */
  distance?: number;
  /** Duration in seconds. Default: 0.6. */
  duration?: number;
  /** Animate every time it enters the viewport instead of once. Default: false. */
  repeat?: boolean;
  className?: string;
}

const offset = (direction: Direction, distance: number) => {
  switch (direction) {
    case 'up': return { y: distance };
    case 'down': return { y: -distance };
    case 'left': return { x: distance };
    case 'right': return { x: -distance };
    default: return {};
  }
};

export function FadeIn({
  children,
  direction = 'up',
  delay = 0,
  distance = 24,
  duration = 0.6,
  repeat = false,
  className,
}: FadeInProps) {
  const reduced = useReducedMotion();
  const variants: Variants = {
    hidden: { opacity: 0, ...(reduced ? {} : offset(direction, distance)) },
    show: { opacity: 1, x: 0, y: 0 },
  };
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={{ once: !repeat, margin: '-40px' }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default FadeIn;
`;

// StaggerChildren — parent that reveals its children in sequence. Pair each
// child with <FadeIn> (or any motion child using the "hidden"/"show" variants).
const STAGGER_CHILDREN = `import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

interface StaggerChildrenProps {
  children: ReactNode;
  /** Gap between each child's start, in seconds. Default: 0.12. */
  stagger?: number;
  /** Delay before the first child starts, in seconds. Default: 0. */
  delayChildren?: number;
  className?: string;
}

/**
 * Wrap a list of motion children (e.g. <FadeIn>) to reveal them in sequence as
 * the group enters the viewport. Children must animate on the "hidden"/"show"
 * variant names — <FadeIn> already does.
 */
export function StaggerChildren({
  children,
  stagger = 0.12,
  delayChildren = 0,
  className,
}: StaggerChildrenProps) {
  const container: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: stagger, delayChildren },
    },
  };
  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-40px' }}
    >
      {children}
    </motion.div>
  );
}

export default StaggerChildren;
`;

// ParallaxImage — subtle scroll-linked parallax. Fully disabled for
// prefers-reduced-motion (renders a plain, static image).
const PARALLAX_IMAGE = `import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';

interface ParallaxImageProps {
  src: string;
  alt: string;
  /** Total vertical travel across the scroll range, in px. Default: 60. */
  strength?: number;
  className?: string;
  imgClassName?: string;
}

/**
 * A subtle parallax image: the picture drifts slightly slower than the scroll
 * as its container passes through the viewport. Honors prefers-reduced-motion by
 * rendering a static image with no transform.
 */
export function ParallaxImage({
  src,
  alt,
  strength = 60,
  className,
  imgClassName,
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-strength / 2, strength / 2]);

  return (
    <div ref={ref} className={className} style={{ overflow: 'hidden' }}>
      <motion.img
        src={src}
        alt={alt}
        className={imgClassName}
        style={reduced ? undefined : { y, scale: 1.15, willChange: 'transform' }}
        loading="lazy"
      />
    </div>
  );
}

export default ParallaxImage;
`;

// Marquee — infinite horizontal loop, pausable on hover. Duplicates its content
// once so the translate wraps seamlessly. Static for reduced-motion.
const MARQUEE = `import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface MarqueeProps {
  children: ReactNode;
  /** Seconds for one full loop. Lower is faster. Default: 20. */
  speed?: number;
  /** Scroll direction. Default: 'left'. */
  direction?: 'left' | 'right';
  /** Pause the loop while hovered. Default: true. */
  pauseOnHover?: boolean;
  className?: string;
}

/**
 * Infinite, seamless marquee for logo rows, testimonials or tickers. The content
 * is duplicated so the loop wraps without a visible seam. Reduced-motion users
 * see a static, non-animated row.
 */
export function Marquee({
  children,
  speed = 20,
  direction = 'left',
  pauseOnHover = true,
  className,
}: MarqueeProps) {
  const reduced = useReducedMotion();
  const distance = direction === 'left' ? ['0%', '-50%'] : ['-50%', '0%'];

  return (
    <div
      className={className}
      style={{ overflow: 'hidden', display: 'flex', whiteSpace: 'nowrap' }}
    >
      <motion.div
        style={{ display: 'flex', flexShrink: 0, gap: '2rem', minWidth: '100%' }}
        animate={reduced ? undefined : { x: distance }}
        transition={reduced ? undefined : { duration: speed, ease: 'linear', repeat: Infinity }}
        whileHover={pauseOnHover && !reduced ? { transition: { duration: 0 } } : undefined}
      >
        {children}
        {!reduced && <>{children}</>}
      </motion.div>
    </div>
  );
}

export default Marquee;
`;

// AnimatedCounter — counts up to a target when scrolled into view. Ideal for
// stat blocks ("10k+ users"). Reduced-motion users see the final value at once.
const ANIMATED_COUNTER = `import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

interface AnimatedCounterProps {
  /** Final value to count up to. */
  value: number;
  /** Animation duration in seconds. Default: 2. */
  duration?: number;
  /** Decimal places to render. Default: 0. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts from 0 up to \`value\` once it enters the viewport. Uses an eased curve
 * for a natural finish. Honors prefers-reduced-motion by snapping to the final
 * value.
 */
export function AnimatedCounter({
  value,
  duration = 2,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setDisplay(value); return; }
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}

export default AnimatedCounter;
`;

const file = (contents: string) => ({ file: { contents } });

/**
 * FileSystemTree fragment for `src/components/motion/`. Spliced into the
 * template's `components` directory by templates.ts.
 */
export const MOTION_DIR = {
  directory: {
    'FadeIn.tsx': file(FADE_IN),
    'StaggerChildren.tsx': file(STAGGER_CHILDREN),
    'ParallaxImage.tsx': file(PARALLAX_IMAGE),
    'Marquee.tsx': file(MARQUEE),
    'AnimatedCounter.tsx': file(ANIMATED_COUNTER),
    'index.ts': file(
      `export { FadeIn } from './FadeIn';\n` +
      `export { StaggerChildren } from './StaggerChildren';\n` +
      `export { ParallaxImage } from './ParallaxImage';\n` +
      `export { Marquee } from './Marquee';\n` +
      `export { AnimatedCounter } from './AnimatedCounter';\n`,
    ),
  },
};
