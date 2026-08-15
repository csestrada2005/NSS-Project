// SQL note: ALTER TABLE payments ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES deals(id);
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dns from 'dns/promises';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { compileFiles } from './server/compiler.js';
import { searchUnsplash } from './server/unsplash.js';
import { computeCreditsFromTokens } from './server/credits.js';
import { createIntentAccumulator } from './server/intentAccumulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Environment variables (read once at startup)
// ---------------------------------------------------------------------------
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_PSI_KEY = process.env.GOOGLE_PSI_KEY;
const CLOUDFLARE_API_KEY = process.env.CLOUDFLARE_API_KEY;
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_MANAGEMENT_TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
const SUPABASE_ORG_ID = process.env.SUPABASE_ORG_ID;
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'default-secret-32-chars-padding!!';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Unsplash access key — used ONLY here on the server to build a per-project pool
// of real, described photos. It must never reach the repo or the client.
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Add static serving for vendor directory (e.g. for iframe preview dependencies)
app.use('/vendor', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'public/vendor')));

// ---------------------------------------------------------------------------
// Supabase admin client (for auth validation and platform DB operations)
// ---------------------------------------------------------------------------
let supabaseAdmin = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Intent accumulator (CIRUGÍA: cobro dentro del pipeline servido). Every
// /api/chat-forge request tagged with x-forge-intent-id folds its tokens here;
// the charge is applied SERVER-SIDE (see chargeAccumulatedIntent + sweepIntents
// below), never from a client trigger. See server/intentAccumulator.js.
// ---------------------------------------------------------------------------
const intentAccumulator = createIntentAccumulator();

// ---------------------------------------------------------------------------
// AES-256 encryption helpers (for storing service role keys)
// ---------------------------------------------------------------------------
function encryptAES256(text) {
  const key = crypto.scryptSync(ENCRYPTION_SECRET, 'nebu-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptAES256(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(':');
  const key = crypto.scryptSync(ENCRYPTION_SECRET, 'nebu-salt', 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '50mb' }));

// 1. Force HTTPS
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// 2. Security headers (required for WebContainers)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// ---------------------------------------------------------------------------
// Auth middleware — validates Supabase session for all /api/* routes.
// All /api/* routes require auth. Ownership checks are done per-endpoint.
//
// Fail-closed (CAMBIO 1): if the admin client is not configured we can NOT
// verify tokens. In any deployed environment (NODE_ENV=production, or Render,
// which sets the RENDER env var) that MUST be a hard 503 — never a silent
// next() that would let unauthenticated requests through. The auth skip only
// survives in an explicit local-dev context where neither flag is present.
// ---------------------------------------------------------------------------
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  if (!supabaseAdmin) {
    if (IS_PRODUCTION) {
      // Fail closed: we cannot verify the session, so refuse to serve it.
      console.error('[Auth] supabaseAdmin unavailable in a production environment — refusing request (503).');
      return res.status(503).json({ error: 'Auth unavailable' });
    }
    // Local dev only (no NODE_ENV=production, no RENDER): skip auth check.
    req.userId = null;
    return next();
  }
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = user;
    req.userId = user.id;
    next();
  } catch (err) {
    console.error('[Auth] Error verifying token:', err);
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// ---------------------------------------------------------------------------
// Ownership helper (CAMBIO 2) — verifies that the authenticated user owns the
// given forge project. Today ownership means forge_projects.user_id === userId.
// (Collaborators with an "edit" role will be added here when that feature is
// actually implemented — for now only the owner passes.)
//
// Returns true when the caller may proceed. On any failure it writes the
// appropriate status/body to `res` and returns false, so callers do:
//     if (!(await requireProjectOwnership(req, res, projectId))) return;
// ---------------------------------------------------------------------------
async function requireProjectOwnership(req, res, projectId) {
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return false;
  }
  if (!supabaseAdmin) {
    // No admin client. In production requireAuth already 503'd before we get
    // here; in local dev there is no ownership data to check against.
    if (IS_PRODUCTION) {
      res.status(503).json({ error: 'Auth unavailable' });
      return false;
    }
    return true;
  }
  const { data: project, error } = await supabaseAdmin
    .from('forge_projects')
    .select('user_id')
    .eq('id', projectId)
    .single();

  if (error || !project) {
    res.status(404).json({ error: 'Project not found' });
    return false;
  }
  if (project.user_id !== req.userId) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Stripe webhook — must be registered BEFORE auth middleware and json parser
// because it needs raw body for signature verification
// ---------------------------------------------------------------------------
app.post('/api/credits/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const STRIPE_SECRET_KEY_WH = process.env.STRIPE_SECRET_KEY;
  const STRIPE_WEBHOOK_SECRET_WH = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY_WH || !STRIPE_WEBHOOK_SECRET_WH) {
    return res.status(503).json({ error: 'Payments not configured' });
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(STRIPE_SECRET_KEY_WH);
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET_WH);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, credits } = session.metadata || {};

    if (userId && credits && supabaseAdmin) {
      const creditsNum = parseInt(credits, 10);
      try {
        await supabaseAdmin.from('forge_credit_transactions').insert({
          user_id: userId,
          project_id: null,
          type: 'purchase',
          amount_credits: creditsNum,
          cost_usd: session.amount_total ? session.amount_total / 100 : null,
          stripe_payment_intent_id: session.payment_intent,
          tokens_input: 0,
          tokens_output: 0,
        });

        const { data: wallet } = await supabaseAdmin
          .from('forge_credit_wallets')
          .select('balance_credits')
          .eq('user_id', userId)
          .single();

        const currentBalance = wallet?.balance_credits ?? 0;
        await supabaseAdmin.from('forge_credit_wallets').upsert({
          user_id: userId,
          balance_credits: currentBalance + creditsNum,
          free_prompt_used: true,
        });

        console.log(`[Stripe] Credited ${creditsNum} credits to user ${userId}`);
      } catch (err) {
        console.error('[Stripe] Failed to process webhook:', err);
        return res.status(500).json({ error: 'Failed to process payment' });
      }
    }

    if (session.metadata?.type === 'deposit') {
      const { dealId, developerId, paymentId } = session.metadata;
      if (dealId && developerId && supabaseAdmin) {
        await supabaseAdmin.from('payments').update({ status: 'paid' }).eq('id', paymentId);
        await supabaseAdmin.from('deals')
          .update({ deposit_paid: true, status: 'closed_won', stage: 'closed_won' })
          .eq('id', dealId);

        const { data: deal } = await supabaseAdmin
          .from('deals')
          .select('title, scope_description, client_profile_id, value')
          .eq('id', dealId)
          .single();

        if (deal) {
          const { data: project } = await supabaseAdmin
            .from('forge_projects')
            .insert({
              user_id: developerId,
              name: deal.title,
              description: deal.scope_description ?? '',
              initial_prompt: deal.scope_description ?? '',
            })
            .select('id')
            .single();

          if (project) {
            await supabaseAdmin.from('deals').update({ forge_project_id: project.id }).eq('id', dealId);
            await supabaseAdmin.from('notifications').insert({
              user_id: developerId,
              type: 'deposit_paid',
              title: 'Deposit received — project created!',
              body: `The 50% deposit for "${deal.title}" was paid. A new Forge project has been created.`,
              read: false,
            });
            if (deal.client_profile_id) {
              await supabaseAdmin.from('notifications').insert({
                user_id: deal.client_profile_id,
                type: 'project_created',
                title: 'Your project has started!',
                body: `The deposit was confirmed and your project "${deal.title}" has been created.`,
                read: false,
              });
            }
          }
        }
      }
    }
  }

  res.status(200).send('OK');
});


// Apply auth middleware to all /api/* routes
app.use("/api/", requireAuth);

// ---------------------------------------------------------------------------
// Phase 1: Existing AI routes
// ---------------------------------------------------------------------------

