import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 2026-10-08 (Samuel): los avisos del navegador ("<dominio> says…") no tienen
// el diseño de Wyrd. Se usan wyrdConfirm / wyrdPrompt (src/components/ui/wyrdDialog.tsx).

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

test('ningún archivo de src/ usa window.confirm / alert / prompt', () => {
  const hits = walk('src').flatMap((file) =>
    readFileSync(file, 'utf8').split('\n')
      .map((line, i) => ({ file, line: i + 1, text: line }))
      .filter(({ text }) => /\bwindow\.(confirm|alert|prompt)\s*\(/.test(text) && !/^\s*(\/\/|\*)/.test(text))
  );
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line}`), []);
});
