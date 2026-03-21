/**
 * server/compiler.js
 * Server-side TypeScript/JSX compilation pipeline using @babel/standalone.
 * Mirrors the logic from src/services/BrowserCompiler.ts adapted for Node.js.
 */

import * as Babel from '@babel/standalone';

// ---------------------------------------------------------------------------
// Inline preview client script (mirrors src/utils/previewClient.ts)
// ---------------------------------------------------------------------------

const PREVIEW_CLIENT_SCRIPT = `
(function() {
  console.log('Preview Client Active');
  let currentMode = 'interaction';
  let selectedElement = null;
  let hoverRafId = null;

  function getLayoutContext(element) {
    const computedStyle = window.getComputedStyle(element);
    const parent = element.parentElement;
    const parentComputedStyle = parent ? window.getComputedStyle(parent) : { display: 'block', position: 'static' };
    return {
      display: computedStyle.display,
      position: computedStyle.position,
      parentDisplay: parentComputedStyle.display,
      parentPosition: parentComputedStyle.position,
      offsetTop: element.offsetTop,
      offsetLeft: element.offsetLeft,
      offsetWidth: element.offsetWidth,
      offsetHeight: element.offsetHeight,
    };
  }

  window.addEventListener('message', (event) => {
    if (event.data.type === 'set-mode') {
      currentMode = event.data.mode;
    } else if (event.data.type === 'scroll-element') {
      const { tagName, className } = event.data;
      if (!tagName) return;
      const elements = document.getElementsByTagName(tagName);
      for (const el of elements) {
        if (className) {
          const normalize = (s) => s.split(/\\s+/).filter(Boolean).sort().join(' ');
          if (normalize(el.className) === normalize(className)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        } else {
          if (!el.className) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
          }
        }
      }
    } else if (event.data.type === 'select-parent') {
      if (selectedElement && selectedElement.parentElement) {
        const parent = selectedElement.parentElement;
        if (parent.tagName === 'HTML') return;
        selectedElement = parent;
        const rect = parent.getBoundingClientRect();
        const layoutContext = getLayoutContext(parent);
        window.parent.postMessage({ type: 'element-clicked', tagName: parent.tagName.toLowerCase(), className: parent.className, innerText: parent.innerText, hasChildren: parent.children.length > 0, dataOid: parent.getAttribute('data-oid'), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, layoutContext }, '*');
      }
    } else if (event.data.type === 'get-element-at') {
      const { x, y } = event.data;
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null;
        const element = document.elementFromPoint(x, y);
        if (element) {
          const rect = element.getBoundingClientRect();
          const layoutContext = getLayoutContext(element);
          window.parent.postMessage({ type: 'element-response', tagName: element.tagName.toLowerCase(), className: element.className, innerText: element.innerText, hasChildren: element.children.length > 0, dataOid: element.getAttribute('data-oid'), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, layoutContext }, '*');
        }
      });
    } else if (event.data.type === 'find-element-at-point') {
      const { x, y } = event.data;
      const element = document.elementFromPoint(x, y);
      if (element) {
        selectedElement = element;
        const rect = element.getBoundingClientRect();
        const layoutContext = getLayoutContext(element);
        window.parent.postMessage({ type: 'element-clicked', tagName: element.tagName.toLowerCase(), className: element.className, innerText: element.innerText, hasChildren: element.children.length > 0, dataOid: element.getAttribute('data-oid'), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, layoutContext }, '*');
      }
    } else if (event.data.type === 'navigate') {
      window.history.pushState({}, '', event.data.path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  });

  window.addEventListener('mouseover', (event) => {
    if (currentMode === 'visual') {
      event.stopPropagation();
      if (hoverRafId !== null) cancelAnimationFrame(hoverRafId);
      const element = event.target;
      hoverRafId = requestAnimationFrame(() => {
        hoverRafId = null;
        const rect = element.getBoundingClientRect();
        const layoutContext = getLayoutContext(element);
        window.parent.postMessage({ type: 'element-hovered', tagName: element.tagName.toLowerCase(), className: element.className, innerText: element.innerText, hasChildren: element.children.length > 0, dataOid: element.getAttribute('data-oid'), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, layoutContext }, '*');
      });
    }
  }, true);

  window.addEventListener('click', (event) => {
    if (currentMode === 'visual') {
      event.preventDefault();
      event.stopPropagation();
      const element = event.target;
      selectedElement = element;
      const rect = element.getBoundingClientRect();
      const layoutContext = getLayoutContext(element);
      window.parent.postMessage({ type: 'element-clicked', tagName: element.tagName.toLowerCase(), className: element.className, innerText: element.innerText, hasChildren: element.children.length > 0, dataOid: element.getAttribute('data-oid'), rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, layoutContext }, '*');
    }
  }, true);
})();
`;