app.post('/api/ai-action', async (req, res) => {
  try {
    const { userPrompt, selectedElementContext } = req.body;
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: "You are an expert React/Tailwind developer. You receive a user command and a selected HTML element. Return ONLY a JSON object with: { 'action': 'update-style' | 'update-text', 'className': '...', 'text': '...' }. Do not return markdown.",
      messages: [{ role: 'user', content: `Context: ${selectedElementContext}. Command: ${userPrompt}` }],
    });
    const contentBlock = msg.content.find(c => c.type === 'text');
    if (!contentBlock) throw new Error('No text content in response');
    let content = contentBlock.text;
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();
    const json = JSON.parse(content);
    res.json(json);
  } catch (error) {
    console.error('Error in /api/ai-action:', error);
    res.status(500).json({ error: 'Failed to process AI action' });
  }
});

const WYRD_SYSTEM_PROMPT = `You are Wyrd, an expert AI web builder. You help users build React + TypeScript + Tailwind CSS applications inside the Wyrd Forge IDE.

Your core identity and rules:

You are a code generation engine, not a conversational assistant. Never respond with prose, explanations, or suggestions unless explicitly asked.
You always produce complete, working file contents. Never truncate, never use placeholder comments.
Stack: React 18, TypeScript, Tailwind CSS, Vite, react-router-dom v6, Supabase via SupabaseService.getInstance().client
Imports: use @/ alias for src/ directory (e.g. import { X } from '@/components/X')
Supabase pattern: import { SupabaseService } from '@/services/SupabaseService'; const supabase = SupabaseService.getInstance().client;
Never modify package.json, vite.config.ts, or tsconfig.json unless explicitly asked
Never create test files, story files, or documentation files unless explicitly asked
When given a system prompt by a specific service (Architect, IntentClassifier, Implementer), that service's system prompt is authoritative and overrides general behavior`;

const NOVY_SYSTEM_PROMPT = `You are Novy, an intelligent business operating system assistant for Nebu Studio System. You help business owners and their teams manage their operations efficiently.
Your capabilities and knowledge areas:
- Project management: tracking active/completed/paused projects, milestones, client assignments
- CRM & contacts: leads, clients, partners — their status, pipeline stage, and relationship history
- Finance: payments (pending/paid/overdue), monthly revenue, invoices, cash flow analysis
- Sales pipeline: deals, stages (prospecting → qualification → proposal → negotiation → closed), probability-weighted forecasting
- Team management: user roles (admin, dev, vendedor, cliente), notifications, approvals
- Analytics: website metrics, ad performance (Meta Ads), Google Analytics data interpretation
- AI Reports: when asked to generate a report or summary, produce a thorough, well-structured markdown report with sections, bullet points, and data-driven insights. Use ## for section headers, - for lists, and **bold** for key metrics.
Your communication style:
- Professional but warm and conversational
- Bilingual: respond in the same language the user writes in (Spanish or English)
- Data-focused: always try to reference specific numbers, percentages, or trends when discussing business metrics
- Actionable: end responses with concrete next steps or recommendations when relevant
- Concise for simple questions, detailed for reports and analysis
When generating AI Reports (user asks for a report, summary, or analysis):
- Structure with clear ## sections
- Include an Executive Summary at the top
- Use specific metrics and timeframes
- Highlight risks and opportunities
- End with Recommended Actions
You have access to the Nebu business OS data through the user's questions. Be helpful, accurate, and business-focused.`;

const REPORT_KEYWORDS = ['report', 'reporte', 'summary', 'resumen', 'analyze', 'analiza', 'generate', 'genera'];

app.post('/api/chat', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: API Key missing.' });
  }
  try {
    const { messages } = req.body;

    const latestUserMessage = [...(messages || [])].reverse().find(m => m.role === 'user');
    const latestContent = (latestUserMessage?.content ?? '').toLowerCase();
    const isReport = REPORT_KEYWORDS.some(kw => latestContent.includes(kw));

    const model = isReport ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    const max_tokens = isReport ? 4096 : 2048;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens,
        system: NOVY_SYSTEM_PROMPT,
        messages,
      }),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error('Error proxying to Anthropic:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ---------------------------------------------------------------------------
// TELEMETRIA DE REPAIRS
//
// El batch repair del Verifier resolvió una vez un export/import mismatch
// BORRANDO el import y la ruta en el consumidor en vez de añadir el export que
// faltaba en el módulo: compiló limpio y amputó la funcionalidad en silencio.
// Nada en el log de Render lo delataba. Este helper añade a la línea de la
// pasada de repair qué archivos ORIGINARON el error y qué archivos acabó
// TOCANDO el modelo, para que la divergencia entre ambos sea evidente sin
// inspección manual.
//
// error_files    — cabecera x-forge-repair-error-files (los que esbuild culpó).
// modified_files — se derivan comparando los bloques ===FILE:...===END=== que
//                  el modelo devolvió contra los que se le enviaron: un archivo
//                  devuelto idéntico no cuenta como modificado. Se calculan aquí
//                  y no en el cliente para que el log refleje lo que el modelo
//                  realmente escribió, no lo que el cliente afirma.
//
// Devuelve '' (cadena vacía) para cualquier llamada que no sea de repair, así
// que el resto del log de /api/chat-forge queda intacto.
// ---------------------------------------------------------------------------
const REPAIR_FILE_BLOCK_RE = /===FILE:\s*(.+?)\s*===\r?\n([\s\S]*?)\r?\n===END===/g;

function parseRepairFileBlocks(text) {
  const out = new Map();
  if (typeof text !== 'string') return out;
  REPAIR_FILE_BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = REPAIR_FILE_BLOCK_RE.exec(text)) !== null) {
    const path = m[1].trim();
    if (path) out.set(path, m[2]);
  }
  return out;
}

function buildRepairTelemetry(req, messages, data) {
  const header = req.headers['x-forge-repair-error-files'];
  if (!header) return '';

  const errorFiles = String(header)
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  // Bloques ENVIADOS: el único mensaje de usuario que emite fixBatch.
  const sent = new Map();
  for (const msg of Array.isArray(messages) ? messages : []) {
    if (typeof msg?.content === 'string') {
      for (const [path, content] of parseRepairFileBlocks(msg.content)) {
        sent.set(path, content);
      }
    }
  }

  // Bloques DEVUELTOS por el modelo.
  const returned = parseRepairFileBlocks(data?.content?.[0]?.text ?? '');

  // Modificado = devuelto con contenido distinto del enviado (o path nuevo).
  const modified = [];
  for (const [path, content] of returned) {
    const before = sent.get(path);
    if (before === undefined || before.trim() !== content.trim()) modified.push(path);
  }

  const fmt = (arr) => `[${arr.join(',')}]`;
  return ` [repair] error_files=${fmt(errorFiles)} modified_files=${fmt(modified)}`;
}

