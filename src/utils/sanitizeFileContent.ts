// ---------------------------------------------------------------------------
// sanitizeFileContent
// ---------------------------------------------------------------------------
// Models sometimes emit the file path as the first line of the file content
// (e.g. "src/components/HeroSection.tsx" with no leading //). esbuild transpiles
// that bare path as a valid division expression, and the preview then crashes at
// runtime with errors like "ReferenceError: src is not defined". Strip that
// leading path line before the content is verified or written.

export function sanitizeFileContent(content: string): string {
  const lines = content.split('\n');
  const firstIdx = lines.findIndex(l => l.trim().length > 0);
  if (firstIdx === -1) return content;
  const first = lines[firstIdx].trim();
  // Ruta pelona como sentencia: src/..., public/..., ./src/..., con extensión de código
  if (/^\.?\/?(src|public)\/[\w\/.\-]+\.(tsx|ts|jsx|js|css|json);?$/.test(first)) {
    lines.splice(firstIdx, 1);
    return lines.join('\n');
  }
  return content;
}
