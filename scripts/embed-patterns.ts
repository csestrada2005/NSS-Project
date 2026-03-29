import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
// Default to Gemini 768-dim model
const EMBEDDING_MODEL_NAME =
  process.env.EMBEDDING_MODEL_NAME ?? 'models/gemini-embedding-001';
const EMBEDDING_DIM = 768; // gemini-embedding-001 produces 768-dimensional vectors

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL) throw new Error('Missing env var: SUPABASE_URL');
if (!SUPABASE_SERVICE_KEY) throw new Error('Missing env var: SUPABASE_SERVICE_KEY');
if (!GEMINI_API_KEY) throw new Error('Missing env var: GEMINI_API_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${EMBEDDING_MODEL_NAME}:embedContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL_NAME,
      content: { parts: [{ text }] },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { embedding: { values: number[] } };
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `Unexpected embedding shape: expected ${EMBEDDING_DIM} values, got ${values?.length}`
    );
  }
  return values;
}

async function main() {
  const { data: patterns, error: fetchError } = await supabase
    .from('forge_patterns')
    .select('id, name, category, description, tags')
    .is('embedding', null);

  if (fetchError) {
    throw new Error(`Failed to fetch patterns: ${fetchError.message}`);
  }

  if (!patterns || patterns.length === 0) {
    console.log('No patterns with missing embeddings found.');
    return;
  }

  console.log(`Found ${patterns.length} pattern(s) without embeddings.\n`);

  let succeeded = 0;
  let failed = 0;

  for (const pattern of patterns) {
    const embedInput = `${pattern.name}. Category: ${pattern.category}. ${pattern.description}. Tags: ${(pattern.tags as string[]).join(', ')}.`;

    try {
      const values = await generateEmbedding(embedInput);

      const { error: updateError } = await supabase
        .from('forge_patterns')
        .update({ embedding: values })
        .eq('id', pattern.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      console.log(`✓ ${pattern.name}`);
      succeeded++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${pattern.name}: ${message}`);
      failed++;
    }

    // 250ms delay between requests to avoid Gemini rate limits
    await sleep(250);
  }

  console.log(`\nFinished: ${succeeded} succeeded, ${failed} failed.`);
}

main();