app.post('/api/chat-forge', async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key missing' });
  }
  // ---------------------------------------------------------------------------
  // Chaos hook (PIEZA 4) — synthetic 529 for testing Implementer step retries.
  // Double lock so it can never fire in production by accident:
  //   1. FORGE_CHAOS_ENABLED=true must be set in the server env (absent on
  //      Render → this whole block is inert regardless of headers).
  //   2. The request must carry header 'x-forge-chaos: overloaded' (the client
  //      only attaches it while localStorage 'forge_chaos_529' is a positive
  //      counter — see Implementer.callStepWithRetry).
  // ---------------------------------------------------------------------------
  if (req.headers['x-forge-chaos']) {
    console.log('[chat-forge] CHAOS header recibido. FORGE_CHAOS_ENABLED=',
      process.env.FORGE_CHAOS_ENABLED);
  }
  if (process.env.FORGE_CHAOS_ENABLED === 'true'
      && req.headers['x-forge-chaos'] === 'overloaded') {
    console.log('[chat-forge] CHAOS: sirviendo 529 sintético');
    return res.status(529).json({ type: 'error',
      error: { type: 'overloaded_error', message: 'Chaos: synthetic 529' } });
  }
  try {
    const { model, max_tokens, system, messages } = req.body;

    // Each Forge service sends its own system prompt — respect it exactly.
    // Fall back to WYRD_SYSTEM_PROMPT only if no system prompt provided.
    const resolvedSystem = system || WYRD_SYSTEM_PROMPT;
    const resolvedModel = model || 'claude-sonnet-4-6';
    const resolvedMaxTokens = max_tokens || 8192;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: resolvedMaxTokens,
        system: resolvedSystem,
        messages,
      }),
    });

    const data = await response.json();
    // Contabilidad completa de tokens (Fase Previa #1): sin output ni cache no hay
    // antes/después medible del prompt caching. cache_read_input_tokens es lo que
    // se sirvió DESDE la caché (ahorro real); cache_creation_input_tokens es lo que
    // se ESCRIBIÓ a la caché en esta llamada (coste único del primer prefijo).
    const u = data.usage ?? {};
    // CAMBIO 2 (fase 2) — el modo del step del Implementer (diff|full|fallback)
    // viaja como header x-forge-step-mode y se refleja aquí para medir en Render
    // el ahorro de output por modo. Ausente en llamadas que no son de step
    // (Architect, Verifier, simple lane) → se omite del log.
    const stepMode = req.headers['x-forge-step-mode'];
    // TELEMETRIA DE REPAIRS — sufijo sólo en las pasadas de reparación por lotes
    // (las que traen x-forge-repair-error-files). Ausente en cualquier otra
    // llamada, así que el resto del log queda byte a byte igual.
    const repairSuffix = buildRepairTelemetry(req, messages, data);
    console.log(
      `[chat-forge] model=${resolvedModel} status=${response.status}`
      + ` input_tokens=${u.input_tokens ?? '?'}`
      + ` output_tokens=${u.output_tokens ?? '?'}`
      + ` cache_read=${u.cache_read_input_tokens ?? 0}`
      + ` cache_write=${u.cache_creation_input_tokens ?? 0}`
      + (stepMode ? ` mode=${stepMode}` : '')
      + repairSuffix
    );

    // CIRUGÍA (cobro dentro del pipeline): fold this served request's tokens into
    // its intent so the charge can be applied SERVER-SIDE at close, with no
    // client trigger. Only successful responses carry real usage; a failed /
    // retried call (no usage) contributes nothing. userId comes from the auth
    // middleware — never from the body — so tokens are billed to the real caller.
    const intentId = req.headers['x-forge-intent-id'];
    if (intentId && response.ok) {
      intentAccumulator.accumulate(
        intentId,
        {
          userId: req.userId,
          projectId: req.headers['x-forge-project-id'] || null,
          intentType: req.headers['x-forge-intent-type'] || null,
          tokensInput: u.input_tokens ?? 0,
          tokensOutput: u.output_tokens ?? 0,
        },
        Date.now()
      );
      // Lazy sweep: charge any OTHER intent that has gone idle/expired. Never
      // blocks this response — fire and forget.
      sweepIntents().catch((err) => console.error('[credits] lazy sweep error:', err));
    }

    res.status(response.status).json(data);
  } catch (err) {
    console.error('[chat-forge] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Credits (CIRUGÍA: server-side deduction) — the server charges, the client
// only reads. The client can still READ its own wallet directly (owner_read
// RLS), so balance display stays client-side; but every WRITE (spend / free
// prompt burn) now happens here with the service role, which bypasses RLS by
// design. The client is never trusted for admin/unlimited/free-prompt state —
// all of it is re-derived from the DB on each call.
//
//   POST /api/credits/check   — preflight at intent START. 402 if broke.
//   POST /api/credits/close   — accelerator: close+charge the accumulated intent
//                               now (the sweep does it anyway). 402 on race.
//   POST /api/credits/deduct  — DEPRECATED no-op (charge is server-side now).
//
// The actual deduction is driven by the intent accumulator + sweep (see above):
// every /api/chat-forge request tagged x-forge-intent-id folds its tokens, and
// chargeAccumulatedIntent charges them when the intent closes. No client trigger
// is required — that is the whole point of this cirugía.
// ---------------------------------------------------------------------------

// CAMBIO 2c — preflight floor: a non-admin, non-free-prompt user must hold at
// least this many INTERNAL credit units to start an intent. Below it the
// preflight 402s, so a run can never begin on a balance too small to cover even
// its first served step. The value is in internal units (see DISPLAY_DIVISOR on
// the client for how it is shown to the user).
const CREDIT_PREFLIGHT_FLOOR = 10;

// Has this user ever purchased credits? Used only on the 402 path to pick the
// honest copy: a user who never bought (free prompt spent, balance below floor)
// sees the "free build used" message; anyone who has purchased sees the neutral
// "saldo insuficiente" message. Best-effort — any error resolves to false.
async function hasEverPurchased(userId) {
  if (!userId || !supabaseAdmin) return false;
  try {
    const { data } = await supabaseAdmin
      .from('forge_credit_transactions')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'purchase')
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.error('[credits] hasEverPurchased error:', err);
    return false;
  }
}

// Resolve the authoritative credit context for a user, server-side.
// Returns null on a hard DB error so callers can fail open (never block a
// paying user on a transient blip) — matching the old client-side behavior.
async function getCreditContext(userId) {
  if (!userId || !supabaseAdmin) return null;
  try {
    const [{ data: profile }, { data: wallet }] = await Promise.all([
      supabaseAdmin.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabaseAdmin
        .from('forge_credit_wallets')
        .select('balance_credits, free_prompt_used, unlimited')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);

    const isAdmin = profile?.role === 'admin';
    const unlimited = !!wallet?.unlimited;
    // No wallet row yet → brand-new user with the free prompt still available.
    const freePromptAvailable = !wallet || wallet.free_prompt_used === false;
    const balance = wallet?.balance_credits ?? 0;

    return { isAdmin, unlimited, freePromptAvailable, balance, walletExists: !!wallet };
  } catch (err) {
    console.error('[credits] getCreditContext error:', err);
    return null;
  }
}

// Preflight — checked at the START of an intent, BEFORE the pipeline runs.
app.post('/api/credits/check', async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    // Local-dev-only path (auth skipped) — never block.
    return res.json({ allowed: true, isFreePrompt: false, balance: null });
  }
  const ctx = await getCreditContext(userId);
  if (!ctx) {
    // Fail open on DB unavailability — do not block the user.
    return res.json({ allowed: true, isFreePrompt: false, balance: null });
  }
  if (ctx.isAdmin || ctx.unlimited) {
    return res.json({ allowed: true, isAdmin: true, unlimited: true, balance: null });
  }
  if (ctx.freePromptAvailable) {
    return res.json({ allowed: true, isFreePrompt: true, balance: ctx.balance });
  }
  // CAMBIO 2c — preflight floor: require at least CREDIT_PREFLIGHT_FLOOR internal
  // units (free prompt / admin paths above are intact and bypass this).
  if (ctx.balance >= CREDIT_PREFLIGHT_FLOOR) {
    return res.json({ allowed: true, isFreePrompt: false, balance: ctx.balance });
  }
  // Below the floor, free prompt spent, not an admin → refuse before the pipeline.
  // REMATE — errorReason honesto por ESTADO PRESENTE, no por historial de compra:
  // the old `purchased ? INSUFFICIENT_BALANCE : FREE_PROMPT_SPENT` told any
  // non-purchaser they had spent their free build even when they held a positive
  // balance (e.g. balance=5, free_prompt_used=true → wrongly FREE_PROMPT_SPENT).
  //   balance > 0                          → INSUFFICIENT_BALANCE (has money, below floor)
  //   balance == 0 && purchased            → INSUFFICIENT_BALANCE (bought before, drained)
  //   balance == 0 && !purchased && spent  → FREE_PROMPT_SPENT   (pure free tier, now spent)
  // We only reach here with the free prompt already spent (freePromptAvailable was
  // false above), so the last branch's freePromptUsed condition already holds.
  // Only the balance==0 case needs the purchase-history lookup.
  let reason;
  if (ctx.balance > 0) {
    reason = 'INSUFFICIENT_BALANCE';
  } else {
    const purchased = await hasEverPurchased(userId);
    reason = purchased ? 'INSUFFICIENT_BALANCE' : 'FREE_PROMPT_SPENT';
  }
  return res.status(402).json({
    allowed: false,
    error: 'INSUFFICIENT_CREDITS',
    reason,
    balance: ctx.balance,
    message: 'Saldo insuficiente — recarga créditos para continuar.',
  });
});

