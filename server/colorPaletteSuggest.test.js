import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPalettes } from '../src/utils/colorPaletteSuggest.js';

// ---------------------------------------------------------------------------
// Onboarding de proyecto, ítem 2 bucket 5 (mockup D) — "Sugerido por el
// prompt" debe mostrar paletas REALES de la tabla `colors` (DB principal de
// Wyrd), nunca inventadas. Este archivo prueba sólo el ranking puro: qué
// product_type entra y en qué orden, dado un prompt y las filas de
// products/colors ya cargadas (la carga en sí es responsabilidad del
// componente, no de este módulo).
// ---------------------------------------------------------------------------

const PRODUCTS = [
  { product_type: 'SaaS (General)', keywords: 'saas, dashboard, software, subscription' },
  { product_type: 'Coffee Shop', keywords: 'coffee, cafe, espresso, barista, latte' },
  { product_type: 'Subscription Box Service', keywords: 'subscription box, monthly box, curated, unboxing' },
  { product_type: 'Luxury/Premium Brand', keywords: 'luxury, premium, exclusive, high-end' },
];

const COLORS = [
  {
    product_type: 'SaaS (General)',
    primary_color: '#2563EB', secondary_color: '#3B82F6', accent: '#F97316',
    background: '#F8FAFC', foreground: '#1E293B', muted: '#E2E8F0',
    notes: 'Trust blue + orange CTA contrast',
  },
  {
    product_type: 'Coffee Shop',
    primary_color: '#78350F', secondary_color: '#92400E', accent: '#FBBF24',
    background: '#FEF3C7', foreground: '#451A03', muted: '#FDE68A',
    notes: 'Coffee brown + warm gold',
  },
  {
    product_type: 'Subscription Box Service',
    primary_color: '#D946EF', secondary_color: '#E879F9', accent: '#F97316',
    background: '#FDF4FF', foreground: '#86198F', muted: '#F5D0FE',
    notes: 'Excitement purple + urgency orange',
  },
  // Luxury/Premium Brand deliberadamente SIN fila en colors — prueba el
  // caso "product_type sin color correspondiente, se ignora".
];

test('suggestPalettes — un prompt de cafetería ordena Coffee Shop primero, con sus colores reales', () => {
  const result = suggestPalettes(
    'A landing page for a coffee shop, espresso and latte, warm and cozy',
    PRODUCTS,
    COLORS,
    3
  );
  assert.equal(result[0].productType, 'Coffee Shop');
  assert.equal(result[0].colors.primary, '#78350F');
  assert.equal(result[0].notes, 'Coffee brown + warm gold');
});

test('suggestPalettes — un término genérico compartido (ej. "subscription") no basta para ganarle a un match más específico', () => {
  // "coffee" es una señal más específica de Coffee Shop que "subscription" lo
  // es de SaaS (General) — ambos matchean un solo término, pero el bonus de
  // product_type ("coffee shop" en el prompt) debe desempatar a favor del más
  // relevante en vez de caer en el orden de la tabla.
  const result = suggestPalettes(
    'building a coffee shop with a subscription option for regulars',
    PRODUCTS,
    COLORS,
    3
  );
  assert.equal(result[0].productType, 'Coffee Shop');
});

test('suggestPalettes — matchea por keywords ademas del product_type literal', () => {
  const result = suggestPalettes('we need a monthly curated box for pet toys', PRODUCTS, COLORS, 3);
  assert.ok(result.some((p) => p.productType === 'Subscription Box Service'));
});

test('suggestPalettes — un product_type sin fila en colors se ignora, nunca revienta', () => {
  const result = suggestPalettes('a luxury premium exclusive brand', PRODUCTS, COLORS, 3);
  assert.ok(!result.some((p) => p.productType === 'Luxury/Premium Brand'));
});

test('suggestPalettes — respeta el limit', () => {
  const result = suggestPalettes('saas dashboard coffee cafe subscription box monthly curated', PRODUCTS, COLORS, 2);
  assert.equal(result.length, 2);
});

test('suggestPalettes — prompt vacío o sin match devuelve []', () => {
  assert.deepEqual(suggestPalettes('', PRODUCTS, COLORS, 3), []);
  assert.deepEqual(suggestPalettes('xyz completely unrelated zzz', PRODUCTS, COLORS, 3), []);
});

test('suggestPalettes — entradas no-array no revientan', () => {
  assert.deepEqual(suggestPalettes('coffee', null, COLORS, 3), []);
  assert.deepEqual(suggestPalettes('coffee', PRODUCTS, undefined, 3), []);
});
