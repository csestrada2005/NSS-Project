import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import dns from 'dns/promises';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { compileFiles } from './server/compiler.js';

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
// Auth middleware — validates Supabase session for all /api/* routes
// ---------------------------------------------------------------------------
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  if (!supabaseAdmin) {
    // Dev mode: no admin client configured — skip auth check
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
  }

  res.status(200).send('OK');
});

// Apply auth middleware to all /api/* routes
app.use('/api/', requireAuth);

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

app.get('/api/proxy', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const text = await response.text();
    res.send(text);
  } catch (error) {
    console.error('Error fetching URL:', error);
    res.status(500).json({ error: 'Failed to fetch URL' });
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

app.post('/api/compile', (req, res) => {
  req.setTimeout(30000);
  const { files } = req.body;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ error: 'files object is required' });
  }
  try {
    const result = compileFiles(files);
    if (result.error) {
      console.error('[Compile] Error:', result.error);
      return res.json({ error: result.error });
    }
    res.json({ html: result.html });
  } catch (err) {
    console.error('[Compile] Unexpected error:', err);
    res.status(500).json({ error: 'Compilation failed' });
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
  const { templateId } = req.params;
  const { name, subject, html_body } = req.body;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  const { data, error } = await supabaseAdmin
    .from('forge_email_templates')
    .update({ name, subject, html_body })
    .eq('id', templateId)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/email/:projectId/templates/:templateId', async (req, res) => {
  const { templateId } = req.params;
  if (!supabaseAdmin) return res.status(503).json({ error: 'Database not configured' });
  await supabaseAdmin.from('forge_email_templates').delete().eq('id', templateId);
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
// Static files + SPA fallback
// ---------------------------------------------------------------------------

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