// Charge the credits ACCUMULATED for one intent, server-side. This is the sole
// deduction path now — invoked by the idle/TTL sweep and by the explicit-close
// accelerator (/api/credits/close), never with token amounts supplied by the
// client. `rec` is an accumulator record: { userId, projectId, intentType,
// tokensInput, tokensOutput }. Returns a plain result object (no HTTP): the
// caller decides how to surface it.
//
//   { balance, deducted }                    — settled (deducted may be 0)
//   { balance, deducted: 0, unlimited: true } — admin / unlimited, never charged
//   { balance, deducted: 0, freePrompt: true }— free prompt burned instead
//   { balance, deducted: 0, insufficient: true } — race drained the wallet
//   { balance: null, deducted: 0 }            — no user / no admin client / DB down
async function chargeAccumulatedIntent(rec) {
  const userId = rec?.userId;
  const projectId = rec?.projectId ?? null;
  const intentType = rec?.intentType ?? null;
  const tokensInput = rec?.tokensInput ?? 0;
  const tokensOutput = rec?.tokensOutput ?? 0;

  if (!userId) return { balance: null, deducted: 0 };
  if (!supabaseAdmin) return { balance: null, deducted: 0 };

  const ctx = await getCreditContext(userId);
  if (!ctx) return { balance: null, deducted: 0 };

  // "Trabajo servido es trabajo cobrado": served work is any tokens accumulated
  // for the intent (success OR cancelled — the persisted steps stay, so they
  // are charged). Zero tokens means nothing was served; never burn the free
  // prompt or charge for an empty intent.
  const servedWork = tokensInput > 0 || tokensOutput > 0;
  const { creditsToDeduct: rawCredits, totalCostUsd } = computeCreditsFromTokens(
    tokensInput,
    tokensOutput
  );

  try {
    // Admin / unlimited → never charged. Log an admin_usage audit row (0 credits)
    // when there was real usage, then report the (unbounded) balance.
    if (ctx.isAdmin || ctx.unlimited) {
      if (servedWork) {
        await supabaseAdmin.from('forge_credit_transactions').insert({
          user_id: userId,
          project_id: projectId,
          type: 'admin_usage',
          intent_type: intentType,
          amount_credits: 0,
          tokens_input: tokensInput,
          tokens_output: tokensOutput,
          cost_usd: totalCostUsd,
        });
      }
      return { balance: null, deducted: 0, unlimited: true };
    }

    // Empty intent (no served work) → nothing to charge, free prompt untouched.
    if (!servedWork) {
      return { balance: ctx.balance, deducted: 0 };
    }

    // Free prompt still available → burn it instead of charging. Update the flag
    // in place so any existing balance is preserved; only create a fresh wallet
    // (balance 0) when the user has none yet. Never upsert balance_credits here —
    // that would reset a real balance on conflict.
    if (ctx.freePromptAvailable) {
      if (ctx.walletExists) {
        await supabaseAdmin
          .from('forge_credit_wallets')
          .update({ free_prompt_used: true })
          .eq('user_id', userId);
      } else {
        await supabaseAdmin
          .from('forge_credit_wallets')
          .insert({ user_id: userId, balance_credits: 0, free_prompt_used: true });
      }
      return { balance: ctx.balance, deducted: 0, freePrompt: true };
    }

    // Charge floor (PIEZA 6): a non-admin intent that served real work never
    // rounds to 0 credits and slips through free. computeCreditsFromTokens ceils,
    // so any positive token count is already >= 1 credit; Math.max(1, ...) makes
    // that floor explicit and future-proof against a formula change.
    const creditsToDeduct = Math.max(1, rawCredits);

    // Atomic charge. deduct_credits does the balance>=amount guard + audit insert
    // in one round-trip. p_allow_partial=true enables drenar-a-cero (CAMBIO 2):
    // if the wallet no longer holds the full charge but still holds something,
    // it takes everything left (balance→0), records a transaction for the drained
    // amount at the full real cost, and returns partial=true. success=false now
    // means only the balance was already 0 (a concurrent charge fully drained it).
    const { data, error } = await supabaseAdmin.rpc('deduct_credits', {
      p_user_id: userId,
      p_amount: creditsToDeduct,
      p_intent_type: intentType,
      p_project_id: projectId,
      p_tokens_input: tokensInput,
      p_tokens_output: tokensOutput,
      p_cost_usd: totalCostUsd,
      p_allow_partial: true,
    });

    if (error) {
      console.error('[credits] deduct_credits rpc error:', error);
      // Don't fabricate a charge on infra failure; report current balance.
      return { balance: ctx.balance, deducted: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.success) {
      return { balance: row?.new_balance ?? ctx.balance, deducted: 0, insufficient: true };
    }
    if (row.partial) {
      // Drained to zero: charged what remained (the pre-charge balance we read)
      // against the full cost of the served work. new_balance is 0.
      // REMATE — el drain ya no cobra en silencio: se registra el cargo parcial
      // con el usuario para poder rastrearlo en Render (checkpoint del cierre).
      const charged = ctx.balance;
      console.log(`[credits] drained: charged ${charged} of ${creditsToDeduct} (user ${userId})`);
      return { balance: 0, deducted: charged, partial: true };
    }
    return { balance: row.new_balance, deducted: creditsToDeduct };
  } catch (err) {
    console.error('[credits] chargeAccumulatedIntent error:', err);
    return { balance: ctx.balance, deducted: 0 };
  }
}

// Sweep — close and charge every intent that is idle past the window or past
// its TTL. Runs lazily on each accumulate and on a periodic timer, so a charge
// lands even if the client never sends an explicit close (the security fix:
// no client trigger can be withheld to avoid paying). Each record was removed
// from the map by collectExpired, so a concurrent explicit close can't double
// charge it.
let sweepInFlight = false;
async function sweepIntents() {
  if (sweepInFlight) return; // don't overlap a slow DB round-trip with the timer
  sweepInFlight = true;
  try {
    const due = intentAccumulator.collectExpired(Date.now());
    for (const rec of due) {
      try {
        const result = await chargeAccumulatedIntent(rec);
        console.log(
          `[credits] swept intent=${rec.intentId} reason=${rec.closeReason}`
          + ` in=${rec.tokensInput} out=${rec.tokensOutput}`
          + ` deducted=${result.deducted}`
          + (result.unlimited ? ' unlimited' : '')
          + (result.freePrompt ? ' freePrompt' : '')
          + (result.partial ? ' PARTIAL(drained-to-zero)' : '')
          + (result.insufficient ? ' INSUFFICIENT' : '')
        );
      } catch (err) {
        console.error('[credits] sweep charge error:', err);
      }
    }
  } finally {
    sweepInFlight = false;
  }
}

// Periodic backstop so an intent still charges when NO further traffic arrives
// to drive the lazy sweep. unref() so it never keeps the process alive on its
// own. Only meaningful when the admin client can actually write.
if (supabaseAdmin) {
  const sweepTimer = setInterval(() => {
    sweepIntents().catch((err) => console.error('[credits] periodic sweep error:', err));
  }, 30_000);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}

// Explicit close — ACCELERATOR ONLY. The client may call this at intent end so
// the balance refreshes promptly; correctness does not depend on it (the sweep
// charges regardless). Carries NO token amounts — the server charges what it
// accumulated. Deducted server-side, so a client that never calls this (or lies
// about it) still pays via the sweep.
app.post('/api/credits/close', async (req, res) => {
  const { intentId } = req.body || {};
  if (!intentId) {
    return res.status(400).json({ error: 'intentId is required' });
  }
  // Ownership: only the user who opened the intent may close it. Peek first so a
  // mismatched caller can't consume (and thereby discard) another user's record.
  const pending = intentAccumulator.get(intentId);
  if (pending && req.userId && pending.userId && pending.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const rec = intentAccumulator.close(intentId);
  if (!rec) {
    // Unknown or already closed (by a prior call or the sweep) — nothing to do.
    return res.json({ balance: null, deducted: 0, closed: false });
  }
  const result = await chargeAccumulatedIntent(rec);
  if (result.insufficient) {
    return res.status(402).json({
      error: 'INSUFFICIENT_CREDITS',
      balance: result.balance,
      deducted: 0,
      closed: true,
    });
  }
  return res.json({ ...result, closed: true });
});

// DEPRECATED (CIRUGÍA: cobro dentro del pipeline servido). The charge no longer
// depends on a client call. This endpoint is a no-op kept only so an older
// client build cannot 404; it never writes to the wallet. All deduction now
// happens server-side via the intent accumulator + sweep.
app.post('/api/credits/deduct', async (req, res) => {
  return res.json({ balance: null, deducted: 0, deprecated: true });
});

// ---------------------------------------------------------------------------
// Verified image pool — POST /api/images/search
//
// The scaffold calls this with the brief's imagery_keywords to build a pool of
// REAL, described Unsplash photos the model can choose from (instead of
// inventing images.unsplash.com IDs). The access key lives ONLY here, on the
// server. Auth is the shared requireAuth middleware applied to all /api/* routes.
//
// Never 500: on a missing key or any downstream failure we answer { images: [] }
// so the scaffold cleanly falls back to writing DESIGN.md without a pool.
// ---------------------------------------------------------------------------
app.post('/api/images/search', async (req, res) => {
  try {
    if (!UNSPLASH_ACCESS_KEY) {
      return res.json({ images: [] });
    }
    const { keywords } = req.body || {};
    const result = await searchUnsplash({ keywords, accessKey: UNSPLASH_ACCESS_KEY });
    console.log(`[images/search] keywords=${Array.isArray(keywords) ? keywords.length : 0} → ${result.images.length} images`);
    res.json(result);
  } catch (err) {
    console.error('[images/search] Error:', err);
    res.json({ images: [] });
  }
});

// ---------------------------------------------------------------------------
// GET /api/proxy — server-side fetch of external documentation (CAMBIO 3).
//
// Censo (grep '/api/proxy' in src/): the ONLY caller is
// ContextService.fetchDocumentation, invoked by AIOrchestrator for the
// "Read [url]" flow — the user pastes arbitrary public documentation URLs and
// we fetch their text server-side. Because the target host set is open-ended
// (any docs site the user references), a fixed host allowlist would break the
// feature; the real protection here is an SSRF guard:
//   - only http/https schemes (https strongly preferred; http tolerated for
//     docs that still serve plaintext, but see PROXY_ALLOW_HTTP below),
//   - reject literal IP hosts outright,
//   - resolve the hostname and refuse if ANY resolved address is private,
//     loopback, link-local or otherwise non-public (anti DNS-rebinding),
//   - 8s timeout and a 1MB response cap.
// ---------------------------------------------------------------------------

// Private / reserved IP ranges we must never let the proxy reach.
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 127) return true;                         // 127.0.0.0/8 loopback
  if (a === 0) return true;                           // 0.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;            // 192.168.0.0/16
  if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local
  if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                          // multicast / reserved
  return false;
}

