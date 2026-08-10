/**
 * SEO component shipped in every generated project (CIRUGÍA P1-6, CAMBIO 3a).
 *
 * PHASE-PREVIA DECISION: react-helmet-async is NOT vendored in the preview
 * runtime (see server/compiler.js ALIAS map) — it would only resolve through the
 * esm.sh CDN fallback, which the matrix could not confirm as reliable. Per
 * "mejor ausente que rota", the template ships the ZERO-DEPENDENCY version the
 * issue specifies: a component with the SAME `<SEO title description image? />`
 * API that drives document.title / <meta> via a useEffect. When helmet is later
 * vendored, only this file's body changes; every call site stays identical.
 *
 * Exposed as a FileSystemTree file node for templates.ts.
 */

const SEO = `import { useEffect } from 'react';

interface SEOProps {
  /** Page title — sets document.title and og:title / twitter:title. */
  title: string;
  /** Meta description — sets description + og:description / twitter:description. */
  description?: string;
  /** Absolute or root-relative image URL for og:image / twitter:image. */
  image?: string;
}

/**
 * Head manager with zero runtime dependencies. Renders nothing; on mount and on
 * prop change it upserts the document title and the standard SEO meta tags
 * (description, Open Graph, Twitter Card). Tags it creates are marked with a
 * data-seo attribute so repeated updates reuse the same nodes instead of
 * stacking duplicates.
 *
 * Usage: <SEO title="Acme — Home" description="…" image="/og.png" />
 */
export function SEO({ title, description, image }: SEOProps) {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    document.title = title;

    const upsert = (
      attr: 'name' | 'property',
      key: string,
      value: string | undefined
    ) => {
      if (!value) return;
      const selector = attr + '="' + key + '"';
      let el = document.head.querySelector<HTMLMetaElement>('meta[' + selector + ']');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        el.setAttribute('data-seo', 'true');
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    upsert('name', 'description', description);
    upsert('property', 'og:title', title);
    upsert('property', 'og:description', description);
    upsert('property', 'og:type', 'website');
    upsert('property', 'og:image', image);
    upsert('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
    upsert('name', 'twitter:title', title);
    upsert('name', 'twitter:description', description);
    upsert('name', 'twitter:image', image);
  }, [title, description, image]);

  return null;
}

export default SEO;
`;

/** FileSystemTree file node for `src/components/SEO.tsx`. */
export const SEO_FILE = { file: { contents: SEO } };
