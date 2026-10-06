/** Type surface for src/utils/deployFavicon.js (node-test-importable JS). */
export const FAVICON_32_PATH: string;
export const APPLE_TOUCH_ICON_PATH: string;
export function withCustomFaviconLinks(html: string): string;
export function withCustomFavicon<T extends Record<string, string | Uint8Array> | null | undefined>(
  files: T,
  icon: { png32: Uint8Array; png180: Uint8Array } | null | undefined
): T;