function isPrivateIPv6(ip) {
  const addr = ip.toLowerCase().split('%')[0]; // strip zone id
  if (addr === '::1' || addr === '::') return true;   // loopback / unspecified
  if (addr.startsWith('fe80')) return true;           // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true; // unique local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) → validate the embedded v4
  const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip, family) {
  return family === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

// Detect whether a hostname is a bare IP literal (v4 or v6).
function isIpLiteral(host) {
  const h = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (h.includes(':')) return true; // IPv6 literal
  return false;
}

const PROXY_ALLOW_HTTP = process.env.PROXY_ALLOW_HTTP === 'true';
const PROXY_TIMEOUT_MS = 8000;
const PROXY_MAX_BYTES = 1024 * 1024; // 1MB

async function assertSafeProxyTarget(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw { status: 400, message: 'Invalid URL' };
  }

  // (c) scheme allowlist
  if (parsed.protocol !== 'https:' && !(PROXY_ALLOW_HTTP && parsed.protocol === 'http:')) {
    throw { status: 400, message: 'Only https URLs are allowed' };
  }

  const host = parsed.hostname;

  // Block obvious localhost aliases and *.internal / *.local before any lookup.
  const lowered = host.toLowerCase();
  if (
    lowered === 'localhost' ||
    lowered.endsWith('.internal') ||
    lowered.endsWith('.local')
  ) {
    throw { status: 403, message: 'Host not allowed' };
  }

  // (c) reject literal IP hosts outright — docs are served from named hosts.
  if (isIpLiteral(host)) {
    throw { status: 403, message: 'IP-literal hosts are not allowed' };
  }

  // Resolve the hostname and ensure EVERY resolved address is public. This is
  // the anti-rebinding check: a hostname that resolves to 127.0.0.1 / 10.x /
  // 169.254.x etc. is rejected here.
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw { status: 502, message: 'Could not resolve host' };
  }
  if (!addresses.length) {
    throw { status: 502, message: 'Could not resolve host' };
  }
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw { status: 403, message: 'Host resolves to a private address' };
    }
  }
}

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    await assertSafeProxyTarget(url);
  } catch (guard) {
    if (guard && guard.status) {
      return res.status(guard.status).json({ error: guard.message });
    }
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error', // don't silently follow redirects to an internal host
      headers: { 'User-Agent': 'nebu-docs-proxy/1.0' },
    });
    if (!response.ok) {
      return res.status(502).json({ error: `Upstream responded ${response.status}` });
    }

    // (d) 1MB response cap — stream and abort if the body grows past the limit.
    const reader = response.body?.getReader();
    if (!reader) {
      return res.status(502).json({ error: 'Empty response body' });
    }
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > PROXY_MAX_BYTES) {
        controller.abort();
        return res.status(413).json({ error: 'Response exceeds 1MB limit' });
      }
      chunks.push(Buffer.from(value));
    }
    res.type('text/plain').send(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream fetch timed out' });
    }
    console.error('[proxy] Error fetching URL:', error?.message || error);
    res.status(502).json({ error: 'Failed to fetch URL' });
  } finally {
    clearTimeout(timeout);
  }
});

// Phase 1: Platform services check
app.post('/api/platform-check', (req, res) => {
  res.json({
    anthropic: !!ANTHROPIC_API_KEY,
    googlePsi: !!GOOGLE_PSI_KEY,
    cloudflare: !!CLOUDFLARE_API_KEY,
    vercel: !!VERCEL_TOKEN,
    resend: !!RESEND_API_KEY,
    supabase: !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY),
  });
});

// ---------------------------------------------------------------------------
// Phase 2: Server-side compilation
// ---------------------------------------------------------------------------

app.post('/api/compile', async (req, res) => {
  console.log('[compile] endpoint hit, file count:', Object.keys(req.body?.files ?? {}).length);
  req.setTimeout(30000);
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'files object is required' });
  }
  // CAMBIO 5 — observabilidad del compile. Los 502 del gateway (OOM/timeout de
  // Render) NO son logueables por este proceso — mueren en la puerta de enlace —
  // pero sí podemos loguear cada error REAL de compilación y cada compile de
  // duración anómala (>10s), que suele preceder a esos 502 bajo carga.
  const startedAt = Date.now();
  try {
    const result = await compileFiles(files);
    const durationMs = Date.now() - startedAt;
    if (durationMs > 10000) {
      console.warn(`[compile] SLOW: ${durationMs}ms (file count: ${Object.keys(files).length})`);
    }
    if (result.error) {
      // Una línea por error real de compilación (primeras ~200 chars).
      console.error('[compile] ERROR:', String(result.error).slice(0, 200));
      return res.status(400).json({ error: result.error, errorDetails: result.errorDetails, errorDetail: result.errorDetail ?? null, errorDetailList: result.errorDetailList ?? null });
    }
    // CAMBIO 2 — oidMap (slug → path completo) viaja junto al html para que el
    // consumidor (PR-2) pueda resolver un data-oid del DOM a su archivo real.
    res.json({ html: result.html, oidMap: result.oidMap ?? {} });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    if (durationMs > 10000) {
      console.warn(`[compile] SLOW: ${durationMs}ms before throw (file count: ${Object.keys(files).length})`);
    }
    console.error('[compile] ERROR:', String(err?.message || err).slice(0, 200));
    res.status(500).json({ error: err.message || 'Unexpected compile error' });
  }
});