// ---------------------------------------------------------------------------
// Path resolution helpers (mirrors BrowserCompiler.ts)
// ---------------------------------------------------------------------------

function resolveRelativePath(fromFile, importPath, files) {
  const dir = fromFile.includes('/') ? fromFile.split('/').slice(0, -1).join('/') : '';
  let combined = dir ? `${dir}/${importPath}` : importPath;
  const parts = combined.split('/');
  const normalized = [];
  for (const part of parts) {
    if (part === '..') { normalized.pop(); }
    else if (part !== '.') { normalized.push(part); }
  }
  const resolved = normalized.join('/');
  if (files[resolved]) return resolved;
  const extensions = ['.tsx', '.ts', '.jsx', '.js'];
  for (const ext of extensions) {
    if (files[resolved + ext]) return resolved + ext;
    if (files[`${resolved}/index${ext}`]) return `${resolved}/index${ext}`;
  }
  return null;
}

function resolveAliasPath(importPath, files) {
  if (importPath.startsWith('@/')) {
    const withSrc = 'src/' + importPath.slice(2);
    if (files[withSrc]) return withSrc;
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];
    for (const ext of extensions) {
      if (files[withSrc + ext]) return withSrc + ext;
    }
    return withSrc;
  }
  return null;
}

function resolveRequirePaths(code, fromFile, files) {
  return code.replace(/require\(['"]([^'"]+)['"]\)/g, (match, importPath) => {
    if (importPath.startsWith('.')) {
      const resolved = resolveRelativePath(fromFile, importPath, files);
      return resolved ? `require(${JSON.stringify(resolved)})` : match;
    }
    if (importPath.startsWith('@/')) {
      const resolved = resolveAliasPath(importPath, files);
      return resolved ? `require(${JSON.stringify(resolved)})` : match;
    }
    return match;
  });
}

function transformFile(content, filename) {
  const result = Babel.transform(content, {
    filename,
    presets: [
      ['react', { runtime: 'classic' }],
      'typescript',
    ],
    plugins: ['transform-modules-commonjs'],
    retainLines: true,
  });
  return result.code || '';
}

function escapeScriptClose(code) {
  return code.replace(/<\/script>/gi, '<\\/script>');
}

function buildBundleScript(moduleFactories, bootstrapCode) {
  return [
    '(function() {',
    '"use strict";',
    '',
    'var __modules = {};',
    'var __cache = {};',
    '',
    'function require(id) {',
    '  if (Object.prototype.hasOwnProperty.call(__cache, id)) return __cache[id];',
    '  if (id === "react") return window.React;',
    '  if (id === "react-dom") return window.ReactDOM;',
    '  if (id === "react-dom/client") return window.ReactDOM;',
    '  if (id === "react/jsx-runtime") {',
    '    return { jsx: window.React.createElement, jsxs: window.React.createElement, Fragment: window.React.Fragment };',
    '  }',
    '  if (id === "lucide-react") return window.__lucideReact || {};',
    '  if (id === "react-router-dom") return window.__reactRouterDom || {};',
    '  if (__modules[id]) {',
    '    var m = { exports: {} };',
    '    __cache[id] = m.exports;',
    '    __modules[id](m, m.exports, require);',
    '    __cache[id] = m.exports;',
    '    return m.exports;',
    '  }',
    '  console.warn("[Preview] Module not found:", id);',
    '  return {};',
    '}',
    '',
    moduleFactories.join('\n\n'),
    '',
    'try {',
    bootstrapCode,
    '} catch(e) {',
    '  var root = document.getElementById("root");',
    '  if (root) root.innerHTML = "<div style=\\"color:red;padding:20px;font-family:monospace;background:#1a0000\\">Preview error: " + e.message + "<br><pre>" + e.stack + "</pre></div>";',
    '  console.error("[Preview] Bootstrap error:", e);',
    '}',
    '',
    '})();',
  ].join('\n');
}

