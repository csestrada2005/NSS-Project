/** Type surface for src/utils/deployTailwind.js (node-test-importable JS). */
export const PREVIEW_TAILWIND_VERSION: string;
export const TAILWIND_V4_POSTCSS: string;
export function toTailwindV4Css(css: string): string;
export function toTailwindV4PackageJson(raw: string): string;
export function withPreviewTailwindBuild<T extends Record<string, string> | null | undefined>(files: T): T;
export function fontLinksFromIndexHtml(html: string): string;