// ---------------------------------------------------------------------------
// Phase 3: Managed deployment via Vercel
// ---------------------------------------------------------------------------

app.post('/api/deploy/:projectId', async (req, res) => {
  if (!VERCEL_TOKEN) {
    return res.status(503).json({ error: 'Deployment service not configured' });
  }

  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { files, projectName } = req.body;

  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'files object is required' });
  }

  try {
    // Build Vercel file list with base64 encoding
    const vercelFiles = Object.entries(files).map(([filePath, content]) => ({
      file: filePath,
      data: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }));

    // Initiate Vercel deployment
    const deployResponse = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `nebu-${projectId}`,
        files: vercelFiles,
        projectSettings: { framework: null },
        target: 'production',
      }),
    });

    if (!deployResponse.ok) {
      const errData = await deployResponse.json();
      return res.status(502).json({ error: errData.error?.message || 'Vercel deployment failed' });
    }

    const deployData = await deployResponse.json();
    const deploymentId = deployData.id;

    // Poll for deployment status (max 60s, every 3s)
    let deploymentUrl = null;
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusResponse = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      });
      const statusData = await statusResponse.json();
      if (statusData.readyState === 'READY') {
        deploymentUrl = `https://${statusData.url}`;
        break;
      }
      if (statusData.readyState === 'ERROR') {
        return res.status(502).json({ error: 'Vercel deployment failed during build' });
      }
    }

    if (!deploymentUrl) {
      return res.status(504).json({ error: 'Deployment timed out' });
    }

    // Update forge_projects with deployment info
    if (supabaseAdmin) {
      await supabaseAdmin
        .from('forge_projects')
        .update({ deployment_url: deploymentUrl, last_deployed_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    res.json({ url: deploymentUrl, deploymentId });
  } catch (err) {
    console.error('[Deploy] Error:', err);
    res.status(500).json({ error: 'Deployment failed' });
  }
});

app.get('/api/deploy/:projectId/status', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.json({ status: 'never', url: null, lastDeployedAt: null });
  const { data } = await supabaseAdmin
    .from('forge_projects')
    .select('deployment_url, last_deployed_at')
    .eq('id', projectId)
    .single();
  res.json({
    url: data?.deployment_url ?? null,
    lastDeployedAt: data?.last_deployed_at ?? null,
    status: data?.deployment_url ? 'deployed' : 'never',
  });
});

// ---------------------------------------------------------------------------
// Phase 4: Cloudflare domain management
// ---------------------------------------------------------------------------

const DOMAIN_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}$/;

async function getCloudflarZoneId(domain) {
  // Extract root domain (last two parts)
  const parts = domain.split('.');
  const rootDomain = parts.slice(-2).join('.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json();
  return data.result?.[0]?.id ?? null;
}

app.post('/api/domains/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { domain } = req.body;

  if (!domain || !DOMAIN_REGEX.test(domain)) {
    return res.status(400).json({ error: 'Invalid domain format' });
  }

  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  // Get project's deployment URL
  const { data: project } = await supabaseAdmin
    .from('forge_projects')
    .select('deployment_url')
    .eq('id', projectId)
    .single();

  if (!project?.deployment_url) {
    return res.status(400).json({ error: 'Deploy the project first before adding a domain' });
  }

  // Extract hostname from deployment URL
  const deploymentHostname = new URL(project.deployment_url).hostname;

  if (!CLOUDFLARE_API_KEY) {
    // Insert as pending without CF record
    const { data: domainRow, error } = await supabaseAdmin
      .from('forge_domains')
      .insert({ project_id: projectId, domain, status: 'pending' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ id: domainRow.id, domain, status: 'pending' });
  }

  try {
    const zoneId = await getCloudflarZoneId(domain);
    if (!zoneId) {
      return res.status(400).json({ error: 'Could not find Cloudflare zone for this domain. Make sure your domain is added to Cloudflare.' });
    }

    const cfResponse = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLOUDFLARE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: domain,
        content: deploymentHostname,
        proxied: true,
        ttl: 1,
      }),
    });

    const cfData = await cfResponse.json();
    const cloudflareRecordId = cfData.result?.id ?? null;

    const { data: domainRow, error } = await supabaseAdmin
      .from('forge_domains')
      .insert({ project_id: projectId, domain, status: 'pending', cloudflare_record_id: cloudflareRecordId })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: domainRow.id, domain, status: 'pending' });
  } catch (err) {
    console.error('[Domains] Cloudflare error:', err);
    res.status(500).json({ error: 'Failed to configure domain' });
  }
});

app.get('/api/domains/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.json([]);

  const { data: domains } = await supabaseAdmin
    .from('forge_domains')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (!domains) return res.json([]);

  // Check DNS propagation for pending domains
  const updated = await Promise.all(
    domains.map(async (d) => {
      if (d.status === 'pending') {
        try {
          await dns.resolve(d.domain);
          await supabaseAdmin
            .from('forge_domains')
            .update({ status: 'active' })
            .eq('id', d.id);
          return { ...d, status: 'active' };
        } catch {
          return d;
        }
      }
      return d;
    })
  );

  res.json(updated);
});