function generateHTML(bundleScript) {
  const parts = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <script src="https://cdn.tailwindcss.com"><\/script>',
    '  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>',
    '  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>',
    '  <style>body{margin:0;}#root{min-height:100vh;}<\/style>',
    '<\/head>',
    '<body>',
    '  <div id="root"><\/div>',
    '  <script>',
    bundleScript,
    '  <\/script>',
    '  <script>',
    PREVIEW_CLIENT_SCRIPT,
    '  <\/script>',
    '<\/body>',
    '<\/html>',
  ];
  return parts.join('\n');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateErrorHTML(message, stack) {
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <style>',
    '    body{background:#0a0a0f;color:#fff;font-family:system-ui;padding:40px;margin:0;}',
    '    h1{color:#ef4444;font-size:1.5rem;margin-bottom:16px;}',
    '    pre{background:#111;border:1px solid #333;padding:16px;border-radius:8px;overflow:auto;font-size:12px;color:#f87171;white-space:pre-wrap;}',
    '  <\/style>',
    '<\/head>',
    '<body>',
    '  <h1>Compilation Error<\/h1>',
    `  <pre>${escapeHtml(message)}${stack ? '\n\n' + escapeHtml(stack) : ''}<\/pre>`,
    '<\/body>',
    '<\/html>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a files object { [path]: content } into HTML.
 * Returns { html } on success or { error } on failure.
 */
export function compileFiles(filesObj) {
  const entryPoint =
    filesObj['src/App.tsx'] ? 'src/App.tsx' :
    filesObj['src/main.tsx'] ? 'src/main.tsx' :
    null;

  if (!entryPoint) {
    return { error: 'No entry point found. Expected src/App.tsx or src/main.tsx.' };
  }

  try {
    const moduleFactories = [];

    for (const [filePath, content] of Object.entries(filesObj)) {
      if (
        filePath.includes('node_modules') ||
        filePath.includes('dist/') ||
        filePath.endsWith('.css') ||
        filePath.endsWith('.svg') ||
        filePath.endsWith('.png') ||
        filePath.endsWith('.jpg') ||
        filePath.endsWith('.json') ||
        filePath.endsWith('.md') ||
        filePath.endsWith('.lock') ||
        filePath.endsWith('.html')
      ) continue;

      const isCode =
        filePath.endsWith('.tsx') || filePath.endsWith('.ts') ||
        filePath.endsWith('.jsx') || filePath.endsWith('.js');

      if (!isCode) continue;

      try {
        let transformed = transformFile(content, filePath);
        transformed = resolveRequirePaths(transformed, filePath, filesObj);
        transformed = escapeScriptClose(transformed);
        moduleFactories.push(
          `__modules[${JSON.stringify(filePath)}] = function(module, exports, require) {\n${transformed}\n};`
        );
      } catch (err) {
        const msg = err?.message || String(err);
        console.warn(`[ServerCompiler] Skipping ${filePath}:`, msg);
        moduleFactories.push(
          `__modules[${JSON.stringify(filePath)}] = function(module, exports) { console.error(${JSON.stringify('[Preview] Failed to compile ' + filePath + ': ' + msg)}); };`
        );
      }
    }

    const isMain = entryPoint === 'src/main.tsx';
    const bootstrapCode = isMain
      ? `require(${JSON.stringify(entryPoint)});`
      : [
          `var _entry = require(${JSON.stringify(entryPoint)});`,
          `var AppComponent = _entry.default || _entry;`,
          `var root = document.getElementById('root');`,
          `if (window.ReactDOM && window.ReactDOM.createRoot) {`,
          `  window.ReactDOM.createRoot(root).render(window.React.createElement(AppComponent));`,
          `} else if (window.ReactDOM) {`,
          `  window.ReactDOM.render(window.React.createElement(AppComponent), root);`,
          `}`,
        ].join('\n');

    const bundleScript = buildBundleScript(moduleFactories, bootstrapCode);
    return { html: generateHTML(bundleScript) };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}