app.delete('/api/domains/:domainId', async (req, res) => {
  const { domainId } = req.params;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  // Verify ownership
  const { data: domain } = await supabaseAdmin
    .from('forge_domains')
    .select('*, forge_projects(user_id)')
    .eq('id', domainId)
    .single();

  if (!domain) return res.status(404).json({ error: 'Domain not found' });
  if (domain.forge_projects?.user_id !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Delete from Cloudflare if we have the record ID
  if (CLOUDFLARE_API_KEY && domain.cloudflare_record_id) {
    try {
      const zoneId = await getCloudflarZoneId(domain.domain);
      if (zoneId) {
        await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${domain.cloudflare_record_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${CLOUDFLARE_API_KEY}` },
        });
      }
    } catch (err) {
      console.error('[Domains] Failed to delete CF record:', err);
    }
  }

  await supabaseAdmin.from('forge_domains').delete().eq('id', domainId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Phase 5: Per-project database provisioning
// ---------------------------------------------------------------------------

function generateRandomPassword(length = 24) {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

app.post('/api/db/provision/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  if (!SUPABASE_MANAGEMENT_TOKEN) return res.status(503).json({ error: 'Database provisioning not configured' });

  // Check if already provisioned
  const { data: project } = await supabaseAdmin
    .from('forge_projects')
    .select('supabase_project_ref, supabase_project_url, supabase_anon_key')
    .eq('id', projectId)
    .single();

  if (project?.supabase_project_ref) {
    return res.json({
      projectUrl: project.supabase_project_url,
      anonKey: project.supabase_anon_key,
      provisioned: true,
    });
  }

  try {
    const dbPass = generateRandomPassword(24);
    const projectShortId = projectId.slice(0, 8);

    // Create Supabase project
    const createResponse = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `nebu-${projectShortId}`,
        organization_id: SUPABASE_ORG_ID,
        region: 'us-east-1',
        db_pass: dbPass,
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.json();
      return res.status(502).json({ error: err.message || 'Failed to provision database' });
    }

    const projectData = await createResponse.json();
    const ref = projectData.id;

    // Poll until ACTIVE_HEALTHY (max 3 min, every 10s)
    let status = projectData.status;
    for (let i = 0; i < 18 && status !== 'ACTIVE_HEALTHY'; i++) {
      await new Promise(r => setTimeout(r, 10000));
      const pollResp = await fetch(`https://api.supabase.com/v1/projects/${ref}`, {
        headers: { Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}` },
      });
      const pollData = await pollResp.json();
      status = pollData.status;
    }

    if (status !== 'ACTIVE_HEALTHY') {
      return res.status(504).json({ error: 'Database provisioning timed out' });
    }

    // Get API keys
    const keysResp = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys`, {
      headers: { Authorization: `Bearer ${SUPABASE_MANAGEMENT_TOKEN}` },
    });
    const keys = await keysResp.json();
    const anonKey = keys.find(k => k.name === 'anon')?.api_key ?? '';
    const serviceRoleKey = keys.find(k => k.name === 'service_role')?.api_key ?? '';

    const projectUrl = `https://${ref}.supabase.co`;
    const encryptedServiceKey = encryptAES256(serviceRoleKey);

    // Store in forge_projects
    await supabaseAdmin
      .from('forge_projects')
      .update({
        supabase_project_ref: ref,
        supabase_project_url: projectUrl,
        supabase_anon_key: anonKey,
        supabase_service_role_key_enc: encryptedServiceKey,
      })
      .eq('id', projectId);

    res.json({ projectUrl, anonKey, provisioned: true });
  } catch (err) {
    console.error('[DB Provision] Error:', err);
    res.status(500).json({ error: 'Provisioning failed' });
  }
});

app.get('/api/db/:projectId/credentials', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { data } = await supabaseAdmin
    .from('forge_projects')
    .select('supabase_project_url, supabase_anon_key')
    .eq('id', projectId)
    .single();
  res.json({ projectUrl: data?.supabase_project_url ?? null, anonKey: data?.supabase_anon_key ?? null });
});

app.post('/api/db/:projectId/query', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { sql } = req.body;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  const { data: project } = await supabaseAdmin
    .from('forge_projects')
    .select('supabase_project_url, supabase_service_role_key_enc')
    .eq('id', projectId)
    .single();

  if (!project?.supabase_project_url || !project?.supabase_service_role_key_enc) {
    return res.status(400).json({ error: 'Project database not provisioned' });
  }

  try {
    const serviceRoleKey = decryptAES256(project.supabase_service_role_key_enc);
    const projectClient = createClient(project.supabase_project_url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await projectClient.rpc('exec_sql', { query: sql });
    res.json({ data, error });
  } catch (err) {
    console.error('[DB Query] Error:', err);
    res.status(500).json({ error: 'Query failed' });
  }
});

app.get('/api/db/:projectId/schema', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  const { data: project } = await supabaseAdmin
    .from('forge_projects')
    .select('supabase_project_url, supabase_service_role_key_enc')
    .eq('id', projectId)
    .single();

  if (!project?.supabase_project_url || !project?.supabase_service_role_key_enc) {
    return res.status(400).json({ error: 'Project database not provisioned' });
  }

  try {
    const serviceRoleKey = decryptAES256(project.supabase_service_role_key_enc);
    const projectClient = createClient(project.supabase_project_url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await projectClient
      .from('information_schema.columns')
      .select('table_name, column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .order('table_name')
      .order('ordinal_position');
    res.json({ data, error });
  } catch (err) {
    console.error('[DB Schema] Error:', err);
    res.status(500).json({ error: 'Schema fetch failed' });
  }
});

// ---------------------------------------------------------------------------
// Phase 6: Email service management (Resend)
// ---------------------------------------------------------------------------

app.post('/api/email/setup/:projectId', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { sendingDomain } = req.body;

  if (!RESEND_API_KEY) return res.status(503).json({ error: 'Email service not configured' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  try {
    const response = await fetch('https://api.resend.com/domains', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: sendingDomain }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: data.message || 'Failed to setup sending domain' });
    }

    const { id: resendDomainId, records: dnsRecords } = data;

    await supabaseAdmin.from('forge_email_configs').upsert(
      {
        project_id: projectId,
        sending_domain: sendingDomain,
        resend_domain_id: resendDomainId,
        dns_records: dnsRecords,
        status: 'pending',
      },
      { onConflict: 'project_id' }
    );

    res.json({ dnsRecords, status: 'pending' });
  } catch (err) {
    console.error('[Email Setup] Error:', err);
    res.status(500).json({ error: 'Email setup failed' });
  }
});

app.get('/api/email/:projectId/status', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  const { data: config } = await supabaseAdmin
    .from('forge_email_configs')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (!config) return res.json({ status: null, dnsRecords: [] });

  if (config.status === 'pending' && RESEND_API_KEY) {
    try {
      const response = await fetch(`https://api.resend.com/domains/${config.resend_domain_id}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      const data = await response.json();
      if (data.status === 'verified') {
        await supabaseAdmin
          .from('forge_email_configs')
          .update({ status: 'verified', verified_at: new Date().toISOString() })
          .eq('project_id', projectId);
        return res.json({ status: 'verified', dnsRecords: config.dns_records });
      }
    } catch {
      // keep pending
    }
  }

  res.json({ status: config.status, dnsRecords: config.dns_records });
});

app.post('/api/email/:projectId/send', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { to, templateName, variables } = req.body;

  if (!RESEND_API_KEY) return res.status(503).json({ error: 'Email service not configured' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });

  const { data: config } = await supabaseAdmin
    .from('forge_email_configs')
    .select('sending_domain')
    .eq('project_id', projectId)
    .single();

  const { data: template } = await supabaseAdmin
    .from('forge_email_templates')
    .select('subject, html_body')
    .eq('project_id', projectId)
    .eq('name', templateName)
    .single();

  if (!template) return res.status(404).json({ error: 'Template not found' });

  // Replace {{variable}} placeholders
  let subject = template.subject;
  let htmlBody = template.html_body;
  for (const [key, value] of Object.entries(variables || {})) {
    const re = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(re, value);
    htmlBody = htmlBody.replace(re, value);
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `noreply@${config?.sending_domain || 'mail.nebu.app'}`,
        to,
        subject,
        html: htmlBody,
      }),
    });
    const data = await response.json();
    res.json({ id: data.id, status: response.ok ? 'sent' : 'failed' });
  } catch (err) {
    console.error('[Email Send] Error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// Email templates CRUD
app.get('/api/email/:projectId/templates', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.json([]);
  const { data } = await supabaseAdmin
    .from('forge_email_templates')
    .select('*')
    .eq('project_id', projectId)
    .order('name');
  res.json(data ?? []);
});

app.post('/api/email/:projectId/templates', async (req, res) => {
  const { projectId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { name, subject, html_body } = req.body;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { data, error } = await supabaseAdmin
    .from('forge_email_templates')
    .insert({ project_id: projectId, name, subject, html_body })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/email/:projectId/templates/:templateId', async (req, res) => {
  const { projectId, templateId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  const { name, subject, html_body } = req.body;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { data, error } = await supabaseAdmin
    .from('forge_email_templates')
    .update({ name, subject, html_body })
    .eq('id', templateId)
    .eq('project_id', projectId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/email/:projectId/templates/:templateId', async (req, res) => {
  const { projectId, templateId } = req.params;
  if (!(await requireProjectOwnership(req, res, projectId))) return;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  await supabaseAdmin
    .from('forge_email_templates')
    .delete()
    .eq('id', templateId)
    .eq('project_id', projectId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Phase 6: Stripe credit checkout
// ---------------------------------------------------------------------------

// POST /api/credits/checkout — create a Stripe checkout session
app.post('/api/credits/checkout', async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(503).json({ error: 'Payments not configured' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { packageId, userId } = req.body;
  if (!packageId || !userId) {
    return res.status(400).json({ error: 'packageId and userId are required' });
  }

  try {
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from('forge_credit_packages')
      .select('*')
      .eq('id', packageId)
      .single();

    if (pkgError || !pkg) {
      return res.status(404).json({ error: 'Package not found' });
    }

    if (!pkg.stripe_price_id) {
      return res.status(400).json({ error: 'Package has no Stripe price configured' });
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
      success_url: (process.env.APP_URL || 'http://localhost:3000') + '/forge?checkout=success',
      cancel_url: (process.env.APP_URL || 'http://localhost:3000') + '/forge',
      metadata: {
        userId,
        packageId,
        credits: String(pkg.credits ?? 0),
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('[Stripe] Checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ---------------------------------------------------------------------------
// Deal negotiation endpoints
// ---------------------------------------------------------------------------

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// POST /api/deals/:dealId/send-to-client — developer sends proposal to client
app.post('/api/deals/:dealId/send-to-client', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { dealId } = req.params;

  const { data: deal, error: dealErr } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single();

  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });

  await supabaseAdmin.from('deals').update({ status: 'sent_to_client' }).eq('id', dealId);

  await supabaseAdmin.from('deal_revisions').insert({
    deal_id: dealId,
    revision_number: 1,
    submitted_by: req.userId,
    submitted_by_role: 'developer',
    value: deal.value,
    scope_description: deal.scope_description,
    timeline: deal.timeline,
    status: 'pending',
  });

  if (deal.client_profile_id) {
    await supabaseAdmin.from('notifications').insert({
      user_id: deal.client_profile_id,
      type: 'proposal_sent',
      title: 'New project proposal',
      body: `You have received a proposal for "${deal.title}" worth $${deal.value}`,
      read: false,
    });
  }

  res.json({ success: true });
});

// POST /api/deals/:dealId/revise — either party can revise
app.post('/api/deals/:dealId/revise', async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { dealId } = req.params;
  const { value, scope_description, timeline, note } = req.body;

  const { data: deal, error: dealErr } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single();

  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });

  const isDeveloper = deal.user_id === req.userId;
  const isClient = deal.client_profile_id === req.userId;
  if (!isDeveloper && !isClient) return res.status(403).json({ error: 'Forbidden' });

  const submittedByRole = isDeveloper ? 'developer' : 'client';

  // Supersede existing pending revisions
  await supabaseAdmin
    .from('deal_revisions')
    .update({ status: 'superseded' })
    .eq('deal_id', dealId)
    .eq('status', 'pending');

  // Get max revision_number
  const { data: revisions } = await supabaseAdmin
    .from('deal_revisions')
    .select('revision_number')
    .eq('deal_id', dealId)
    .order('revision_number', { ascending: false })
    .limit(1);

  const nextRevision = (revisions?.[0]?.revision_number ?? 0) + 1;

  await supabaseAdmin.from('deal_revisions').insert({
    deal_id: dealId,
    revision_number: nextRevision,
    submitted_by: req.userId,
    submitted_by_role: submittedByRole,
    value,
    scope_description,
    timeline,
    note,
    status: 'pending',
  });

  if (isClient) {
    await supabaseAdmin.from('deals').update({ status: 'client_revised' }).eq('id', dealId);
    await supabaseAdmin.from('notifications').insert({
      user_id: deal.user_id,
      type: 'proposal_revised',
      title: 'Client revised proposal',
      body: `Client revised the proposal for "${deal.title}"`,
      read: false,
    });
  } else {
    await supabaseAdmin.from('deals').update({ status: 'sent_to_client' }).eq('id', dealId);
    if (deal.client_profile_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: deal.client_profile_id,
        type: 'proposal_sent',
        title: 'Updated proposal received',
        body: `You received an updated proposal for "${deal.title}"`,
        read: false,
      });
    }
  }

  res.json({ success: true });
});

// POST /api/deals/:dealId/accept — only client can accept
app.post('/api/deals/:dealId/accept', async (req, res) => {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  if (!stripeKey) return res.status(503).json({ error: 'Payments not configured' });

  const { dealId } = req.params;

  const { data: deal, error: dealErr } = await supabaseAdmin
    .from('deals')
    .select('*')
    .eq('id', dealId)
    .single();

  if (dealErr || !deal) return res.status(404).json({ error: 'Deal not found' });
  if (deal.client_profile_id !== req.userId) return res.status(403).json({ error: 'Only the client can accept a deal' });
  if (!['sent_to_client', 'developer_reviewing'].includes(deal.status)) {
    return res.status(400).json({ error: 'Deal is not in an acceptable status' });
  }

  await supabaseAdmin.from('deals').update({ status: 'accepted' }).eq('id', dealId);
  await supabaseAdmin
    .from('deal_revisions')
    .update({ status: 'accepted' })
    .eq('deal_id', dealId)
    .eq('status', 'pending');

  const depositAmount = Math.ceil(deal.value * 0.5);

  const { data: payment } = await supabaseAdmin
    .from('payments')
    .insert({
      user_id: deal.user_id,
      project_id: null,
      recipient_profile_id: req.userId,
      amount: depositAmount,
      status: 'pending',
      description: `50% deposit for "${deal.title}"`,
      invoice_number: `DEP-${Date.now()}`,
      deal_id: deal.id,
    })
    .select('id')
    .single();

  const { default: Stripe } = await import('stripe');
  const stripe = new Stripe(stripeKey);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `50% deposit — ${deal.title}` },
        unit_amount: depositAmount * 100,
      },
      quantity: 1,
    }],
    success_url: `${APP_URL}/proposals?deposit=success&deal=${deal.id}`,
    cancel_url: `${APP_URL}/proposals?deposit=cancelled`,
    metadata: {
      type: 'deposit',
      dealId: deal.id,
      developerId: deal.user_id,
      paymentId: payment?.id ?? '',
    },
  });

  await supabaseAdmin
    .from('deals')
    .update({ stripe_checkout_session_id: session.id, deposit_invoice_id: payment?.id })
    .eq('id', dealId);

  await supabaseAdmin.from('notifications').insert({
    user_id: deal.user_id,
    type: 'proposal_accepted',
    title: 'Proposal accepted!',
    body: `Client accepted the proposal for "${deal.title}". Awaiting 50% deposit.`,
    read: false,
  });

  res.json({ checkoutUrl: session.url });
});

// ---------------------------------------------------------------------------
// Embed-and-search — generates a Gemini embedding for a query string and
// performs a vector similarity search against forge_patterns.
// GEMINI_API_KEY=your_key_here  (add to .env alongside the other keys)
// ---------------------------------------------------------------------------
app.post('/api/embed-and-search', requireAuth, async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Embedding not configured', patterns: [] });
    }

    const { query, limit = 5 } = req.body;
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({ error: 'query required' });
    }

    // Generate embedding via Gemini gemini-embedding-001
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] },
          outputDimensionality: 768,
        }),
      }
    );

    if (!geminiRes.ok) {
      return res.status(500).json({ error: 'Embedding API failed', patterns: [] });
    }

    const geminiData = await geminiRes.json();
    const values = geminiData?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
      return res.status(500).json({ error: 'Embedding API failed', patterns: [] });
    }

    // Vector similarity search via Supabase RPC
    const { data, error: rpcError } = await supabaseAdmin.rpc('match_forge_patterns', {
      query_embedding: values,
      match_threshold: 0.3,
      match_count: limit,
    });

    if (rpcError) {
      console.log('[embed-and-search] patterns found:', data?.length ?? 0, '| rpc error:', rpcError.message);
      console.error('[embed-and-search]', rpcError);
      return res.status(500).json({ error: 'Search failed', patterns: [] });
    }

    console.log('[embed-and-search] patterns found:', data?.length ?? 0, '| rpc_status: ok');

    return res.json({ patterns: data ?? [] });
  } catch (err) {
    console.error('[embed-and-search] Unhandled error:', err);
    return res.status(500).json({ error: 'Internal error', patterns: [] });
  }
});

// ---------------------------------------------------------------------------
// Static files + SPA fallback
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // CAMBIO 1 — make the auth posture visible in the Render logs at boot.
  if (supabaseAdmin) {
    console.log('[Auth] AUTH ACTIVE — Supabase admin client configured; sessions are verified.');
  } else if (IS_PRODUCTION) {
    console.error('[Auth] AUTH MISCONFIGURED — production environment but no Supabase admin client; /api/* will fail closed with 503.');
  } else {
    console.warn('[Auth] AUTH DISABLED (dev) — no Supabase admin client; /api/* auth checks are skipped in local dev only.');
  }
});
